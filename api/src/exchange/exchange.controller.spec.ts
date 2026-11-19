import { HttpException, HttpStatus } from '@nestjs/common'
import { Test, type TestingModule } from '@nestjs/testing'
import { of } from 'rxjs'
import { ApiRateLimitService } from '../security/api-rate-limit.service'
import { ExchangeController } from './exchange.controller'
import { ExchangeService } from './exchange.service'

type MockResponse = {
  statusCode: number
  payload: unknown
  status: jest.Mock
  json: jest.Mock
  set: jest.Mock
  send: jest.Mock
}

function createMockResponse(): MockResponse {
  const response = {} as MockResponse
  response.statusCode = 200
  response.payload = null
  response.status = jest.fn((code: number) => {
    response.statusCode = code
    return response
  })
  response.json = jest.fn((body: unknown) => {
    response.payload = body
    return response
  })
  response.set = jest.fn()
  response.send = jest.fn()

  return response
}

describe('ExchangeController', () => {
  let controller: ExchangeController
  let apiRateLimitService: {
    enforceRoute: jest.Mock
    enforceUploadBytes: jest.Mock
  }
  let exchangeService: {
    parseSessionToken: jest.Mock
    createSessionTokenForNewUser: jest.Mock
    createInvite: jest.Mock
    acceptInvite: jest.Mock
    uploadFile: jest.Mock
    getStatus: jest.Mock
    getPreview: jest.Mock
    getPreviewSignedUrl: jest.Mock
    validate: jest.Mock
    canDownload: jest.Mock
    getPeerFileDownload: jest.Mock
    resetSession: jest.Mock
    getSessionEventStream: jest.Mock
  }

  beforeEach(async () => {
    apiRateLimitService = {
      enforceRoute: jest.fn().mockReturnValue('127.0.0.1'),
      enforceUploadBytes: jest.fn(),
    }
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
      getSessionEventStream: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExchangeController],
      providers: [
        {
          provide: ExchangeService,
          useValue: exchangeService,
        },
        {
          provide: ApiRateLimitService,
          useValue: apiRateLimitService,
        },
      ],
    }).compile()

    controller = module.get<ExchangeController>(ExchangeController)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  it('delegates token creation, invite creation and invite acceptance', () => {
    exchangeService.createSessionTokenForNewUser.mockReturnValue({ token: 'tok_1' })
    expect(controller.createToken()).toEqual({ token: 'tok_1' })

    exchangeService.parseSessionToken.mockReturnValue({ sessionId: 's_1', userId: 'u_1' })
    exchangeService.createInvite.mockReturnValue({ inviteCode: 'inv_1' })
    expect(controller.createInvite('Bearer tok_1')).toEqual({ inviteCode: 'inv_1' })

    exchangeService.acceptInvite.mockReturnValue({ token: 'tok_2' })
    expect(controller.acceptInvite('inv_1')).toEqual({ token: 'tok_2' })
  })

  it('rejects missing or empty Bearer authorization headers', () => {
    expect(() => controller.getStatusByToken(undefined)).toThrow(
      new HttpException('Missing Bearer token', HttpStatus.UNAUTHORIZED),
    )
    expect(() => controller.getStatusByToken('Basic abc')).toThrow(
      new HttpException('Missing Bearer token', HttpStatus.UNAUTHORIZED),
    )
    expect(() => controller.getStatusByToken('Bearer   ')).toThrow(
      new HttpException('Missing Bearer token', HttpStatus.UNAUTHORIZED),
    )
  })

  it('validates upload input, enforces upload bytes and delegates file upload', async () => {
    await expect(
      controller.uploadByToken({} as never, 'Bearer tok_1', undefined as never),
    ).rejects.toThrow(new HttpException('No file received', HttpStatus.BAD_REQUEST))

    exchangeService.parseSessionToken.mockReturnValue({ sessionId: 's_1', userId: 'u_1' })
    exchangeService.uploadFile.mockResolvedValue({ fileId: 'f_1' })

    const file = { size: 512 } as Express.Multer.File
    const directResult = await controller.uploadByToken(
      { rateLimitIp: '203.0.113.5' } as never,
      'Bearer tok_1',
      file,
    )
    expect(apiRateLimitService.enforceRoute).not.toHaveBeenCalled()
    expect(apiRateLimitService.enforceUploadBytes).toHaveBeenCalledWith('203.0.113.5', 512)
    expect(directResult).toMatchObject({ fileId: 'f_1' })

    await controller.uploadByToken({} as never, 'Bearer tok_1', file)
    expect(apiRateLimitService.enforceRoute).toHaveBeenCalledWith('upload', {})
  })

  it('serves status, preview, preview URL and validation endpoints', async () => {
    exchangeService.parseSessionToken.mockReturnValue({ sessionId: 's_1', userId: 'u_1' })
    exchangeService.getStatus.mockReturnValue({ state: 'pending' })
    exchangeService.getPreview.mockReturnValue({ ready: true })
    exchangeService.validate.mockReturnValue({ validated: true })

    expect(controller.getStatusByToken('Bearer tok_1')).toEqual({ state: 'pending' })
    expect(controller.getPreviewByToken('Bearer tok_1')).toEqual({ ready: true })
    expect(controller.validateByToken('Bearer tok_1')).toEqual({ validated: true })

    exchangeService.getPreviewSignedUrl.mockResolvedValueOnce({ url: 'https://signed.test' })
    await expect(controller.getPreviewUrlByToken('f_1', 'Bearer tok_1')).resolves.toEqual({
      url: 'https://signed.test',
    })

    exchangeService.getPreviewSignedUrl.mockResolvedValueOnce(null)
    await expect(controller.getPreviewUrlByToken('f_missing', 'Bearer tok_1')).rejects.toThrow(
      new HttpException('Preview not found', HttpStatus.NOT_FOUND),
    )
  })

  it('returns 403 on download when both parties have not validated yet', async () => {
    exchangeService.parseSessionToken.mockReturnValue({
      sessionId: 's_test',
      userId: 'u_test',
    })
    exchangeService.canDownload.mockReturnValue(false)

    const response = createMockResponse()

    await controller.downloadByToken('Bearer test-token', response as never)

    expect(exchangeService.canDownload).toHaveBeenCalledWith('s_test', 'u_test')
    expect(exchangeService.getPeerFileDownload).not.toHaveBeenCalled()
    expect(response.status).toHaveBeenCalledWith(403)
    expect(response.json).toHaveBeenCalledWith({
      error: 'Both parties must validate first',
      message: 'Both parties must validate first',
    })
  })

  it('returns 404 when peer file is missing and streams file with headers when ready', async () => {
    exchangeService.parseSessionToken.mockReturnValue({ sessionId: 's_1', userId: 'u_1' })
    exchangeService.canDownload.mockReturnValue(true)
    exchangeService.getPeerFileDownload.mockResolvedValueOnce(null)

    const missingResponse = createMockResponse()
    await controller.downloadByToken('Bearer tok_1', missingResponse as never)
    expect(missingResponse.status).toHaveBeenCalledWith(404)
    expect(missingResponse.json).toHaveBeenCalledWith({ error: 'File not found' })

    exchangeService.getPeerFileDownload.mockResolvedValueOnce({
      originalname: 'secret.txt',
      mimetype: undefined,
      sha256: 'abc123',
      bytes: Buffer.from('payload'),
    })
    const okResponse = createMockResponse()
    await controller.downloadByToken('Bearer tok_1', okResponse as never)
    expect(okResponse.set).toHaveBeenCalledWith({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="secret.txt"',
      'X-File-SHA256': 'abc123',
      'Cache-Control': 'no-store',
    })
    expect(okResponse.send).toHaveBeenCalledWith(Buffer.from('payload'))
  })

  it('handles session reset with revoked-epoch support', async () => {
    exchangeService.parseSessionToken.mockReturnValue({ sessionId: 's_1', userId: 'u_1' })
    exchangeService.resetSession.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    await expect(controller.resetByToken('Bearer tok_1')).resolves.toEqual({ success: true })
    expect(exchangeService.parseSessionToken).toHaveBeenCalledWith('tok_1', {
      allowRevokedEpoch: true,
    })
    await expect(controller.resetByToken('Bearer tok_1')).resolves.toEqual({ success: false })
  })

  it('streams session events via SSE from query or Bearer token and rejects missing token', (done) => {
    expect(() => controller.streamSessionEvents(undefined, undefined)).toThrow(
      new HttpException('Missing session token', HttpStatus.UNAUTHORIZED),
    )

    exchangeService.parseSessionToken.mockReturnValue({
      sessionId: 's_test',
      userId: 'u_test',
    })
    const fakeEvent = { data: { state: 'created' }, type: 'status' }
    exchangeService.getSessionEventStream.mockReturnValue(of(fakeEvent))

    controller.streamSessionEvents(undefined, 'Bearer header-token')
    expect(exchangeService.parseSessionToken).toHaveBeenCalledWith('header-token')

    const observable = controller.streamSessionEvents('query-token', undefined)
    observable.subscribe((event) => {
      expect(event).toEqual(fakeEvent)
      done()
    })
  })
})
