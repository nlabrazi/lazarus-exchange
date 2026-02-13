import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

type StoredFileMeta = {
  originalname: string;
  mimetype: string;
  size: number;
  path: string;
  uploadedAt: number;
};

type FileData = {
  file?: StoredFileMeta;
  validated?: boolean;
};

type SessionData = {
  users: Record<string, FileData>;
};

type DailyUsage = {
  count: number;
  bytes: number;
};

type SessionIdentity = {
  sessionId: string;
  userId: string;
};

type SessionTokenPayload = {
  v: 1;
  s: string;
  u: string;
  e: number;
  iat: number;
  exp: number;
};

type InviteData = {
  sessionId: string;
  creatorUserId: string;
  expiresAt: number;
};

const BUCKET = process.env.SUPABASE_BUCKET ?? 'exchange';
const MAX_UPLOADS_PER_DAY = Number(process.env.MAX_UPLOADS_PER_DAY ?? 15);
const MAX_MB_PER_DAY = Number(process.env.MAX_MB_PER_DAY ?? 200);
const MAX_BYTES_PER_DAY = MAX_MB_PER_DAY * 1024 * 1024;
const DEFAULT_JWT_TTL_SECONDS = 60 * 60 * 24 * 7;
const DEFAULT_INVITE_TTL_SECONDS = 60 * 15;
const INVITE_CODE_LENGTH = 10;
const INVITE_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

