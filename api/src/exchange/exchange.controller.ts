import {
  Controller,
  Post,
  Get,
  Param,
  UploadedFile,
  UseInterceptors,
  Res,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExchangeService } from './exchange.service';
import { Response } from 'express';

const MAX_FILE_MB = Number(process.env.MAX_FILE_MB ?? 25);
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

@Controller('exchange')
export class ExchangeController {
  constructor(private readonly exchangeService: ExchangeService) {}

  @Post('upload/:sessionId/:userId')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_BYTES },
    }),
  )
  async upload(
    @Param('sessionId') sessionId: string,
    @Param('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new HttpException('No file received', HttpStatus.BAD_REQUEST);
    }

    // (optionnel) bloque quelques types dangereux
    // Tu peux adapter en whitelist (pdf, zip, images, etc.)
    const blockedMimes = new Set([
      'application/x-msdownload',
      'application/x-msdos-program',
    ]);
    if (file.mimetype && blockedMimes.has(file.mimetype)) {
      throw new HttpException('File type not allowed', HttpStatus.BAD_REQUEST);
    }

    await this.exchangeService.uploadFile(sessionId, userId, file);

    return { success: true, maxFileMb: MAX_FILE_MB };
  }

  @Get('status/:sessionId/:userId')
  getStatus(
    @Param('sessionId') sessionId: string,
    @Param('userId') userId: string,
  ) {
    return this.exchangeService.getStatus(sessionId, userId);
  }

  @Get('preview/:sessionId/:userId')
  getPreview(
    @Param('sessionId') sessionId: string,
    @Param('userId') userId: string,
  ) {
    return this.exchangeService.getPreview(sessionId, userId);
  }

  @Post('validate/:sessionId/:userId')
  validate(
    @Param('sessionId') sessionId: string,
    @Param('userId') userId: string,
  ) {
    return this.exchangeService.validate(sessionId, userId);
  }

  @Get('download/:sessionId/:userId')
  async download(
    @Param('sessionId') sessionId: string,
    @Param('userId') userId: string,
    @Res() res: Response,
  ) {
    if (!this.exchangeService.canDownload(sessionId, userId)) {
      return res
        .status(403)
        .json({ error: 'Both parties must validate first' });
    }

    const download = await this.exchangeService.getPeerFileDownload(
      sessionId,
      userId,
    );

    if (!download) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.set({
      'Content-Type': download.mimetype ?? 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${download.originalname}"`,
      'Cache-Control': 'no-store',
    });

    return res.send(Buffer.from(download.bytes));
  }

  @Post('reset/:sessionId/:userId')
  async reset(
    @Param('sessionId') sessionId: string,
    @Param('userId') userId: string,
  ) {
    const ok = await this.exchangeService.resetSession(sessionId, userId);
    return ok ? { success: true } : { success: false };
  }
}
