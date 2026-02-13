import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Request } from 'express';

export type RateLimitedRoute = 'auth_new' | 'upload' | 'invite_accept';

type RouteLimits = {
  perMinute: number;
  perDay: number;
};

type WindowCounter = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 60_000;
const WINDOW_CLEANUP_INTERVAL_MS = 30_000;

const DEFAULT_ROUTE_LIMITS: Record<RateLimitedRoute, RouteLimits> = {
  auth_new: { perMinute: 6, perDay: 120 },
  upload: { perMinute: 6, perDay: 80 },
  invite_accept: { perMinute: 12, perDay: 180 },
};

const DEFAULT_UPLOAD_IP_MAX_MB_PER_DAY = 300;

@Injectable()
export class ApiRateLimitService {
  private readonly windowCounters = new Map<string, WindowCounter>();
  private readonly dailyCounters = new Map<string, number>();
  private readonly uploadDailyBytes = new Map<string, number>();
  private readonly routeLimits: Record<RateLimitedRoute, RouteLimits>;
  private readonly uploadMaxBytesPerDay: number;
  private readonly trustProxy: boolean;
  private activeDay = this.dayStamp(Date.now());
  private lastWindowCleanupAt = 0;

  constructor() {
    this.routeLimits = {
      auth_new: {
        perMinute: this.readPositiveInt(
          'RL_AUTH_NEW_PER_MINUTE',
          DEFAULT_ROUTE_LIMITS.auth_new.perMinute,
        ),
        perDay: this.readPositiveInt(
          'RL_AUTH_NEW_PER_DAY',
          DEFAULT_ROUTE_LIMITS.auth_new.perDay,
        ),
      },
      upload: {
        perMinute: this.readPositiveInt(
          'RL_UPLOAD_PER_MINUTE',
          DEFAULT_ROUTE_LIMITS.upload.perMinute,
        ),
        perDay: this.readPositiveInt(
          'RL_UPLOAD_PER_DAY',
          DEFAULT_ROUTE_LIMITS.upload.perDay,
        ),
      },
      invite_accept: {
        perMinute: this.readPositiveInt(
          'RL_INVITE_ACCEPT_PER_MINUTE',
          DEFAULT_ROUTE_LIMITS.invite_accept.perMinute,
        ),
        perDay: this.readPositiveInt(
          'RL_INVITE_ACCEPT_PER_DAY',
          DEFAULT_ROUTE_LIMITS.invite_accept.perDay,
        ),
      },
    };

    const uploadMaxMbPerDay = this.readPositiveInt(
      'RL_UPLOAD_IP_MAX_MB_PER_DAY',
      DEFAULT_UPLOAD_IP_MAX_MB_PER_DAY,
    );
    this.uploadMaxBytesPerDay = uploadMaxMbPerDay * 1024 * 1024;
    this.trustProxy = this.isTruthy(process.env.TRUST_PROXY);
  }

  enforceRoute(route: RateLimitedRoute, request: Request): string {
    const nowMs = Date.now();
    this.rotateDailyBuckets(nowMs);
    this.cleanupWindowCounters(nowMs);

    const ip = this.extractClientIp(request);
    const limits = this.routeLimits[route];

    this.consumeWindow(route, ip, limits.perMinute, nowMs);
    this.consumeDaily(route, ip, limits.perDay);

    return ip;
  }

  enforceUploadBytes(ip: string, sizeBytes: number): void {
    const safeBytes =
      Number.isFinite(sizeBytes) && sizeBytes > 0 ? Math.floor(sizeBytes) : 0;
    if (safeBytes === 0) return;

    const key = `${this.activeDay}:upload_bytes:${ip}`;
    const currentBytes = this.uploadDailyBytes.get(key) ?? 0;

    if (currentBytes + safeBytes > this.uploadMaxBytesPerDay) {
      throw new HttpException(
        `Daily upload size limit reached (${Math.floor(this.uploadMaxBytesPerDay / (1024 * 1024))}MB/day per IP)`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.uploadDailyBytes.set(key, currentBytes + safeBytes);
  }

  private consumeWindow(
    route: RateLimitedRoute,
    ip: string,
    maxRequests: number,
    nowMs: number,
  ): void {
    const key = `${route}:${ip}`;
    const counter = this.windowCounters.get(key);

    if (!counter || nowMs >= counter.resetAt) {
      this.windowCounters.set(key, { count: 1, resetAt: nowMs + WINDOW_MS });
      return;
    }

    if (counter.count + 1 > maxRequests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((counter.resetAt - nowMs) / 1000),
      );
      throw new HttpException(
        `Too many requests on ${this.routePath(route)}. Retry in about ${retryAfterSeconds}s`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    counter.count += 1;
  }

  private consumeDaily(
    route: RateLimitedRoute,
    ip: string,
    maxRequests: number,
  ): void {
    const key = `${this.activeDay}:${route}:${ip}`;
    const currentCount = this.dailyCounters.get(key) ?? 0;

    if (currentCount + 1 > maxRequests) {
      throw new HttpException(
        `Daily rate limit reached on ${this.routePath(route)} (${maxRequests}/day per IP)`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.dailyCounters.set(key, currentCount + 1);
  }

  private cleanupWindowCounters(nowMs: number): void {
    if (nowMs - this.lastWindowCleanupAt < WINDOW_CLEANUP_INTERVAL_MS) return;

    this.lastWindowCleanupAt = nowMs;
    for (const [key, counter] of this.windowCounters.entries()) {
      if (nowMs >= counter.resetAt) {
        this.windowCounters.delete(key);
      }
    }
  }

  private rotateDailyBuckets(nowMs: number): void {
    const currentDay = this.dayStamp(nowMs);
    if (currentDay === this.activeDay) return;

    this.activeDay = currentDay;
    this.dailyCounters.clear();
    this.uploadDailyBytes.clear();
  }

  private extractClientIp(request: Request): string {
    const forwardedIp = this.firstForwardedIp(
      request.headers['x-forwarded-for'],
    );
    const rawIp =
      this.trustProxy && forwardedIp
        ? forwardedIp
        : (request.ip ?? request.socket.remoteAddress ?? '');

    const normalized = rawIp.replace(/^::ffff:/, '').trim();
    return normalized ? normalized.slice(0, 80) : 'unknown';
  }

  private firstForwardedIp(header: string | string[] | undefined): string {
    if (!header) return '';
    const source = Array.isArray(header) ? header[0] : header;
    const first = source.split(',')[0] ?? '';
    return first.trim();
  }

  private dayStamp(nowMs: number): string {
    const d = new Date(nowMs);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private routePath(route: RateLimitedRoute): string {
    switch (route) {
      case 'auth_new':
        return '/exchange/auth/new';
      case 'upload':
        return '/exchange/upload';
      case 'invite_accept':
        return '/exchange/invite/accept/:inviteCode';
      default:
        return '/exchange';
    }
  }

  private readPositiveInt(envKey: string, fallback: number): number {
    const candidate = Number(process.env[envKey]);
    if (!Number.isFinite(candidate) || candidate <= 0) {
      return fallback;
    }
    return Math.floor(candidate);
  }

  private isTruthy(value: string | undefined): boolean {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return (
      normalized === '1' ||
      normalized === 'true' ||
      normalized === 'yes' ||
      normalized === 'on'
    );
  }
}
