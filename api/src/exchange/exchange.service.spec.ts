import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ExchangeFilePolicyService } from './exchange-file-policy.service';
import { ExchangePreviewService } from './exchange-preview.service';
import { ExchangeService } from './exchange.service';

describe('ExchangeService', () => {
  let module: TestingModule;
  let service: ExchangeService;

  async function buildModule() {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      'supabase_service_role_key_for_tests_only_1234567890';
    process.env.JWT_SECRET = 'jwt_secret_for_tests_only_12345678901234567890';

    module = await Test.createTestingModule({
      providers: [
        ExchangeService,
        ExchangeFilePolicyService,
        ExchangePreviewService,
      ],
    }).compile();

    service = module.get<ExchangeService>(ExchangeService);
  }

  beforeEach(async () => {
    delete process.env.JWT_TTL_SECONDS;
    await buildModule();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await module.close();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates an initial empty session state on auth_new', () => {
    const issued = service.createSessionTokenForNewUser();

    expect(service.getStatus(issued.sessionId, issued.userId)).toEqual({
      me: {
        uploaded: false,
        validated: false,
        fileId: null,
        previewReady: false,
      },
      peer: null,
    });
  });

  it('expires in-memory session state when the token lifetime is exceeded', async () => {
    await module.close();

    process.env.JWT_TTL_SECONDS = '1';
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_700_000_000_000);

    await buildModule();

    const issued = service.createSessionTokenForNewUser();
    expect(service.getStatus(issued.sessionId, issued.userId)).not.toBeNull();

    nowSpy.mockReturnValue(issued.expiresAt + 1);
    expect(service.getStatus(issued.sessionId, issued.userId)).toBeNull();
  });

  it('rejects validation when the current user has not uploaded a file yet', () => {
    const issued = service.createSessionTokenForNewUser();

    try {
      service.validate(issued.sessionId, issued.userId);
      fail('validate should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect((error as HttpException).message).toBe(
        'Upload a file before validating',
      );
    }
  });
});
