import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import {
  ApiRateLimitService,
  RateLimitedRoute,
} from './api-rate-limit.service';
import { RATE_LIMIT_ROUTE_KEY } from './rate-limit-route.decorator';

type RateLimitedRequest = Request & { rateLimitIp?: string };

@Injectable()
export class RouteRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiRateLimitService: ApiRateLimitService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const route = this.reflector.getAllAndOverride<
      RateLimitedRoute | undefined
    >(RATE_LIMIT_ROUTE_KEY, [context.getHandler(), context.getClass()]);
    if (!route) return true;

    const request = context.switchToHttp().getRequest<RateLimitedRequest>();
    request.rateLimitIp = this.apiRateLimitService.enforceRoute(route, request);
    return true;
  }
}
