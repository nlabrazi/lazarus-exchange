import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { LocalStorageDriver } from './local-storage.driver';

describe('LocalStorageDriver', () => {
  const testDir = join(__dirname, '../../test/tmp-storage');
  let driver: LocalStorageDriver;

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    driver = new LocalStorageDriver(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('uploads, creates signed data url, downloads, and removes file', async () => {
    const fileContent = Buffer.from('hello test storage', 'utf8');
    const path = 'originals/s_123/f_456.txt';

    await driver.upload(path, fileContent, 'text/plain');

    const download = await driver.download(path);
    expect(download.mimetype).toBe('text/plain');
    expect(Buffer.from(download.bytes).toString('utf8')).toBe(
      'hello test storage',
    );

    const signedUrl = await driver.createSignedUrl(path, 60);
    expect(signedUrl).toContain('data:text/plain;base64,');

    await driver.remove([path]);
    await expect(driver.download(path)).rejects.toThrow();
  });
});
