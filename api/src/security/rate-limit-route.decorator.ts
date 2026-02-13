import { SetMetadata } from '@nestjs/common';
import { RateLimitedRoute } from './api-rate-limit.service';

export const RATE_LIMIT_ROUTE_KEY = 'rate_limit_route';

export const RateLimitRoute = (route: RateLimitedRoute) =>
  SetMetadata(RATE_LIMIT_ROUTE_KEY, route);
