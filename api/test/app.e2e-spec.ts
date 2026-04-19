import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { ExchangeController } from './../src/exchange/exchange.controller';
import { HealthController } from './../src/health/health.controller';

type MockResponse = {
  headers: Record<string, string>;
  statusCode: number;
  payload: unknown;
  setHeader: (name: string, value: string) => void;
  status: (code: number) => MockResponse;
  json: (body: unknown) => MockResponse;
};

function createMockResponse(): MockResponse {
  const response: MockResponse = {
    headers: {},
    statusCode: 200,
    payload: null,
    setHeader(name: string, value: string) {
      response.headers[name] = value;
    },
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(body: unknown) {
      response.payload = body;
      return response;
    },
  };

  return response;
}

describe('App API integration (e2e)', () => {
  let moduleFixture: TestingModule;
  let exchangeController: ExchangeController;
  let healthController: HealthController;

  beforeEach(async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      'supabase_service_role_key_for_tests_only_1234567890';
    process.env.JWT_SECRET = 'jwt_secret_for_tests_only_12345678901234567890';

    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    exchangeController = moduleFixture.get(ExchangeController);
    healthController = moduleFixture.get(HealthController);
  });

  afterEach(async () => {
    await moduleFixture.close();
  });

  it('/health (GET)', () => {
    const response = createMockResponse();

    healthController.health(response as never);

    expect(response.headers['Cache-Control']).toBe('no-store');
    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(response.payload).toEqual({ ok: true });
  });

  it('/exchange/auth/new (POST)', () => {
    const result = exchangeController.createToken();

    expect(result).toEqual(
      expect.objectContaining({
        sessionId: expect.stringMatching(/^s_[a-z0-9]+$/i),
        userId: expect.stringMatching(/^u_[a-z0-9]+$/i),
        token: expect.any(String),
        expiresAt: expect.any(Number),
      }),
    );
  });
});
