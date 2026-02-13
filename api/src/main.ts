import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import 'dotenv/config';

type TrustProxyConfigurable = {
  set: (key: string, value: unknown) => unknown;
};

function canConfigureTrustProxy(
  candidate: unknown,
): candidate is TrustProxyConfigurable {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    'set' in candidate &&
    typeof (candidate as { set?: unknown }).set === 'function'
  );
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const trustProxyValue = (process.env.TRUST_PROXY ?? '').trim().toLowerCase();
  if (
    trustProxyValue === '1' ||
    trustProxyValue === 'true' ||
    trustProxyValue === 'yes'
  ) {
    const adapterInstance: unknown = app.getHttpAdapter().getInstance();
    if (canConfigureTrustProxy(adapterInstance)) {
      adapterInstance.set('trust proxy', 1);
    }
  }

  // Autorise la UI locale (serve -s ui -l 5173)
  app.enableCors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}
void bootstrap();
