import { type ExecutionContext, HttpException, HttpStatus } from '@nestjs/common'
import type { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { ApiRateLimitService } from './api-rate-limit.service'
import { RouteRateLimitGuard } from './route-rate-limit.guard'

const ENV_KEYS = [
  'RL_AUTH_NEW_PER_MINUTE',
  'RL_AUTH_NEW_PER_DAY',
  'RL_UPLOAD_PER_MINUTE',
  'RL_UPLOAD_PER_DAY',
  'RL_INVITE_ACCEPT_PER_MINUTE',
  'RL_INVITE_ACCEPT_PER_DAY',
  'RL_UPLOAD_IP_MAX_MB_PER_DAY',
  'TRUST_PROXY',
] as const

function createRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  } as unknown as Request
}

describe('ApiRateLimitService', () => {
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-11-19T10:00:00.000Z'))
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    jest.useRealTimers()
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = savedEnv[key]
      }
    }
  })

  it('enforces per-minute limits and resets after the window elapses', () => {
    process.env.RL_AUTH_NEW_PER_MINUTE = '2'
    process.env.RL_AUTH_NEW_PER_DAY = '10'

    const service = new ApiRateLimitService()
    const request = createRequest({ ip: '::ffff:192.168.1.10' })

    expect(service.enforceRoute('auth_new', request)).toBe('192.168.1.10')
    expect(service.enforceRoute('auth_new', request)).toBe('192.168.1.10')

    try {
      service.enforceRoute('auth_new', request)
      fail('Expected rate limit exception')
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException)
      const httpError = error as HttpException
      expect(httpError.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS)
      expect(httpError.message).toContain('/exchange/auth/new')
    }

    jest.advanceTimersByTime(60_000)
    expect(service.enforceRoute('auth_new', request)).toBe('192.168.1.10')
  })

  it('enforces daily limits per route and rotates buckets at UTC midnight', () => {
    process.env.RL_UPLOAD_PER_MINUTE = '10'
    process.env.RL_UPLOAD_PER_DAY = '2'
    process.env.RL_INVITE_ACCEPT_PER_MINUTE = '1'

    const service = new ApiRateLimitService()
    const request = createRequest({ ip: '10.0.0.5' })

    service.enforceRoute('upload', request)
    service.enforceRoute('upload', request)

    expect(() => service.enforceRoute('upload', request)).toThrow(
      'Daily rate limit reached on /exchange/upload (2/day per IP)',
    )

    service.enforceRoute('invite_accept', request)
    expect(() => service.enforceRoute('invite_accept', request)).toThrow(
      '/exchange/invite/accept/:inviteCode',
    )

    jest.setSystemTime(new Date('2026-11-20T00:01:00.000Z'))
    expect(service.enforceRoute('upload', request)).toBe('10.0.0.5')
  })

  it('cleans up expired window counters after the cleanup interval', () => {
    process.env.RL_AUTH_NEW_PER_MINUTE = '1'
    const service = new ApiRateLimitService()

    service.enforceRoute('auth_new', createRequest({ ip: '10.0.0.1' }))
    jest.advanceTimersByTime(61_000)
    service.enforceRoute('auth_new', createRequest({ ip: '10.0.0.2' }))

    expect(service.enforceRoute('auth_new', createRequest({ ip: '10.0.0.1' }))).toBe('10.0.0.1')
  })

  it('tracks daily upload bytes and ignores invalid or non-positive sizes', () => {
    process.env.RL_UPLOAD_IP_MAX_MB_PER_DAY = '1'
    const service = new ApiRateLimitService()

    service.enforceUploadBytes('10.0.0.1', 0)
    service.enforceUploadBytes('10.0.0.1', -100)
    service.enforceUploadBytes('10.0.0.1', Number.NaN)

    service.enforceUploadBytes('10.0.0.1', 600_000)
    service.enforceUploadBytes('10.0.0.1', 400_000)

    expect(() => service.enforceUploadBytes('10.0.0.1', 100_000)).toThrow(
      'Daily upload size limit reached (1MB/day per IP)',
    )
  })

  it('extracts client IP respecting TRUST_PROXY and safe fallbacks', () => {
    const directService = new ApiRateLimitService()
    const proxiedReq = createRequest({
      headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
      ip: undefined,
      socket: { remoteAddress: '::ffff:10.0.0.2' } as Request['socket'],
    })
    expect(directService.enforceRoute('auth_new', proxiedReq)).toBe('10.0.0.2')

    const unknownReq = createRequest({
      ip: undefined,
      socket: { remoteAddress: undefined } as Request['socket'],
    })
    expect(directService.enforceRoute('auth_new', unknownReq)).toBe('unknown')

    process.env.TRUST_PROXY = 'true'
    const proxyService = new ApiRateLimitService()
    expect(proxyService.enforceRoute('auth_new', proxiedReq)).toBe('203.0.113.9')

    const arrayHeaderReq = createRequest({
      headers: { 'x-forwarded-for': ['198.51.100.4, 10.0.0.1'] },
    })
    expect(proxyService.enforceRoute('auth_new', arrayHeaderReq)).toBe('198.51.100.4')
  })

  it('falls back to defaults when env values are invalid', () => {
    process.env.RL_AUTH_NEW_PER_MINUTE = '0'
    process.env.RL_UPLOAD_IP_MAX_MB_PER_DAY = 'not-a-number'
    process.env.TRUST_PROXY = 'false'

    const service = new ApiRateLimitService()
    const request = createRequest({
      headers: { 'x-forwarded-for': '203.0.113.9' },
      ip: '127.0.0.1',
    })

    expect(service.enforceRoute('auth_new', request)).toBe('127.0.0.1')
  })
})

describe('RouteRateLimitGuard', () => {
  function createContext(request: Record<string, unknown>): ExecutionContext {
    return {
      getHandler: () => jest.fn(),
      getClass: () => class DummyController {},
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext
  }

  it('allows requests when no rate-limit route metadata is defined', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector
    const enforceRoute = jest.fn()
    const rateLimitService = { enforceRoute } as unknown as ApiRateLimitService

    const guard = new RouteRateLimitGuard(reflector, rateLimitService)
    expect(guard.canActivate(createContext({}))).toBe(true)
    expect(enforceRoute).not.toHaveBeenCalled()
  })

  it('enforces the decorated route and attaches rateLimitIp to the request', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('upload'),
    } as unknown as Reflector
    const enforceRoute = jest.fn().mockReturnValue('192.0.2.42')
    const rateLimitService = { enforceRoute } as unknown as ApiRateLimitService

    const request: Record<string, unknown> = { headers: {}, ip: '192.0.2.42' }
    const guard = new RouteRateLimitGuard(reflector, rateLimitService)

    expect(guard.canActivate(createContext(request))).toBe(true)
    expect(enforceRoute).toHaveBeenCalledWith('upload', request)
    expect(request.rateLimitIp).toBe('192.0.2.42')
  })
})
