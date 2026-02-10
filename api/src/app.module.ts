import { Module } from '@nestjs/common';
import { ExchangeController } from './exchange/exchange.controller';
import { ExchangeService } from './exchange/exchange.service';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'ui'),
    }),
  ],
  controllers: [ExchangeController],
  providers: [ExchangeService],
})
export class AppModule {}
