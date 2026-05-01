import { Test, type TestingModule } from '@nestjs/testing';
import { ApiRateLimitService } from '../security/api-rate-limit.service';
import { ExchangeController } from './exchange.controller';
import { ExchangeService } from './exchange.service';

type MockResponse = {
  statusCode: number;
  payload: unknown;
  status: jest.Mock;
  json: jest.Mock;
  set: jest.Mock;
  send: jest.Mock;
};

function createMockResponse(): MockResponse {
  const response = {} as MockResponse;
  response.statusCode = 200;
  response.payload = null;
  response.status = jest.fn((code: number) => {
    response.statusCode = code;
    return response;
  });
  response.json = jest.fn((body: unknown) => {
    response.payload = body;
    return response;
  });
  response.set = jest.fn();
  response.send = jest.fn();

  return response;
}

describe('ExchangeController', () => {
  let controller: ExchangeController;
  let exchangeService: {
    parseSessionToken: jest.Mock;
    createSessionTokenForNewUser: jest.Mock;
    createInvite: jest.Mock;
    acceptInvite: jest.Mock;
    uploadFile: jest.Mock;
    getStatus: jest.Mock;
    getPreview: jest.Mock;
    getPreviewSignedUrl: jest.Mock;
    validate: jest.Mock;
    canDownload: jest.Mock;
    getPeerFileDownload: jest.Mock;
    resetSession: jest.Mock;
  };

  beforeEach(async () => {
    exchangeService = {
      parseSessionToken: jest.fn(),
      createSessionTokenForNewUser: jest.fn(),
      createInvite: jest.fn(),
      acceptInvite: jest.fn(),
      uploadFile: jest.fn(),
      getStatus: jest.fn(),
      getPreview: jest.fn(),
      getPreviewSignedUrl: jest.fn(),
      validate: jest.fn(),
      canDownload: jest.fn(),
      getPeerFileDownload: jest.fn(),
      resetSession: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExchangeController],
      providers: [
        {
          provide: ExchangeService,
          useValue: exchangeService,
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

  it('returns 403 on download when both parties have not validated yet', async () => {
    exchangeService.parseSessionToken.mockReturnValue({
      sessionId: 's_test',
      userId: 'u_test',
    });
    exchangeService.canDownload.mockReturnValue(false);

    const response = createMockResponse();

    await controller.downloadByToken('Bearer test-token', response as never);

    expect(exchangeService.canDownload).toHaveBeenCalledWith(
      's_test',
      'u_test',
    );
    expect(exchangeService.getPeerFileDownload).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      error: 'Both parties must validate first',
    });
  });
});
