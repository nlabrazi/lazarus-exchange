import { Test, TestingModule } from '@nestjs/testing';
import { ExchangeController } from './exchange.controller';
import { ExchangeService } from './exchange.service';
import { ApiRateLimitService } from '../security/api-rate-limit.service';

describe('ExchangeController', () => {
  let controller: ExchangeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExchangeController],
      providers: [
        {
          provide: ExchangeService,
          useValue: {
            parseSessionToken: jest.fn(),
            createSessionTokenForNewUser: jest.fn(),
            createInvite: jest.fn(),
            acceptInvite: jest.fn(),
            uploadFile: jest.fn(),
            getStatus: jest.fn(),
            getPreview: jest.fn(),
            validate: jest.fn(),
            canDownload: jest.fn(),
            getPeerFileDownload: jest.fn(),
            resetSession: jest.fn(),
          },
        },
        {
          provide: ApiRateLimitService,
          useValue: {
            enforceRoute: jest.fn().mockReturnValue('127.0.0.1'),
            enforceUploadBytes: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ExchangeController>(ExchangeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
