import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { errorMessageFromUnknown } from '../exchange/exchange-shared.utils';
import type { StorageDriver } from './storage-driver.interface';

@Injectable()
export class SupabaseStorageDriver implements StorageDriver {
  private readonly supabase: ReturnType<typeof createClient>;
  private readonly bucket: string;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment',
      );
    }

    this.supabase = createClient(url, key, { auth: { persistSession: false } });
    this.bucket = (process.env.SUPABASE_BUCKET ?? '').trim() || 'exchange';
  }

  private throwStorageError(prefix: string, error: unknown): never {
    throw new HttpException(
      `${prefix}: ${errorMessageFromUnknown(error)}`,
      HttpStatus.BAD_GATEWAY,
    );
  }

  async upload(
    path: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    const { error } = await this.supabase.storage
      .from(this.bucket)
      .upload(path, buffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      this.throwStorageError('Supabase upload failed', error);
    }
  }

  async remove(paths: string[]): Promise<void> {
    const unique = [...new Set(paths.filter(Boolean))];
    if (unique.length === 0) return;

    const { error } = await this.supabase.storage
      .from(this.bucket)
      .remove(unique);
    if (error) {
      this.throwStorageError('Supabase remove failed', error);
    }
  }

  async createSignedUrl(path: string, ttlSeconds: number): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(path, ttlSeconds);

    if (error) {
      this.throwStorageError('Supabase signed URL failed', error);
    }
    if (!data?.signedUrl) {
      throw new HttpException(
        'Supabase signed URL missing',
        HttpStatus.BAD_GATEWAY,
      );
    }

    return data.signedUrl;
  }

  async download(
    path: string,
  ): Promise<{ bytes: Uint8Array; mimetype?: string }> {
    const signedUrl = await this.createSignedUrl(path, 60);
    const resp = await fetch(signedUrl);

    if (!resp.ok) {
      throw new HttpException(
        `Download failed with status ${resp.status}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const arrayBuffer = await resp.arrayBuffer();
    const contentType =
      resp.headers.get('content-type') || 'application/octet-stream';

    return {
      bytes: new Uint8Array(arrayBuffer),
      mimetype: contentType,
    };
  }
}
