import { HttpException, HttpStatus } from '@nestjs/common';
import type { StorageDriver } from '../storage/storage-driver.interface';
import { ExchangeService } from './exchange.service';
import type { ExchangeFilePolicyService } from './exchange-file-policy.service';
import type { ExchangePreviewService } from './exchange-preview.service';

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

describe('ExchangeService', () => {
  let service: ExchangeService;
  let storage: jest.Mocked<StorageDriver>;
  let filePolicy: jest.Mocked<
    Pick<
      ExchangeFilePolicyService,
      'detectValidatedMime' | 'normalizedFileName'
    >
  >;
  let previewService: jest.Mocked<
    Pick<ExchangePreviewService, 'generatePreview'>
  >;

  function buildService() {
    process.env.JWT_SECRET = 'jwt_secret_for_tests_only_12345678901234567890';

    storage = {
      upload: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      createSignedUrl: jest
        .fn()
        .mockImplementation((path: string) =>
          Promise.resolve(`https://signed.example/${encodeURIComponent(path)}`),
        ),
      download: jest.fn().mockResolvedValue({
        bytes: Uint8Array.from(Buffer.from('peer-secret-file')),
        mimetype: 'text/plain',
      }),
    };

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

    service = new ExchangeService(
      filePolicy as unknown as ExchangeFilePolicyService,
      previewService as unknown as ExchangePreviewService,
      storage,
    );
  }

  beforeEach(() => {
    jest.restoreAllMocks();
    buildService();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates an initial empty session state on auth_new', () => {
    const issued = service.createSessionTokenForNewUser();

    expect(service.getStatus(issued.sessionId, issued.userId)).toEqual({
      state: 'created',
      unlockedAt: null,
      gracePeriodExpiresAt: null,
      me: {
        uploaded: false,
        validated: false,
        downloaded: false,
        fileId: null,
        sha256: null,
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
    expect(ownerUpload.sha256).toBeDefined();
    expect(peerUpload.sha256).toBeDefined();

    expect(service.getStatus(owner.sessionId, owner.userId)).toEqual({
      state: 'ready_for_validation',
      unlockedAt: null,
      gracePeriodExpiresAt: null,
      me: {
        uploaded: true,
        validated: false,
        downloaded: false,
        fileId: ownerUpload.fileId,
        sha256: ownerUpload.sha256,
        previewReady: true,
      },
      peer: {
        uploaded: true,
        validated: false,
        downloaded: false,
        fileId: peerUpload.fileId,
        sha256: peerUpload.sha256,
        previewReady: true,
      },
    });

    expect(service.getPreview(owner.sessionId, owner.userId)).toEqual({
      fileId: peerUpload.fileId,
      originalname: 'safe-peer.txt',
      size: Buffer.byteLength('peer secret'),
      mimetype: 'text/plain',
      sha256: peerUpload.sha256,
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
    storage.download.mockResolvedValueOnce({
      bytes: downloadedPeerBytes,
      mimetype: 'text/plain',
    });

    expect(service.canDownload(owner.sessionId, owner.userId)).toBe(false);

    service.validate(owner.sessionId, owner.userId);
    expect(service.canDownload(owner.sessionId, owner.userId)).toBe(false);

    service.validate(peer.sessionId, peer.userId);
    expect(service.canDownload(owner.sessionId, owner.userId)).toBe(true);

    const statusAfterUnlock = service.getStatus(owner.sessionId, owner.userId);
    expect(statusAfterUnlock?.state).toBe('unlocked');
    expect(statusAfterUnlock?.unlockedAt).toBeDefined();
    expect(statusAfterUnlock?.gracePeriodExpiresAt).toBeDefined();

    const download = await service.getPeerFileDownload(
      owner.sessionId,
      owner.userId,
    );

    expect(download).toEqual({
      originalname: 'safe-peer.txt',
      mimetype: 'text/plain',
      bytes: downloadedPeerBytes,
      sha256: peerUpload.sha256,
    });
    expect(storage.upload).toHaveBeenCalledTimes(4);

    const statusAfterOwnerDownload = service.getStatus(
      owner.sessionId,
      owner.userId,
    );
    expect(statusAfterOwnerDownload?.me.downloaded).toBe(true);
    expect(statusAfterOwnerDownload?.peer?.downloaded).toBe(false);

    // Anti-scam: owner tries to reset immediately before peer has downloaded owner's file -> blocked!
    await expect(
      service.resetSession(owner.sessionId, owner.userId),
    ).rejects.toThrow(HttpException);

    // Now peer downloads owner's file
    const downloadedOwnerBytes = Uint8Array.from(Buffer.from('owner-secret'));
    storage.download.mockResolvedValueOnce({
      bytes: downloadedOwnerBytes,
      mimetype: 'text/plain',
    });

    await service.getPeerFileDownload(peer.sessionId, peer.userId);

    const statusCompleted = service.getStatus(owner.sessionId, owner.userId);
    expect(statusCompleted?.state).toBe('completed');
    expect(statusCompleted?.me.downloaded).toBe(true);
    expect(statusCompleted?.peer?.downloaded).toBe(true);

    // Now both downloaded: reset is allowed!
    const resetOk = await service.resetSession(owner.sessionId, owner.userId);
    expect(resetOk).toBe(true);

    // Peer also tries to reset right after: should succeed (session already reset)
    const peerResetOk = await service.resetSession(peer.sessionId, peer.userId);
    expect(peerResetOk).toBe(true);

    // Parsing peer's token with allowRevokedEpoch succeeds even though epoch was bumped
    const parsed = service.parseSessionToken(peer.token, {
      allowRevokedEpoch: true,
    });
    expect(parsed.sessionId).toBe(peer.sessionId);
    expect(parsed.userId).toBe(peer.userId);
  });
});
