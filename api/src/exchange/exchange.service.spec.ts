import { Test, TestingModule } from '@nestjs/testing';
import { ExchangeFilePolicyService } from './exchange-file-policy.service';
import { ExchangePreviewService } from './exchange-preview.service';
import { ExchangeService } from './exchange.service';

describe('ExchangeService', () => {
  let service: ExchangeService;

  beforeEach(async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      'supabase_service_role_key_for_tests_only_1234567890';
    process.env.JWT_SECRET = 'jwt_secret_for_tests_only_12345678901234567890';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExchangeService,
        ExchangeFilePolicyService,
        ExchangePreviewService,
      ],
    }).compile();

    service = module.get<ExchangeService>(ExchangeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
