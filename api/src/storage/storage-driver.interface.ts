export interface StorageDriver {
  upload(path: string, buffer: Buffer, contentType: string): Promise<void>;

  remove(paths: string[]): Promise<void>;

  createSignedUrl(path: string, ttlSeconds: number): Promise<string>;

  download(path: string): Promise<{
    bytes: Uint8Array;
    mimetype?: string;
  }>;
}

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');
