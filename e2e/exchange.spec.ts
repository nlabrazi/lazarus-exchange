import { expect, test } from '@playwright/test';

const API_OVERRIDE = 'http://localhost:3000/exchange';
const BASE_URL = `/?api=${encodeURIComponent(API_OVERRIDE)}`;

test.describe('Lazarus Exchange v2 E2E', () => {
  test('Bilateral Fair Exchange: Alice and Bob exchange files, verify SHA256 & download', async ({
    page: alicePage,
    browser,
  }) => {
    // 1. Alice creates room
    await alicePage.goto(BASE_URL);
    await expect(alicePage.locator('#sessionIdDisplay')).toHaveText(
      /^s_[a-z0-9]+$/i,
      {
        timeout: 10000,
      },
    );
    await expect(alicePage.locator('#shareLink')).toHaveValue(/\/join\/[^/]+/, {
      timeout: 10000,
    });

    const shareLink = await alicePage.locator('#shareLink').inputValue();
    expect(shareLink).toContain('/join/');

    // 2. Bob joins via Alice's share link in an isolated context
    const bobContext = await browser.newContext();
    const bobPage = await bobContext.newPage();
    await bobPage.goto(shareLink);

    await expect(bobPage.locator('#sessionIdDisplay')).toHaveText(
      /^s_[a-z0-9]+$/i,
      {
        timeout: 10000,
      },
    );

    // 3. Both see Stepper at Step 2 (Upload) or paired
    await expect(alicePage.locator('.step[data-step="2"]')).toBeVisible();
    await expect(bobPage.locator('.step[data-step="2"]')).toBeVisible();

    // 4. Alice uploads a text secret
    const aliceContent = 'Alice secret exchange payload 42';
    await alicePage.locator('#fileInput').setInputFiles({
      name: 'alice-secret.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(aliceContent),
    });
    await alicePage.locator('button:has-text("UPLOAD")').click();
    await expect(alicePage.locator('#toast')).toContainText('Upload complete', {
      timeout: 10000,
    });

    // 5. Bob uploads a different document
    const bobContent = 'Bob confidential cryptographic key 99';
    await bobPage.locator('#fileInput').setInputFiles({
      name: 'bob-key.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(bobContent),
    });
    await bobPage.locator('button:has-text("UPLOAD")').click();
    await expect(bobPage.locator('#toast')).toContainText('Upload complete', {
      timeout: 10000,
    });

    // 6. Preview peer files
    // Bob clicks PREVIEW to see Alice's file preview
    await bobPage.locator('button:has-text("PREVIEW")').click();
    await expect(bobPage.locator('#previewImage')).toBeVisible({
      timeout: 10000,
    });

    // Alice clicks PREVIEW to see Bob's file preview
    await alicePage.locator('button:has-text("PREVIEW")').click();
    await expect(alicePage.locator('#previewImage')).toBeVisible({
      timeout: 10000,
    });

    // 7. Verify SHA-256 hashes are displayed on both sides
    await expect(alicePage.locator('#mySha256')).toHaveText(/^[a-f0-9]{64}$/i, {
      timeout: 5000,
    });
    await expect(alicePage.locator('#peerSha256')).toHaveText(
      /^[a-f0-9]{64}$/i,
      {
        timeout: 5000,
      },
    );
    await expect(bobPage.locator('#mySha256')).toHaveText(/^[a-f0-9]{64}$/i, {
      timeout: 5000,
    });
    await expect(bobPage.locator('#peerSha256')).toHaveText(/^[a-f0-9]{64}$/i, {
      timeout: 5000,
    });

    // Cross-check that Alice's peer hash is Bob's hash and vice-versa
    const aliceMyHash = await alicePage.locator('#mySha256').textContent();
    const bobPeerHash = await bobPage.locator('#peerSha256').textContent();
    expect(aliceMyHash).toBe(bobPeerHash);

    // 8. Both Validate
    await alicePage.locator('button:has-text("VALIDATE")').click();
    await expect(alicePage.locator('#toast')).toContainText('Validation sent');

    await bobPage.locator('button:has-text("VALIDATE")').click();
    await expect(bobPage.locator('#toast')).toContainText('Validation sent');

    // 9. Verify Stepper reaches step 5 (Download) and countdown banner is displayed
    await expect(alicePage.locator('.step[data-step="5"]')).toHaveClass(
      /is-active/,
    );
    await expect(bobPage.locator('.step[data-step="5"]')).toHaveClass(
      /is-active/,
    );
    await expect(alicePage.locator('#countdownBanner')).toBeVisible();

    // 10. Alice downloads Bob's file
    const [downloadAlice] = await Promise.all([
      alicePage.waitForEvent('download'),
      alicePage.locator('button:has-text("DOWNLOAD")').click(),
    ]);
    const aliceStream = await downloadAlice.createReadStream();
    const aliceChunks: Buffer[] = [];
    for await (const chunk of aliceStream) {
      aliceChunks.push(Buffer.from(chunk));
    }
    const downloadedByAlice = Buffer.concat(aliceChunks).toString('utf-8');
    expect(downloadedByAlice).toBe(bobContent);

    // 11. Bob downloads Alice's file
    const [downloadBob] = await Promise.all([
      bobPage.waitForEvent('download'),
      bobPage.locator('button:has-text("DOWNLOAD")').click(),
    ]);
    const bobStream = await downloadBob.createReadStream();
    const bobChunks: Buffer[] = [];
    for await (const chunk of bobStream) {
      bobChunks.push(Buffer.from(chunk));
    }
    const downloadedByBob = Buffer.concat(bobChunks).toString('utf-8');
    expect(downloadedByBob).toBe(aliceContent);

    await bobContext.close();
  });

  test('Anti-Scam Protection: Reset is blocked when peer has not downloaded during grace period', async ({
    page: alicePage,
    browser,
  }) => {
    // 1. Alice creates room
    await alicePage.goto(BASE_URL);
    await expect(alicePage.locator('#sessionIdDisplay')).toHaveText(
      /^s_[a-z0-9]+$/i,
    );
    const shareLink = await alicePage.locator('#shareLink').inputValue();

    // 2. Bob joins
    const bobContext = await browser.newContext();
    const bobPage = await bobContext.newPage();
    await bobPage.goto(shareLink);

    // 3. Both upload
    await alicePage.locator('#fileInput').setInputFiles({
      name: 'alice.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('alice file'),
    });
    await alicePage.locator('button:has-text("UPLOAD")').click();
    await expect(alicePage.locator('#toast')).toContainText('Upload complete');

    await bobPage.locator('#fileInput').setInputFiles({
      name: 'bob.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('bob file'),
    });
    await bobPage.locator('button:has-text("UPLOAD")').click();
    await expect(bobPage.locator('#toast')).toContainText('Upload complete');

    // 4. Both validate and wait for unlocked state
    await alicePage.locator('button:has-text("VALIDATE")').click();
    await expect(alicePage.locator('#toast')).toContainText('Validation sent');

    await bobPage.locator('button:has-text("VALIDATE")').click();
    await expect(bobPage.locator('#toast')).toContainText('Validation sent');

    await expect(alicePage.locator('.step[data-step="5"]')).toHaveClass(
      /is-active/,
    );
    await expect(bobPage.locator('.step[data-step="5"]')).toHaveClass(
      /is-active/,
    );

    // 5. Bob downloads Alice's file
    await Promise.all([
      bobPage.waitForEvent('download'),
      bobPage.locator('button:has-text("DOWNLOAD")').click(),
    ]);

    // 6. Bob attempts to prematurely reset the session before Alice downloads
    await bobPage.locator('button:has-text("RESET")').click();

    // Verify Bob's reset is BLOCKED by anti-scam protection
    await expect(bobPage.locator('#toast')).toContainText('Reset blocked', {
      timeout: 5000,
    });

    // 7. Alice is still able to download Bob's file safely
    const [aliceDownload] = await Promise.all([
      alicePage.waitForEvent('download'),
      alicePage.locator('button:has-text("DOWNLOAD")').click(),
    ]);
    const stream = await aliceDownload.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).toString('utf-8')).toBe('bob file');

    await bobContext.close();
  });

  test('Policy Rejection: Unauthorized file extensions are rejected', async ({
    page,
  }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('#sessionIdDisplay')).toHaveText(
      /^s_[a-z0-9]+$/i,
    );

    // Try to upload an executable binary
    await page.locator('#fileInput').setInputFiles({
      name: 'malware.exe',
      mimeType: 'application/x-msdownload',
      buffer: Buffer.from('MZ...executable payload'),
    });
    await page.locator('button:has-text("UPLOAD")').click();

    // Expect error toast
    await expect(page.locator('#toast')).toHaveClass(/is-visible/);
    await expect(page.locator('#toast')).toContainText(
      /not allowed|forbidden|error|invalid/i,
    );
  });

  test('Drag and Drop UX: Dropping a file updates dropzone label and triggers upload', async ({
    page,
  }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('#sessionIdDisplay')).toHaveText(
      /^s_[a-z0-9]+$/i,
    );

    // Simulate drop on dropzone
    await page.evaluate(() => {
      const dt = new DataTransfer();
      const file = new File(['dropped secret content'], 'dragged-file.txt', {
        type: 'text/plain',
      });
      dt.items.add(file);
      const dropzone = document.getElementById('dropzone');
      dropzone?.dispatchEvent(
        new DragEvent('drop', { dataTransfer: dt, bubbles: true }),
      );
    });

    // Verify dropzone label updated
    await expect(page.locator('#dropzoneText')).toContainText(
      'dragged-file.txt',
    );

    // Verify upload toast triggers automatically
    await expect(page.locator('#toast')).toContainText('Upload complete', {
      timeout: 10000,
    });
  });
});
