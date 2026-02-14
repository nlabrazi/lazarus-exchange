import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import sharp = require('sharp');
import { PDFParse } from 'pdf-parse';
import { GeneratedPreview, ValidatedMime } from './exchange-file.types';

const PREVIEW_WEBP_QUALITY = 58;
const TEXT_PREVIEW_WIDTH = 1200;
const TEXT_PREVIEW_HEIGHT = 760;
const TEXT_PREVIEW_MAX_CHARS = 520;
const TEXT_PREVIEW_MAX_LINES = 9;

@Injectable()
export class ExchangePreviewService {
  private readonly logger = new Logger(ExchangePreviewService.name);

  async generatePreview(
    file: Express.Multer.File,
    validatedMime: ValidatedMime,
    safeFileName: string,
  ): Promise<GeneratedPreview> {
    switch (validatedMime.mime) {
      case 'image/jpeg':
      case 'image/png':
      case 'image/webp':
        return this.generateBlurredRasterPreview(file.buffer, 'image');

      case 'application/pdf':
        return this.generatePdfPreview(file.buffer, safeFileName);

      case 'text/plain': {
        const decoded = this.normalizePreviewText(this.decodeTextUtf8(file.buffer));
        const previewText = decoded || '(empty text file)';
        return this.renderDocumentPreviewCard(
          safeFileName,
          'Text document • first snippet',
          previewText,
        );
      }

      default:
        throw new HttpException('Unsupported file type', HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    }
  }

  private decodeTextUtf8(buffer: Buffer): string {
    if (!buffer.length) return '';
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      return new TextDecoder('utf-8').decode(buffer);
    }
  }

