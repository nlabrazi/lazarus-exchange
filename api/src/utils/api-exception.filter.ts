import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { logApiError, logApiWarn } from './api-logger';

type HttpExceptionResponse =
  | string
  | {
      message?: string | string[];
      error?: string;
      statusCode?: number;
    };

function messageFromExceptionResponse(response: HttpExceptionResponse): string {
  if (typeof response === 'string') return response;

  if (Array.isArray(response.message)) {
    return response.message.join(', ');
  }

  if (typeof response.message === 'string') return response.message;
  if (typeof response.error === 'string') return response.error;
  return 'HTTP exception';
}

function routeFromRequest(request: Request): string {
  return request.originalUrl || request.url || 'unknown';
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = isHttpException
      ? (exception.getResponse() as HttpExceptionResponse)
      : 'Internal server error';
    const message = isHttpException
      ? messageFromExceptionResponse(exceptionResponse)
      : 'Internal server error';
    const route = routeFromRequest(request);

    if (statusCode >= 500) {
      logApiError({
        route,
        statusCode,
        message,
        error: exception,
        context: 'ApiExceptionFilter',
      });
    } else {
      logApiWarn({
        route,
        message,
        context: 'ApiExceptionFilter',
        extra: { statusCode },
      });
    }

    if (response.headersSent) return;

    response.status(statusCode).json({
      statusCode,
      message,
    });
  }
}
