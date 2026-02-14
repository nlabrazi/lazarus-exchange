import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { extname } from 'node:path';
import { ValidatedMime } from './exchange-file.types';

const ALLOWED_MIME_SET = new Set<ValidatedMime['mime']>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
]);

const BLOCKED_MIME_PREFIXES = ['audio/', 'video/'] as const;

const BLOCKED_MIME_SET = new Set([
  'application/json',
  'text/json',
  'application/sql',
  'text/sql',
  'text/x-sql',
  'application/x-sql',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-sh',
  'application/x-bat',
  'application/octet-stream',
  'application/x-7z-compressed',
  'application/x-rar-compressed',
  'application/zip',
  'application/x-tar',
  'application/gzip',
  'application/x-gzip',
]);

const BLOCKED_EXTENSION_SET = new Set([
  'json',
  'sql',
  'exe',
  'dll',
  'msi',
  'bat',
  'cmd',
  'ps1',
  'sh',
  'zip',
  'rar',
  '7z',
  'tar',
  'gz',
  'tgz',
  'bz2',
  'xz',
]);

@Injectable()
export class ExchangeFilePolicyService {
  normalizedFileName(name: string): string {
    const cleaned = name.replace(/[^\w.\-() ]+/g, '_').slice(0, 180).trim();
    return cleaned || 'file';
  }

  detectValidatedMime(file: Express.Multer.File): ValidatedMime {
    const claimedMime = (file.mimetype || '').trim().toLowerCase();
    const extension = this.extensionFromName(file.originalname);

    if (extension && BLOCKED_EXTENSION_SET.has(extension)) {
      throw new HttpException(
        'File extension not allowed',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }

    let mime = this.sniffMimeFromMagic(file.buffer);
    if (!mime && this.isLikelyUtf8Text(file.buffer)) {
      mime = 'text/plain';
    }

    if (!mime) {
      throw new HttpException(
        'Unknown binary file type is not allowed',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }

    if (claimedMime && this.hasBlockedMime(claimedMime)) {
      throw new HttpException('File type not allowed', HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    }

    if (this.hasBlockedMime(mime)) {
      throw new HttpException('File type not allowed', HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    }

    if (!ALLOWED_MIME_SET.has(mime as ValidatedMime['mime'])) {
      throw new HttpException(
        `Unsupported file type: ${mime}`,
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }

    const validatedMime = mime as ValidatedMime['mime'];
    if (validatedMime === 'text/plain') {
      const text = this.decodeTextUtf8(file.buffer);
      this.validateTextPolicy(text, claimedMime, extension);
    }

    return {
      mime: validatedMime,
      ext: this.mapMimeToExtension(validatedMime),
    };
  }

  private extensionFromName(name: string): string {
    const extracted = extname(name || '').trim().toLowerCase();
    if (!extracted.startsWith('.')) return '';
    return extracted.slice(1);
  }

  private hasBlockedMime(mime: string): boolean {
    const normalized = mime.toLowerCase();
    if (BLOCKED_MIME_SET.has(normalized)) return true;
    return BLOCKED_MIME_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  }

  private hasMagicPrefix(buffer: Buffer, signature: number[], offset = 0): boolean {
    if (buffer.length < offset + signature.length) return false;
    for (let idx = 0; idx < signature.length; idx += 1) {
      if (buffer[offset + idx] !== signature[idx]) return false;
    }
    return true;
  }

  private sniffMimeFromMagic(buffer: Buffer): ValidatedMime['mime'] | '' {
    if (this.hasMagicPrefix(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';

    if (
      this.hasMagicPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    ) {
      return 'image/png';
    }

    const riff = buffer.subarray(0, 4).toString('ascii');
    const webp = buffer.subarray(8, 12).toString('ascii');
    if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp';

    const limit = Math.min(buffer.length, 1024);
    let cursor = 0;

    if (
      limit >= 3 &&
      buffer[0] === 0xef &&
      buffer[1] === 0xbb &&
      buffer[2] === 0xbf
    ) {
      cursor = 3;
    }

    while (
      cursor < limit &&
      (buffer[cursor] === 0x20 ||
        buffer[cursor] === 0x09 ||
        buffer[cursor] === 0x0a ||
        buffer[cursor] === 0x0d)
    ) {
      cursor += 1;
    }

    if (buffer.subarray(cursor, cursor + 5).toString('ascii') === '%PDF-') {
      return 'application/pdf';
    }

    return '';
  }

  private decodeTextUtf8(buffer: Buffer): string {
    if (!buffer.length) return '';
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      return new TextDecoder('utf-8').decode(buffer);
    }
  }

  private isLikelyUtf8Text(buffer: Buffer): boolean {
    if (buffer.length === 0) return true;

    const sample = buffer.subarray(0, Math.min(buffer.length, 16 * 1024));
    if (sample.includes(0)) return false;

    let decoded = '';
    try {
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(sample);
    } catch {
      return false;
    }

    if (!decoded.length) return true;

    let controlCount = 0;
    for (const char of decoded) {
      const code = char.charCodeAt(0);
      const isAllowed =
        code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
      if (!isAllowed) controlCount += 1;
    }

    return controlCount <= decoded.length * 0.02;
  }

  private looksLikeJson(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;

    const candidate = trimmed.slice(0, 80_000);
    try {
      const parsed = JSON.parse(candidate);
      return typeof parsed === 'object' && parsed !== null;
    } catch {
      return false;
    }
  }

  private looksLikeSql(text: string): boolean {
    const prefix = text
      .trimStart()
      .slice(0, 1200)
      .replace(/\s+/g, ' ')
      .toLowerCase();

    if (!prefix) return false;

    return (
      /^(--|\/\*|\s)*(select|insert|update|delete|create|alter|drop|truncate|with|grant|revoke)\b/.test(
        prefix,
      ) ||
      /\b(create\s+table|insert\s+into|select\s+.+\s+from|drop\s+table)\b/.test(prefix)
    );
  }

  private validateTextPolicy(
    text: string,
    claimedMime: string,
    extension: string,
  ): void {
    const normalizedClaim = claimedMime.toLowerCase();

    if (
      normalizedClaim.includes('json') ||
      normalizedClaim.includes('sql') ||
      extension === 'json' ||
      extension === 'sql'
    ) {
      throw new HttpException(
        'JSON and SQL files are not allowed',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }

    if (this.looksLikeJson(text) || this.looksLikeSql(text)) {
      throw new HttpException(
        'JSON and SQL files are not allowed',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }
  }

  private mapMimeToExtension(mime: ValidatedMime['mime']): ValidatedMime['ext'] {
    switch (mime) {
      case 'image/jpeg':
        return 'jpg';
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      case 'application/pdf':
        return 'pdf';
      case 'text/plain':
        return 'txt';
      default:
        throw new HttpException('Unsupported file type', HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    }
  }
}