  private normalizePreviewText(
    source: string,
    maxChars = TEXT_PREVIEW_MAX_CHARS,
  ): string {
    const normalized = source
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!normalized) return '';
    return normalized.slice(0, maxChars);
  }

  private obfuscatePreviewText(source: string): string {
    const normalized = this.normalizePreviewText(source, TEXT_PREVIEW_MAX_CHARS);
    if (!normalized) return '';

    let exposedChars = 0;
    let out = '';

    for (let idx = 0; idx < normalized.length; idx += 1) {
      const char = normalized[idx];
      if (char === '\n' || char === ' ' || char === '\t') {
        out += char;
        continue;
      }

      if (/[A-Za-z]/.test(char)) {
        const keep = idx % 29 === 0 && exposedChars < 16;
        out += keep ? char : '•';
        if (keep) exposedChars += 1;
        continue;
      }

      if (/[0-9]/.test(char)) {
        out += '#';
        continue;
      }

      if (/[,.;:!?()[\]{}'"\/\\-]/.test(char)) {
        out += char;
        continue;
      }

      out += '•';
    }

    return out;
  }

  private escapeSvgText(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private wrapTextLines(
    rawText: string,
    maxLineLength: number,
    maxLines: number,
  ): string[] {
    const words = rawText.replace(/\n/g, ' \n ').split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      if (word === '\n') {
        if (current) lines.push(current);
        current = '';
        if (lines.length >= maxLines) break;
        continue;
      }

      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxLineLength) {
        current = candidate;
        continue;
      }

      if (current) lines.push(current);
      current = word.length > maxLineLength ? word.slice(0, maxLineLength) : word;
      if (lines.length >= maxLines) break;
    }

    if (lines.length < maxLines && current) {
      lines.push(current);
    }

    return lines.slice(0, maxLines);
  }

  private async renderDocumentPreviewCard(
    title: string,
    subtitle: string,
    body: string,
  ): Promise<GeneratedPreview> {
    const safeTitle = this.escapeSvgText(title.slice(0, 78));
    const safeSubtitle = this.escapeSvgText(subtitle.slice(0, 130));
    const lines = this.wrapTextLines(
      this.obfuscatePreviewText(body),
      58,
      TEXT_PREVIEW_MAX_LINES,
    );

    const tspanLines = lines
      .map(
        (line, index) =>
          `<tspan x="78" y="${226 + index * 37}">${this.escapeSvgText(line)}</tspan>`,
      )
      .join('');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TEXT_PREVIEW_WIDTH}" height="${TEXT_PREVIEW_HEIGHT}" viewBox="0 0 ${TEXT_PREVIEW_WIDTH} ${TEXT_PREVIEW_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a1a13"/>
      <stop offset="100%" stop-color="#040b08"/>
    </linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#2dcf8e" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="#2dcf8e" stop-opacity="0"/>
    </linearGradient>
    <filter id="docBlur">
      <feGaussianBlur stdDeviation="4.8"/>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect x="46" y="44" width="1108" height="672" rx="18" fill="#07120d" stroke="#2dcf8e" stroke-opacity="0.34"/>
  <rect x="62" y="68" width="1076" height="6" fill="url(#bar)"/>
  <text x="78" y="128" fill="#9ce8c6" font-size="36" font-family="monospace">${safeTitle}</text>
  <text x="78" y="168" fill="#5ea488" font-size="21" font-family="monospace">${safeSubtitle}</text>
  <g filter="url(#docBlur)">
    <text fill="#8ddfba" font-size="25" font-family="monospace">${tspanLines}</text>
  </g>
  <rect x="62" y="640" width="1076" height="54" fill="#0b1812" fill-opacity="0.85" stroke="#2dcf8e" stroke-opacity="0.28"/>
  <text x="78" y="675" fill="#68b392" font-size="20" font-family="monospace">Secure blurred preview • partial content only</text>
</svg>`;

    const { data, info } = await sharp(Buffer.from(svg))
      .resize({
        width: 560,
        height: 360,
        fit: 'inside',
        kernel: sharp.kernel.nearest,
      })
      .resize({
        width: TEXT_PREVIEW_WIDTH,
        height: TEXT_PREVIEW_HEIGHT,
        fit: 'fill',
        kernel: sharp.kernel.nearest,
      })
      .blur(4.2)
      .webp({ quality: PREVIEW_WEBP_QUALITY + 8 })
      .toBuffer({ resolveWithObject: true });

    return {
      bytes: data,
      meta: {
        format: 'webp',
        width: info.width ?? TEXT_PREVIEW_WIDTH,
        height: info.height ?? TEXT_PREVIEW_HEIGHT,
        sizeBytes: data.length,
        sourceKind: 'document',
      },
    };
  }

  private async generateBlurredRasterPreview(
    source: Buffer,
    sourceKind: 'image' | 'document',
  ): Promise<GeneratedPreview> {
    const sourceSharp = sharp(source, { failOnError: true });
    const sourceMeta = await sourceSharp.metadata();

    if (!sourceMeta.width || !sourceMeta.height) {
      throw new HttpException('Unable to render preview image', HttpStatus.BAD_REQUEST);
    }

    const cropRatio = sourceKind === 'image' ? 0.72 : 0.9;
    const cropWidth = Math.max(96, Math.floor(sourceMeta.width * cropRatio));
    const cropHeight = Math.max(96, Math.floor(sourceMeta.height * cropRatio));
    const left = Math.max(0, Math.floor((sourceMeta.width - cropWidth) / 2));
    const top = Math.max(0, Math.floor((sourceMeta.height - cropHeight) / 2));
    const blurStrength = sourceKind === 'image' ? 17 : 9;

    const { data, info } = await sharp(source)
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .resize({ width: 960, height: 640, fit: 'inside', withoutEnlargement: true })
      .blur(blurStrength)
      .webp({ quality: PREVIEW_WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });

    return {
      bytes: data,
      meta: {
        format: 'webp',
        width: info.width ?? 960,
        height: info.height ?? 640,
        sizeBytes: data.length,
        sourceKind,
      },
    };
  }

  private async generatePdfPreview(
    fileBuffer: Buffer,
    safeFileName: string,
  ): Promise<GeneratedPreview> {
    const parser = new PDFParse({ data: new Uint8Array(fileBuffer) });
    let screenshotBuffer: Buffer | null = null;
    let extractedText = '';

    try {
      try {
        const screenshot = await parser.getScreenshot({
          partial: [1],
          desiredWidth: 1280,
          imageBuffer: true,
          imageDataUrl: false,
        });
        const firstPage = screenshot.pages[0];
        if (firstPage?.data?.length) {
          screenshotBuffer = Buffer.from(firstPage.data);
        }
      } catch (error) {
        this.logger.warn(
          `pdf_screenshot_preview_failed file=${safeFileName} error=${this.errorMessage(error)}`,
        );
      }

      if (!screenshotBuffer) {
        try {
          const textResult = await parser.getText({ partial: [1] });
          extractedText = textResult?.text ?? '';
        } catch (error) {
          this.logger.warn(
            `pdf_text_preview_failed file=${safeFileName} error=${this.errorMessage(error)}`,
          );
        }
      }
    } finally {
      await parser.destroy().catch(() => undefined);
    }

    if (screenshotBuffer) {
      return this.generateBlurredRasterPreview(screenshotBuffer, 'document');
    }

    const fallbackText =
      this.normalizePreviewText(extractedText) ||
      'No readable text was extracted from the first page.';

    return this.renderDocumentPreviewCard(
      safeFileName,
      'PDF document • first page snippet',
      fallbackText,
    );
  }

  private errorMessage(err: unknown): string {
    if (typeof err === 'object' && err !== null && 'message' in err) {
      const msg = (err as { message?: unknown }).message;
      if (typeof msg === 'string') return msg;
    }
    return 'Unknown error';
  }
}
