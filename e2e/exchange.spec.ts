import { expect, test } from '@playwright/test';

const API_OVERRIDE = 'http://localhost:3000/exchange';
const BASE_URL = `/?api=${encodeURIComponent(API_OVERRIDE)}`;

// Valid 200x200 PNG image buffer (generated with Sharp)
const VALID_200X200_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACtWK6eAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAFEElEQVR4nO3XsZFCQRDEUIIlpo2ps1oS4JwrCmQ8QwmoR/vh8Ty74MAN7K2DBzHicAP704FABCKQIxBH4CG4/3HgC+JwPB5HII7AQ3B9QRyBh+B81oGfWKIS1RGII/AQXF8QR+AhOH5iOQIPwf2WA/9BHJsH5wjEEXgIri+II/AQHD+xHIGH4PoP4gg8BOf3DvxJD4yAZR0IJDAClnUgkMAIWNaBQAIjYFkHAgmMgGUdCCQwApZ1IJDACFjWgUACI2BZBwIJjIBlHQgkMAKWdSCQwAhY1oFAAiNgWQcCCYyAZR0IJDAClnUgkMAIWNaBQAIjYFkHAgmMgGUdCCQwApZ1IJDACFjWgUACI2BZBwIJjIBlHQgkMAKWdSCQwAhY1oFAAiNgWQcCCYyAZR0IJDAClnUgkMAIWNaBQAIjYFkHAgmMgGUdCCQwApZ1IJDACFjWgUACI2BZBwIJjIBlHQgkMAKWdSCQwAhY1oFAAiNgWQcCCYyAZR0IJDAClnUgkMAIWNaBQAIjYFkHAgmMgGUdCCQwApZ1IJDACFjWgUACI2BZBwIJjIBlHQgkMAKWdSCQwAhY1oFAAiNgWQcCCYyAZR0IJDAClnUgkMAIWNaBQAIjYFkHAgmMgGUdCCQwApZ1IJDACFjWgUACI2BZBwIJjIBlHQgkMAKWdSCQwAhY1oFAAiNgWQcCCYyAZR0IJDAClnUgkMAIWNaBQAIjYFkHAgmMgGUdCCQwAroOBBIYAcs6EEhgBCzrQCCBEbCsA4EERsCyDgQSGAHLOhBIYAQs60AggRGwrAOBBEbAsg4EEhgByzoQSGAELOtAIIERsKwDgQRGwLIOBBIYAcs6EEhgBCzrQCCBEbCsA4EERsCyDgQSGAHLOhBIYAQs60AggRGwrAOBBEbAsg4EEhgByzoQSGAELOtAIIERsKwDgQRGwLIOBBIYAcs6EEhgBCzrQCCBEbCsA4EERsCyDgQSGAHLOhBIYAQs60AggRGwrAOBBEbAsg4EEhgByzoQSGAELOtAIIERsKwDgQRGwLIOBBIYAcs6EEhgBCzrQCCBEbCsA4EERsCyDgQSGAHLOhBIYAQs60AggRGwrAOBBEbAsg4EEhgByzoQSGAELOtAIIERsKwDgQRGwLIOBBIYAcs6EEhgBCzrQCCBEbCsA4EERsCyDgQSGAHLOhBIYAQs60AggRGwrAOBBEbAsg4EEhgByzoQSGAELOtAIIERsKwDgQRGwLIOBBIYAcs6EEhgBCzrQCCBEbCsA4EERsCyDgQSGAHLOhBIYAQs60AggRGwrAOBBEbAsg4EEhgByzoQSGAELOtAIIERsKwDgQRGwLIOBBIYAcs6EEhgBCzrQCCBEbCsA4EERsCyDgQSGAHLOhBIYAQs60AggRGwrAOBBEbAsg4EEhgByzoQSGAELOtAIIERsKwDgQRGwLIOBBIYAcs6EEhgBCzrQCCBEbCsA4EERsCyDgQSGAHLOhBIYAQs60AggRGwrAOBBEbAsg4EEhgByzoQSGAELOtAIIERsKwDgQRGwLIOBBIYAcs6EEhgBCzrQCCBEbCsA4EERsCyDgQSGAHLOhBIYAQs60AggRGwrAOBBEbAsg4EEhgByzoQSGAELOtAIIERsKwDgQRGwLIOBBIYAcs6EEhgBCzrQCCBEbCsA4EERsCyDgQSGAHLOhBIYAQs60AggRGwrAOBBEbAsg4EEhgByzoQSGAELOtAIIERsKwDgQRGwLIOBBIYAcs6EEhgBCzrQCCBEbCsA4EERsCyDgQSGAHLOhBIYAQs60AggRGwrAOBBEbAsg4EEhgByzoQSGAELOvjBcwXZXN4j1oVAAAAAElFTkSuQmCC',
  'base64',
);

