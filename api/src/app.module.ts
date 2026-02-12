import { Module } from '@nestjs/common';
import { ExchangeController } from './exchange/exchange.controller';
import { ExchangeService } from './exchange/exchange.service';
import { HealthController } from './health/health.controller';

@Module({
  imports: [],
  controllers: [ExchangeController, HealthController],
  providers: [ExchangeService],
})
export class AppModule { }
