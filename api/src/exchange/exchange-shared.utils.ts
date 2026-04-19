export function readPositiveIntEnv(envKey: string, fallback: number): number {
  const raw = (process.env[envKey] ?? '').trim();
  const parsed = raw ? Number(raw) : fallback;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

export function decodeUtf8Text(buffer: Buffer): string {
  if (!buffer.length) return '';
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

export function errorMessageFromUnknown(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'Unknown error';
}