test.describe('Lazarus Exchange v2 E2E', () => {
  test('Bilateral Fair Exchange: Alice and Bob exchange files, review blurred previews & download', async ({
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

    // 3. Both see peer connected in console status
    await expect(alicePage.locator('#statusBox')).toContainText(
      /Connected|Peer joined/i,
      { timeout: 10000 },
    );
    await expect(bobPage.locator('#statusBox')).toContainText(
      /Connected|Peer joined/i,
      { timeout: 10000 },
    );

    // 4. Alice uploads a text secret
    const aliceContent = 'Alice secret exchange payload 42';
    await alicePage.locator('#fileInput').setInputFiles({
      name: 'alice-secret.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(aliceContent),
    });
    await alicePage.locator('button:has-text("UPLOAD")').click();
    await expect(alicePage.locator('#toast')).toContainText(/upload/i, {
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
    await expect(bobPage.locator('#toast')).toContainText(/upload/i, {
      timeout: 10000,
    });

    // 6. Preview peer files
    // Bob clicks PREVIEW to see Alice's file preview
    await bobPage.locator('button:has-text("PREVIEW")').click();
    await expect(bobPage.locator('#previewImage')).toBeVisible({
      timeout: 10000,
    });
    await expect(bobPage.locator('#previewCaption')).toContainText(
      'alice-secret.txt',
    );

    // Alice clicks PREVIEW to see Bob's file preview
    await alicePage.locator('button:has-text("PREVIEW")').click();
    await expect(alicePage.locator('#previewImage')).toBeVisible({
      timeout: 10000,
    });
    await expect(alicePage.locator('#previewCaption')).toContainText(
      'bob-key.txt',
    );

    // 7. Both Validate
    await alicePage.locator('button:has-text("VALIDATE")').click();
    await expect(alicePage.locator('#toast')).toContainText('Validation sent');

    await bobPage.locator('button:has-text("VALIDATE")').click();
    await expect(bobPage.locator('#toast')).toContainText('Validation sent');

    // 8. Verify console status indicates exchange unlocked
    await expect(alicePage.locator('#statusBox')).toContainText(
      /Exchange unlocked|Unlocked/i,
      { timeout: 10000 },
    );

    // 9. Alice downloads Bob's file
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

    // 10. Bob downloads Alice's file
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

    // 11. Verify exchange completed successfully
    await expect(alicePage.locator('#statusBox')).toContainText(
      /Exchange completed successfully/i,
      { timeout: 10000 },
    );

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
    await expect(alicePage.locator('#toast')).toContainText(/upload/i);

    await bobPage.locator('#fileInput').setInputFiles({
      name: 'bob.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('bob file'),
    });
    await bobPage.locator('button:has-text("UPLOAD")').click();
    await expect(bobPage.locator('#toast')).toContainText(/upload/i);

    // 4. Both validate and wait for unlocked state
    await alicePage.locator('button:has-text("VALIDATE")').click();
    await expect(alicePage.locator('#toast')).toContainText('Validation sent');

    await bobPage.locator('button:has-text("VALIDATE")').click();
    await expect(bobPage.locator('#toast')).toContainText('Validation sent');

    await expect(alicePage.locator('#statusBox')).toContainText(
      /Exchange unlocked|Unlocked/i,
      { timeout: 10000 },
    );

    // 5. Bob downloads Alice's file
    await Promise.all([
      bobPage.waitForEvent('download'),
      bobPage.locator('button:has-text("DOWNLOAD")').click(),
    ]);

    // 6. Bob attempts to prematurely reset the session before Alice downloads
    await bobPage.locator('button:has-text("RESET")').click();

    // Verify Bob's reset is BLOCKED by anti-scam protection
    await expect(bobPage.locator('#toast')).toContainText(
      /reset blocked|grace period/i,
      { timeout: 5000 },
    );

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

  test('Nominal Session Reset: Clean reset after exchange completion and peer remote reset notification', async ({
    page: alicePage,
    browser,
  }) => {
    // 1. Setup session with both peers
    await alicePage.goto(BASE_URL);
    await expect(alicePage.locator('#sessionIdDisplay')).toHaveText(
      /^s_[a-z0-9]+$/i,
    );
    const initialSessionId = await alicePage
      .locator('#sessionIdDisplay')
      .textContent();
    const shareLink = await alicePage.locator('#shareLink').inputValue();

    const bobContext = await browser.newContext();
    const bobPage = await bobContext.newPage();
    await bobPage.goto(shareLink);

    // 2. Both upload, validate and download to reach completed state
    await alicePage.locator('#fileInput').setInputFiles({
      name: 'doc-a.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Document A payload'),
    });
    await alicePage.locator('button:has-text("UPLOAD")').click();
    await expect(alicePage.locator('#toast')).toContainText(/upload/i);

    await bobPage.locator('#fileInput').setInputFiles({
      name: 'doc-b.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Document B payload'),
    });
    await bobPage.locator('button:has-text("UPLOAD")').click();
    await expect(bobPage.locator('#toast')).toContainText(/upload/i);

    await alicePage.locator('button:has-text("VALIDATE")').click();
    await bobPage.locator('button:has-text("VALIDATE")').click();

    await expect(alicePage.locator('#statusBox')).toContainText(
      /Exchange unlocked|Unlocked/i,
      { timeout: 10000 },
    );

    await Promise.all([
      alicePage.waitForEvent('download'),
      alicePage.locator('button:has-text("DOWNLOAD")').click(),
    ]);
    await Promise.all([
      bobPage.waitForEvent('download'),
      bobPage.locator('button:has-text("DOWNLOAD")').click(),
    ]);

    await expect(alicePage.locator('#statusBox')).toContainText(
      /Exchange completed successfully/i,
      { timeout: 10000 },
    );

    // 3. Alice triggers nominal RESET
    await alicePage.locator('button:has-text("RESET")').click();

    // Verify Alice local session resets with fresh session ID and empty preview
    await expect(alicePage.locator('#toast')).toContainText(/reset/i);
    await expect(alicePage.locator('#previewCaption')).toContainText(
      /reset|no preview/i,
    );
    await expect(alicePage.locator('#previewImage')).toBeHidden();

    const newSessionId = await alicePage
      .locator('#sessionIdDisplay')
      .textContent();
    expect(newSessionId).not.toBe(initialSessionId);

    // 4. Bob's poller detects remote reset and updates UI
    await expect(bobPage.locator('#toast')).toContainText(/reset/i, {
      timeout: 10000,
    });
    await expect(bobPage.locator('#previewCaption')).toContainText(/reset/i);
    await expect(bobPage.locator('#previewImage')).toBeHidden();

    await bobContext.close();
  });

  test('Clipboard Copy UX: Clicking COPY button copies invite link to clipboard', async ({
    context,
    page,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(BASE_URL);
    await expect(page.locator('#sessionIdDisplay')).toHaveText(
      /^s_[a-z0-9]+$/i,
    );
    await expect(page.locator('#shareLink')).toHaveValue(/\/join\/[^/]+/, {
      timeout: 10000,
    });

    const shareLinkValue = await page.locator('#shareLink').inputValue();

    // Click COPY button
    await page.locator('button:has-text("COPY")').click();

    // Verify confirmation toast
    await expect(page.locator('#toast')).toContainText(
      'Share link copied to clipboard.',
    );

    // Verify clipboard content
    const clipboardText = await page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(clipboardText).toBe(shareLinkValue);
  });

  test('Multi-Format Upload & Preview: Image PNG preview generation and metadata display', async ({
    page: alicePage,
    browser,
  }) => {
    await alicePage.goto(BASE_URL);
    await expect(alicePage.locator('#sessionIdDisplay')).toHaveText(
      /^s_[a-z0-9]+$/i,
    );
    const shareLink = await alicePage.locator('#shareLink').inputValue();

    const bobContext = await browser.newContext();
    const bobPage = await bobContext.newPage();
    await bobPage.goto(shareLink);

    // Alice uploads PNG image
    await alicePage.locator('#fileInput').setInputFiles({
      name: 'network-diagram.png',
      mimeType: 'image/png',
      buffer: VALID_200X200_PNG,
    });
    await alicePage.locator('button:has-text("UPLOAD")').click();
    await expect(alicePage.locator('#toast')).toContainText(/upload/i);

    // Bob clicks PREVIEW to inspect Alice's image preview
    await bobPage.locator('button:has-text("PREVIEW")').click();
    await expect(bobPage.locator('#previewImage')).toBeVisible({
      timeout: 10000,
    });
    await expect(bobPage.locator('#previewCaption')).toContainText(
      'network-diagram.png',
    );
    await expect(bobPage.locator('#previewCaption')).toContainText('image/png');

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
});
