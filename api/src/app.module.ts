import { Module } from '@nestjs/common';
import { ExchangeController } from './exchange/exchange.controller';
import { ExchangeService } from './exchange/exchange.service';
import { HealthController } from './health/health.controller';
// import { ServeStaticModule } from '@nestjs/serve-static';
// import { join } from 'path';

@Module({
  imports: [],
  // imports: [
  //   ServeStaticModule.forRoot({
  //     rootPath: join(__dirname, '..', '..', 'ui'),
  //   }),
  // ],
  controllers: [ExchangeController, HealthController],
  providers: [ExchangeService],
})
export class AppModule { }
