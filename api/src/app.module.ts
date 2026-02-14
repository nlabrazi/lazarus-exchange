import { Module } from '@nestjs/common';
import { ExchangeController } from './exchange/exchange.controller';
import { ExchangeService } from './exchange/exchange.service';
import { ExchangeFilePolicyService } from './exchange/exchange-file-policy.service';
import { ExchangePreviewService } from './exchange/exchange-preview.service';
import { HealthController } from './health/health.controller';
import { ApiRateLimitService } from './security/api-rate-limit.service';
import { RouteRateLimitGuard } from './security/route-rate-limit.guard';

@Module({
  imports: [],
  controllers: [ExchangeController, HealthController],
  providers: [
    ExchangeService,
    ExchangeFilePolicyService,
    ExchangePreviewService,
    ApiRateLimitService,
    RouteRateLimitGuard,
  ],
})
export class AppModule {}
