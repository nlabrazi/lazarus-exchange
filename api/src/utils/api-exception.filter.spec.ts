import { type ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common'
import type { Request, Response } from 'express'
import { ApiExceptionFilter } from './api-exception.filter'

function createHost(
  requestOverrides: Partial<Request> = {},
  responseOverrides: Partial<Response> = {},
) {
  const json = jest.fn()
  const status = jest.fn().mockReturnValue({ json })
  const request = {
    originalUrl: '/exchange/upload',
    url: '/upload',
    ...requestOverrides,
  } as Request
  const response = {
    headersSent: false,
    status,
    ...responseOverrides,
  } as unknown as Response

  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost

  return { host, status, json }
}

describe('ApiExceptionFilter', () => {
  let warnSpy: jest.SpyInstance
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('formats 4xx HttpException with string response and logs a warning', () => {
    const filter = new ApiExceptionFilter()
    const { host, status, json } = createHost()

    filter.catch(new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS), host)

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS)
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: 'Rate limit exceeded',
    })
  })

  it('extracts message from object, array, error field and default fallback', () => {
    const filter = new ApiExceptionFilter()

    const arrayCase = createHost({ originalUrl: '', url: '/exchange/auth/new' })
    filter.catch(
      new HttpException(
        { message: ['field is required', 'must be valid'] },
        HttpStatus.BAD_REQUEST,
      ),
      arrayCase.host,
    )
    expect(arrayCase.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'field is required, must be valid',
    })

    const stringFieldCase = createHost()
    filter.catch(
      new HttpException({ message: 'Invalid token' }, HttpStatus.UNAUTHORIZED),
      stringFieldCase.host,
    )
    expect(stringFieldCase.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.UNAUTHORIZED,
      message: 'Invalid token',
    })

    const errorFieldCase = createHost()
    filter.catch(
      new HttpException({ error: 'Forbidden' }, HttpStatus.FORBIDDEN),
      errorFieldCase.host,
    )
    expect(errorFieldCase.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.FORBIDDEN,
      message: 'Forbidden',
    })

    const fallbackCase = createHost({ originalUrl: '', url: '' })
    filter.catch(new HttpException({}, HttpStatus.BAD_REQUEST), fallbackCase.host)
    expect(fallbackCase.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'HTTP exception',
    })
  })

  it('logs an error for 5xx HttpException and unexpected unknown errors', () => {
    const filter = new ApiExceptionFilter()

    const http500 = createHost()
    filter.catch(new HttpException('Upstream unavailable', HttpStatus.BAD_GATEWAY), http500.host)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(http500.status).toHaveBeenCalledWith(HttpStatus.BAD_GATEWAY)
    expect(http500.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_GATEWAY,
      message: 'Upstream unavailable',
    })

    const unexpected = createHost()
    filter.catch(new Error('Database crashed'), unexpected.host)
    expect(errorSpy).toHaveBeenCalledTimes(2)
    expect(unexpected.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR)
    expect(unexpected.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    })
  })

  it('does not write a response when headers were already sent', () => {
    const filter = new ApiExceptionFilter()
    const { host, status } = createHost({}, { headersSent: true })

    filter.catch(new HttpException('Already sent', HttpStatus.BAD_REQUEST), host)

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(status).not.toHaveBeenCalled()
  })
})
