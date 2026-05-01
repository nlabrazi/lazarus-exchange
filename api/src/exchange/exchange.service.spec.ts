jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

import { HttpException, HttpStatus } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { ExchangeService } from './exchange.service';
import type { ExchangeFilePolicyService } from './exchange-file-policy.service';
import type { ExchangePreviewService } from './exchange-preview.service';

type MockStorageBucket = {
  upload: jest.Mock;
  remove: jest.Mock;
  createSignedUrl: jest.Mock;
};

function buildTextFile(name: string, content: string): Express.Multer.File {
  const buffer = Buffer.from(content, 'utf8');
  return {
    fieldname: 'file',
    originalname: name,
    encoding: '7bit',
    mimetype: 'text/plain',
    size: buffer.length,
    buffer,
    stream: undefined as never,
    destination: '',
    filename: name,
    path: '',
  } as Express.Multer.File;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

describe('ExchangeService', () => {
  const mockedCreateClient = jest.mocked(createClient);

  let service: ExchangeService;
  let storageBucket: MockStorageBucket;
  let filePolicy: jest.Mocked<
    Pick<
      ExchangeFilePolicyService,
      'detectValidatedMime' | 'normalizedFileName'
    >
  >;
  let previewService: jest.Mocked<
    Pick<ExchangePreviewService, 'generatePreview'>
  >;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  function buildService() {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      'supabase_service_role_key_for_tests_only_1234567890';
    process.env.JWT_SECRET = 'jwt_secret_for_tests_only_12345678901234567890';

    storageBucket = {
      upload: jest.fn().mockResolvedValue({ error: null }),
      remove: jest.fn().mockResolvedValue({ error: null }),
      createSignedUrl: jest.fn().mockImplementation((path: string) =>
        Promise.resolve({
          data: {
            signedUrl: `https://signed.example/${encodeURIComponent(path)}`,
          },
          error: null,
        }),
      ),
    };

    mockedCreateClient.mockReturnValue({
      storage: {
        from: jest.fn().mockReturnValue(storageBucket),
      },
    } as never);

    filePolicy = {
      detectValidatedMime: jest
        .fn()
        .mockReturnValue({ mime: 'text/plain', ext: 'txt' }),
      normalizedFileName: jest.fn((name: string) => `safe-${name}`),
    };

    previewService = {
      generatePreview: jest.fn().mockResolvedValue({
        bytes: Buffer.from('preview-bytes', 'utf8'),
        meta: {
          format: 'webp',
          width: 320,
          height: 180,
          sizeBytes: 13,
          sourceKind: 'document',
        },
      }),
    };

    fetchMock = jest.fn();
    global.fetch = fetchMock;

    service = new ExchangeService(
      filePolicy as unknown as ExchangeFilePolicyService,
      previewService as unknown as ExchangePreviewService,
    );
  }

  beforeEach(() => {
    delete process.env.JWT_TTL_SECONDS;
    buildService();
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.restoreAllMocks();
    jest.clearAllMocks();
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

  it('expires in-memory session state when the token lifetime is exceeded', () => {
    service.onModuleDestroy();

    process.env.JWT_TTL_SECONDS = '1';
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_700_000_000_000);

    buildService();

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

  it('completes a full bilateral exchange from invite to preview to download', async () => {
    const owner = service.createSessionTokenForNewUser();
    const invite = service.createInvite(owner.sessionId, owner.userId);
    const peer = service.acceptInvite(invite.inviteCode);

    const ownerUpload = await service.uploadFile(
      owner.sessionId,
      owner.userId,
      buildTextFile('owner.txt', 'owner secret'),
    );
    const peerUpload = await service.uploadFile(
      peer.sessionId,
      peer.userId,
      buildTextFile('peer.txt', 'peer secret'),
    );

    expect(owner.sessionId).toBe(peer.sessionId);
    expect(ownerUpload.previewStatus).toBe('ready');
    expect(peerUpload.previewStatus).toBe('ready');

    expect(service.getStatus(owner.sessionId, owner.userId)).toEqual({
      me: {
        uploaded: true,
        validated: false,
        fileId: ownerUpload.fileId,
        previewReady: true,
      },
      peer: {
        uploaded: true,
        validated: false,
        fileId: peerUpload.fileId,
        previewReady: true,
      },
    });

    expect(service.getPreview(owner.sessionId, owner.userId)).toEqual({
      fileId: peerUpload.fileId,
      originalname: 'safe-peer.txt',
      size: Buffer.byteLength('peer secret'),
      mimetype: 'text/plain',
      previewStatus: 'ready',
      previewMeta: {
        format: 'webp',
        width: 320,
        height: 180,
        sizeBytes: 13,
        sourceKind: 'document',
      },
    });

    const previewUrl = await service.getPreviewSignedUrl(
      owner.sessionId,
      owner.userId,
      peerUpload.fileId,
    );

    expect(previewUrl).not.toBeNull();
    if (!previewUrl) fail('previewUrl should not be null');
    expect(previewUrl.previewUrl).toContain('/previews%2F');
    expect({
      ...previewUrl,
      previewUrl: 'signed-url',
    }).toEqual({
      fileId: peerUpload.fileId,
      previewStatus: 'ready',
      previewUrl: 'signed-url',
      expiresIn: 180,
      previewMeta: {
        format: 'webp',
        width: 320,
        height: 180,
        sizeBytes: 13,
        sourceKind: 'document',
      },
    });

    const downloadedPeerBytes = Uint8Array.from(
      Buffer.from('peer-secret-file'),
    );
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(toArrayBuffer(downloadedPeerBytes)),
    } as Response);

    expect(service.canDownload(owner.sessionId, owner.userId)).toBe(false);

    service.validate(owner.sessionId, owner.userId);
    expect(service.canDownload(owner.sessionId, owner.userId)).toBe(false);

    service.validate(peer.sessionId, peer.userId);
    expect(service.canDownload(owner.sessionId, owner.userId)).toBe(true);

    const download = await service.getPeerFileDownload(
      owner.sessionId,
      owner.userId,
    );

    expect(download).toEqual({
      originalname: 'safe-peer.txt',
      mimetype: 'text/plain',
      bytes: downloadedPeerBytes,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/originals%2F'),
    );
    expect(storageBucket.upload).toHaveBeenCalledTimes(4);
  });
});
