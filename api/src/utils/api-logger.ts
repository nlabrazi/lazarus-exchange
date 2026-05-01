type LogLevel = 'error' | 'warn' | 'info';

type ApiLogPayload = {
  app?: string;
  level: LogLevel;
  route: string;
  statusCode?: number;
  message: string;
  error?: string;
  context?: string;
  [key: string]: unknown;
};

type ApiErrorLogInput = {
  route: string;
  statusCode?: number;
  message: string;
  error?: unknown;
  context?: string;
  extra?: Record<string, unknown>;
};

type ApiEventLogInput = {
  route: string;
  message: string;
  context?: string;
  extra?: Record<string, unknown>;
};

function stringifyError(error: unknown): string | undefined {
  if (error === undefined || error === null) return undefined;
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (
    typeof error === 'number' ||
    typeof error === 'boolean' ||
    typeof error === 'bigint' ||
    typeof error === 'symbol'
  ) {
    return String(error);
  }
  if (typeof error === 'function') return '[function]';
  if (typeof error === 'object') {
    try {
      const serialized = JSON.stringify(error);
      return typeof serialized === 'string' ? serialized : '[object]';
    } catch {
      return '[object]';
    }
  }
  return '[unknown]';
}

function resolveAppName(): string {
  return (
    (process.env.APP_NAME ?? 'lazarus-exchange-api').trim() ||
    'lazarus-exchange-api'
  );
}

function sanitizeExtra(
  extra: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!extra) return {};

  const safeExtra: Record<string, unknown> = {};
  const reservedKeys = new Set([
    'app',
    'level',
    'route',
    'statusCode',
    'message',
    'error',
    'context',
  ]);

  for (const [key, value] of Object.entries(extra)) {
    if (!reservedKeys.has(key)) {
      safeExtra[key] = value;
    }
  }

  return safeExtra;
}

function writeApiLog(payload: ApiLogPayload): void {
  const line = JSON.stringify({
    app: resolveAppName(),
    ...payload,
  });

  if (payload.level === 'error') {
    console.error(line);
    return;
  }

  if (payload.level === 'warn') {
    console.warn(line);
    return;
  }

  console.info(line);
}

export const logApiError = ({
  route,
  statusCode,
  message,
  error,
  context,
  extra,
}: ApiErrorLogInput): void => {
  writeApiLog({
    level: 'error',
    route,
    statusCode,
    message,
    error: stringifyError(error),
    context,
    ...sanitizeExtra(extra),
  });
};

export const logApiWarn = ({
  route,
  message,
  context,
  extra,
}: ApiEventLogInput): void => {
  writeApiLog({
    level: 'warn',
    route,
    message,
    context,
    ...sanitizeExtra(extra),
  });
};

export const logApiInfo = ({
  route,
  message,
  context,
  extra,
}: ApiEventLogInput): void => {
  writeApiLog({
    level: 'info',
    route,
    message,
    context,
    ...sanitizeExtra(extra),
  });
};
