import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import 'dotenv/config';
import { ApiExceptionFilter } from './utils/api-exception.filter';

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

function parseCsvEnv(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveCorsOrigins(): string[] {
  const configuredOrigins = parseCsvEnv(process.env.CORS_ORIGINS);
  if (configuredOrigins.length > 0) {
    return configuredOrigins;
  }

  return [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'http://[::1]:8000',
  ];
}

function resolveHost(): string {
  return (
    (process.env.HOST ?? process.env.API_HOST ?? '0.0.0.0').trim() || '0.0.0.0'
  );
}

function resolvePort(): number {
  const rawPort = (process.env.PORT ?? process.env.API_PORT ?? '').trim();
  const parsedPort = rawPort ? Number(rawPort) : 3000;
  return Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new ApiExceptionFilter());
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

  // Same-origin production behind Caddy does not need CORS, but local split-origin
  // Docker/dev flows still do.
  app.enableCors({
    origin: resolveCorsOrigins(),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const host = resolveHost();
  const port = resolvePort();
  await app.listen(port, host);
}
void bootstrap();