@Injectable()
export class ExchangeService {
  private readonly logger = new Logger(ExchangeService.name);
  private readonly sessions = new Map<string, SessionData>();
  private readonly dailyUsage = new Map<string, DailyUsage>();
  private readonly supabase: ReturnType<typeof createClient>;
  private readonly sessionEpoch = new Map<string, number>();
  private readonly invites = new Map<string, InviteData>();
  private readonly inviteBySession = new Map<string, string>();
  private readonly tokenSecret: string;
  private readonly tokenTtlSeconds: number;
  private readonly inviteTtlSeconds: number;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment',
      );
    }

    this.supabase = createClient(url, key, { auth: { persistSession: false } });
    this.tokenSecret = (process.env.JWT_SECRET ?? '').trim() || key;

    const configuredTtl = Number(
      process.env.JWT_TTL_SECONDS ?? DEFAULT_JWT_TTL_SECONDS,
    );
    this.tokenTtlSeconds =
      Number.isFinite(configuredTtl) && configuredTtl > 0
        ? Math.floor(configuredTtl)
        : DEFAULT_JWT_TTL_SECONDS;

    const configuredInviteTtl = Number(
      process.env.INVITE_TTL_SECONDS ?? DEFAULT_INVITE_TTL_SECONDS,
    );
    this.inviteTtlSeconds =
      Number.isFinite(configuredInviteTtl) && configuredInviteTtl > 0
        ? Math.floor(configuredInviteTtl)
        : DEFAULT_INVITE_TTL_SECONDS;
  }

  private generateId(prefix: 's' | 'u'): string {
    return `${prefix}_${Math.random().toString(36).substring(2, 8)}`;
  }

  private generateInviteCode(): string {
    const bytes = randomBytes(INVITE_CODE_LENGTH);
    let code = '';
    for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
      const idx = bytes[i] % INVITE_ALPHABET.length;
      code += INVITE_ALPHABET[idx];
    }
    return code;
  }

  private isSessionId(value: unknown): value is string {
    return typeof value === 'string' && /^s_[a-z0-9]+$/i.test(value);
  }

  private isUserId(value: unknown): value is string {
    return typeof value === 'string' && /^u_[a-z0-9]+$/i.test(value);
  }

  private base64UrlEncode(input: string): string {
    return Buffer.from(input, 'utf8').toString('base64url');
  }

  private base64UrlDecode(input: string): string {
    try {
      return Buffer.from(input, 'base64url').toString('utf8');
    } catch {
      throw new HttpException('Invalid session token', HttpStatus.UNAUTHORIZED);
    }
  }

  private signature(unsignedToken: string): string {
    return createHmac('sha256', this.tokenSecret)
      .update(unsignedToken)
      .digest('base64url');
  }

  private safeEqual(a: string, b: string): boolean {
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);
    if (aBuffer.length !== bBuffer.length) return false;
    return timingSafeEqual(aBuffer, bBuffer);
  }

  // Tokens carry a session epoch so a reset can revoke every issued token in O(1).
  private currentSessionEpoch(sessionId: string): number {
    return this.sessionEpoch.get(sessionId) ?? 1;
  }

  private bumpSessionEpoch(sessionId: string): number {
    const next = this.currentSessionEpoch(sessionId) + 1;
    this.sessionEpoch.set(sessionId, next);
    this.logger.log(`token_epoch_bumped session=${sessionId} epoch=${next}`);
    return next;
  }

  private createSessionToken(
    sessionId: string,
    userId: string,
    epoch: number,
    iat: number,
    exp: number,
  ): string {
    const payload: SessionTokenPayload = {
      v: 1,
      s: sessionId,
      u: userId,
      e: epoch,
      iat,
      exp,
    };

    const header = this.base64UrlEncode(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    );
    const payloadEncoded = this.base64UrlEncode(JSON.stringify(payload));
    const unsigned = `${header}.${payloadEncoded}`;
    const sig = this.signature(unsigned);

    return `${unsigned}.${sig}`;
  }

  private createSessionInvite(sessionId: string, creatorUserId: string) {
    this.cleanupExpiredInvites();

    // Reuse an unexpired invite for the same session to reduce churn on hot UIs.
    const currentCode = this.inviteBySession.get(sessionId);
    if (currentCode) {
      const currentInvite = this.invites.get(currentCode);
      if (currentInvite && Date.now() < currentInvite.expiresAt) {
        return { inviteCode: currentCode, expiresAt: currentInvite.expiresAt };
      }
      this.removeInvite(currentCode);
    }

    let inviteCode = this.generateInviteCode();
    while (this.invites.has(inviteCode)) {
      inviteCode = this.generateInviteCode();
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAt = (nowSec + this.inviteTtlSeconds) * 1000;

    this.invites.set(inviteCode, { sessionId, creatorUserId, expiresAt });
    this.inviteBySession.set(sessionId, inviteCode);

    this.logger.log(
      `invite_created session=${sessionId} creator=${creatorUserId} code=${inviteCode}`,
    );

    return { inviteCode, expiresAt };
  }

  private revokeSessionInvite(sessionId: string): void {
    const inviteCode = this.inviteBySession.get(sessionId);
    if (!inviteCode) return;
    this.removeInvite(inviteCode);
    this.logger.log(`invite_revoked session=${sessionId} code=${inviteCode}`);
  }

  private removeInvite(inviteCode: string): void {
    const invite = this.invites.get(inviteCode);
    if (!invite) return;

    this.invites.delete(inviteCode);
    if (this.inviteBySession.get(invite.sessionId) === inviteCode) {
      this.inviteBySession.delete(invite.sessionId);
    }
  }

  private cleanupExpiredInvites(): void {
    const nowMs = Date.now();
    for (const [inviteCode, invite] of this.invites.entries()) {
      if (nowMs < invite.expiresAt) continue;
      this.removeInvite(inviteCode);
      this.logger.log(
        `invite_expired session=${invite.sessionId} creator=${invite.creatorUserId} code=${inviteCode}`,
      );
    }
  }

  private issueSessionToken(
    sessionId: string,
    userId: string,
    reason: string,
  ): SessionIdentity & { token: string; expiresAt: number } {
    const nowSec = Math.floor(Date.now() / 1000);
    const exp = nowSec + this.tokenTtlSeconds;
    const epoch = this.currentSessionEpoch(sessionId);
    const token = this.createSessionToken(
      sessionId,
      userId,
      epoch,
      nowSec,
      exp,
    );

    this.logger.log(
      `token_issued session=${sessionId} user=${userId} epoch=${epoch} reason=${reason}`,
    );

    return { sessionId, userId, token, expiresAt: exp * 1000 };
  }

  private parsePayload(payloadEncoded: string): SessionTokenPayload {
    let payload: unknown = null;
    try {
      payload = JSON.parse(this.base64UrlDecode(payloadEncoded));
    } catch {
      throw new HttpException('Invalid session token', HttpStatus.UNAUTHORIZED);
    }

    if (!payload || typeof payload !== 'object') {
      throw new HttpException('Invalid session token', HttpStatus.UNAUTHORIZED);
    }

    const candidate = payload as Partial<SessionTokenPayload>;
    const nowSec = Math.floor(Date.now() / 1000);

    if (candidate.v !== 1) {
      throw new HttpException('Invalid session token', HttpStatus.UNAUTHORIZED);
    }
    if (!this.isSessionId(candidate.s) || !this.isUserId(candidate.u)) {
      throw new HttpException('Invalid session token', HttpStatus.UNAUTHORIZED);
    }
    if (
      typeof candidate.e !== 'number' ||
      !Number.isInteger(candidate.e) ||
      candidate.e < 1
    ) {
      throw new HttpException('Invalid session token', HttpStatus.UNAUTHORIZED);
    }
    if (typeof candidate.exp !== 'number' || nowSec >= candidate.exp) {
      throw new HttpException('Session token expired', HttpStatus.UNAUTHORIZED);
    }
    if (typeof candidate.iat !== 'number' || candidate.iat > nowSec + 60) {
      throw new HttpException('Invalid session token', HttpStatus.UNAUTHORIZED);
    }

    return {
      v: 1,
      s: candidate.s,
      u: candidate.u,
      e: candidate.e,
      iat: candidate.iat,
      exp: candidate.exp,
    };
  }

  parseSessionToken(token: string): SessionIdentity {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
      throw new HttpException('Invalid session token', HttpStatus.UNAUTHORIZED);
    }

    const [headerEncoded, payloadEncoded, signature] = parts;
    const unsigned = `${headerEncoded}.${payloadEncoded}`;
    const expectedSignature = this.signature(unsigned);

    if (!this.safeEqual(expectedSignature, signature)) {
      throw new HttpException('Invalid session token', HttpStatus.UNAUTHORIZED);
    }

    let header: unknown = null;
    try {
      header = JSON.parse(this.base64UrlDecode(headerEncoded));
    } catch {
      throw new HttpException('Invalid session token', HttpStatus.UNAUTHORIZED);
    }

    if (
      !header ||
      typeof header !== 'object' ||
      (header as { alg?: string }).alg !== 'HS256' ||
      (header as { typ?: string }).typ !== 'JWT'
    ) {
      throw new HttpException('Invalid session token', HttpStatus.UNAUTHORIZED);
    }

    const payload = this.parsePayload(payloadEncoded);
    if (payload.e !== this.currentSessionEpoch(payload.s)) {
      throw new HttpException('Session token revoked', HttpStatus.UNAUTHORIZED);
    }

    return { sessionId: payload.s, userId: payload.u };
  }

  createSessionTokenForNewUser(): SessionIdentity & {
    token: string;
    expiresAt: number;
  } {
    const sessionId = this.generateId('s');
    const userId = this.generateId('u');
    return this.issueSessionToken(sessionId, userId, 'auth_new');
  }

  createInvite(
    sessionId: string,
    userId: string,
  ): {
    inviteCode: string;
    expiresAt: number;
  } {
    return this.createSessionInvite(sessionId, userId);
  }

  acceptInvite(
    inviteCode: string,
  ): SessionIdentity & { token: string; expiresAt: number } {
    this.cleanupExpiredInvites();

    const invite = this.invites.get(inviteCode);
    if (!invite) {
      throw new HttpException(
        'Invite link is invalid or expired',
        HttpStatus.GONE,
      );
    }

    const nowMs = Date.now();
    if (nowMs >= invite.expiresAt) {
      this.removeInvite(inviteCode);
      throw new HttpException(
        'Invite link is invalid or expired',
        HttpStatus.GONE,
      );
    }

    const session = this.getOrCreateSession(invite.sessionId);
    let hasPeerAlready = false;
    for (const existingUserId in session.users) {
      if (existingUserId !== invite.creatorUserId) {
        hasPeerAlready = true;
        break;
      }
    }
    if (hasPeerAlready) {
      throw new HttpException(
        'Session already has a peer',
        HttpStatus.CONFLICT,
      );
    }

    let userId = this.generateId('u');
    while (session.users[userId] || userId === invite.creatorUserId) {
      userId = this.generateId('u');
    }

    session.users[userId] = session.users[userId] ?? {};
    this.removeInvite(inviteCode);
    this.logger.log(
      `invite_accepted session=${invite.sessionId} creator=${invite.creatorUserId} user=${userId}`,
    );

    return this.issueSessionToken(invite.sessionId, userId, 'invite_accept');
  }

  private todayKey(userId: string): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}:${userId}`;
  }

  private enforceDailyLimits(userId: string, sizeBytes: number): void {
    const key = this.todayKey(userId);
    const usage = this.dailyUsage.get(key) ?? { count: 0, bytes: 0 };

    if (usage.count + 1 > MAX_UPLOADS_PER_DAY) {
      throw new HttpException(
        `Daily upload limit reached (${MAX_UPLOADS_PER_DAY}/day)`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (usage.bytes + sizeBytes > MAX_BYTES_PER_DAY) {
      throw new HttpException(
        `Daily bandwidth limit reached (${MAX_MB_PER_DAY}MB/day)`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    usage.count += 1;
    usage.bytes += sizeBytes;
    this.dailyUsage.set(key, usage);
  }

  private getOrCreateSession(sessionId: string): SessionData {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = { users: {} };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  private getPeerId(sessionId: string, userId: string): string | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    // Polling calls this often: iterate once without allocating temporary arrays.
    for (const id in session.users) {
      if (id !== userId) return id;
    }
    return null;
  }

  private safeFileName(name: string): string {
    return name.replace(/[^\w.\-() ]+/g, '_').slice(0, 180);
  }

  private buildPath(sessionId: string, userId: string, originalname: string) {
    const stamp = Date.now();
    const safe = this.safeFileName(originalname);
    return `exchange/${sessionId}/${userId}/${stamp}-${safe}`;
  }

  private throwStorageError(prefix: string, error: unknown): never {
    throw new HttpException(
      `${prefix}: ${this.getErrorMessage(error)}`,
      HttpStatus.BAD_GATEWAY,
    );
  }

  private getErrorMessage(err: unknown): string {
    if (typeof err === 'object' && err !== null && 'message' in err) {
      const msg = (err as { message?: unknown }).message;
      if (typeof msg === 'string') return msg;
    }
    return 'Unknown error';
  }

  async uploadFile(
    sessionId: string,
    userId: string,
    file: Express.Multer.File,
  ): Promise<void> {
    this.enforceDailyLimits(userId, file.size);

    const session = this.getOrCreateSession(sessionId);
    session.users[userId] = session.users[userId] ?? {};

    const previousPath = session.users[userId].file?.path;
    if (previousPath) {
      const { error } = await this.supabase.storage
        .from(BUCKET)
        .remove([previousPath]);

      if (error) this.throwStorageError('Supabase remove failed', error);
    }

    const path = this.buildPath(sessionId, userId, file.originalname);

    const { error } = await this.supabase.storage
      .from(BUCKET)
      .upload(path, file.buffer, {
        contentType: file.mimetype || 'application/octet-stream',
        upsert: true,
      });

    if (error) this.throwStorageError('Supabase upload failed', error);

    session.users[userId].file = {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path,
      uploadedAt: Date.now(),
    };

    session.users[userId].validated = false;
  }

  getStatus(sessionId: string, userId: string) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.users[userId]) return null;

    const me = session.users[userId];
    const peerId = this.getPeerId(sessionId, userId);
    const peer = peerId ? session.users[peerId] : null;

    return {
      me: { uploaded: Boolean(me.file), validated: Boolean(me.validated) },
      peer: peer
        ? { uploaded: Boolean(peer.file), validated: Boolean(peer.validated) }
        : null,
    };
  }

  getPreview(sessionId: string, userId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const peerId = this.getPeerId(sessionId, userId);
    const peer = peerId ? session.users[peerId] : null;
    const meta = peer?.file;
    if (!meta) return null;

    return {
      originalname: meta.originalname,
      size: meta.size,
      mimetype: meta.mimetype,
    };
  }

  validate(sessionId: string, userId: string) {
    const session = this.getOrCreateSession(sessionId);
    session.users[userId] = session.users[userId] ?? {};
    session.users[userId].validated = true;
    return true;
  }

  canDownload(sessionId: string, userId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.users[userId]) return false;

    const peerId = this.getPeerId(sessionId, userId);
    if (!peerId) return false;

    const me = session.users[userId];
    const peer = session.users[peerId];

    return Boolean(me.validated && me.file && peer.validated && peer.file);
  }

  async getPeerFileDownload(
    sessionId: string,
    userId: string,
  ): Promise<{
    originalname: string;
    mimetype: string;
    bytes: Uint8Array;
  } | null> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.users[userId]) return null;

    const peerId = this.getPeerId(sessionId, userId);
    if (!peerId) return null;

    const meta = session.users[peerId]?.file;
    if (!meta) return null;

    const { data, error } = await this.supabase.storage
      .from(BUCKET)
      .createSignedUrl(meta.path, 60);

    if (error) this.throwStorageError('Supabase signed URL failed', error);
    if (!data?.signedUrl) {
      throw new HttpException(
        'Supabase signed URL missing',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const resp = await fetch(data.signedUrl);
    if (!resp.ok) {
      throw new HttpException(
        `Download failed with status ${resp.status}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const arrayBuffer = await resp.arrayBuffer();

    return {
      originalname: meta.originalname,
      mimetype: meta.mimetype,
      bytes: new Uint8Array(arrayBuffer),
    };
  }

  async resetSession(sessionId: string, userId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.users[userId]) return false;

    const paths: string[] = [];
    for (const userKey in session.users) {
      const p = session.users[userKey]?.file?.path;
      if (p) paths.push(p);
    }

    if (paths.length > 0) {
      const { error } = await this.supabase.storage.from(BUCKET).remove(paths);
      if (error) this.throwStorageError('Supabase remove failed', error);
    }

    this.revokeSessionInvite(sessionId);
    this.bumpSessionEpoch(sessionId);
    this.sessions.delete(sessionId);
    this.logger.log(`session_reset session=${sessionId} actor=${userId}`);
    return true;
  }
}
