import { existsSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
} from '@nestjs/common';
import type { StorageDriver } from './storage-driver.interface';

@Injectable()
export class LocalStorageDriver implements StorageDriver {
  private readonly baseDir: string;

  constructor(@Optional() customBaseDir?: string) {
    this.baseDir = resolve(
      customBaseDir ??
        process.env.LOCAL_STORAGE_DIR ??
        join(process.cwd(), 'data', 'storage'),
    );
  }

  private resolveSafePath(storagePath: string): string {
    const cleaned = normalize(storagePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const target = resolve(this.baseDir, cleaned);

    if (!target.startsWith(this.baseDir)) {
      throw new HttpException('Invalid storage path', HttpStatus.BAD_REQUEST);
    }

    return target;
  }

  async upload(
    storagePath: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    const target = this.resolveSafePath(storagePath);
    const parentDir = dirname(target);

    await mkdir(parentDir, { recursive: true });
    await writeFile(target, buffer);

    const metaPath = `${target}.meta.json`;
    await writeFile(
      metaPath,
      JSON.stringify({ contentType, uploadedAt: Date.now() }),
      'utf8',
    );
  }

  async remove(paths: string[]): Promise<void> {
    const unique = [...new Set(paths.filter(Boolean))];
    for (const p of unique) {
      try {
        const target = this.resolveSafePath(p);
        await unlink(target).catch(() => undefined);
        await unlink(`${target}.meta.json`).catch(() => undefined);
      } catch {
        // Quiet removal
      }
    }
  }

  async createSignedUrl(
    storagePath: string,
    _ttlSeconds: number,
  ): Promise<string> {
    const target = this.resolveSafePath(storagePath);
    if (!existsSync(target)) {
      throw new HttpException('Storage file not found', HttpStatus.NOT_FOUND);
    }

    const buffer = await readFile(target);
    const metaPath = `${target}.meta.json`;
    let contentType = 'image/webp';

    try {
      if (existsSync(metaPath)) {
        const metaRaw = await readFile(metaPath, 'utf8');
        const meta = JSON.parse(metaRaw);
        if (meta?.contentType) {
          contentType = meta.contentType;
        }
      }
    } catch {
      // fallback to default
    }

    return `data:${contentType};base64,${buffer.toString('base64')}`;
  }

  async download(
    storagePath: string,
  ): Promise<{ bytes: Uint8Array; mimetype?: string }> {
    const target = this.resolveSafePath(storagePath);
    if (!existsSync(target)) {
      throw new HttpException('Storage file not found', HttpStatus.NOT_FOUND);
    }

    const buffer = await readFile(target);
    const metaPath = `${target}.meta.json`;
    let mimetype = 'application/octet-stream';

    try {
      if (existsSync(metaPath)) {
        const metaRaw = await readFile(metaPath, 'utf8');
        const meta = JSON.parse(metaRaw);
        if (meta?.contentType) {
          mimetype = meta.contentType;
        }
      }
    } catch {
      // fallback
    }

    return {
      bytes: new Uint8Array(buffer),
      mimetype,
    };
  }
}
