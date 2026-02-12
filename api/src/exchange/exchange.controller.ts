import {
  Controller,
  Post,
  Get,
  Param,
  Headers,
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

  private tokenFromAuthHeader(authHeader?: string): string {
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      throw new HttpException('Missing Bearer token', HttpStatus.UNAUTHORIZED);
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new HttpException('Missing Bearer token', HttpStatus.UNAUTHORIZED);
    }

    return token;
  }

  private identityFromAuthHeader(authHeader?: string) {
    const token = this.tokenFromAuthHeader(authHeader);
    return this.exchangeService.parseSessionToken(token);
  }

  @Post('auth/new')
  createToken() {
    return this.exchangeService.createSessionTokenForNewUser();
  }

  @Post('invite')
  createInvite(@Headers('authorization') authHeader?: string) {
    const { sessionId, userId } = this.identityFromAuthHeader(authHeader);
    return this.exchangeService.createInvite(sessionId, userId);
  }

  @Post('invite/accept/:inviteCode')
  acceptInvite(@Param('inviteCode') inviteCode: string) {
    return this.exchangeService.acceptInvite(inviteCode);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_BYTES },
    }),
  )
  async uploadByToken(
    @Headers('authorization') authHeader: string | undefined,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new HttpException('No file received', HttpStatus.BAD_REQUEST);
    }

    const blockedMimes = new Set([
      'application/x-msdownload',
      'application/x-msdos-program',
    ]);
    if (file.mimetype && blockedMimes.has(file.mimetype)) {
      throw new HttpException('File type not allowed', HttpStatus.BAD_REQUEST);
    }

    const { sessionId, userId } = this.identityFromAuthHeader(authHeader);
    await this.exchangeService.uploadFile(sessionId, userId, file);
    return { success: true, maxFileMb: MAX_FILE_MB };
  }

  @Get('status')
  getStatusByToken(@Headers('authorization') authHeader?: string) {
    const { sessionId, userId } = this.identityFromAuthHeader(authHeader);
    return this.exchangeService.getStatus(sessionId, userId);
  }

  @Get('preview')
  getPreviewByToken(@Headers('authorization') authHeader?: string) {
    const { sessionId, userId } = this.identityFromAuthHeader(authHeader);
    return this.exchangeService.getPreview(sessionId, userId);
  }

  @Post('validate')
  validateByToken(@Headers('authorization') authHeader?: string) {
    const { sessionId, userId } = this.identityFromAuthHeader(authHeader);
    return this.exchangeService.validate(sessionId, userId);
  }

  @Get('download')
  async downloadByToken(
    @Headers('authorization') authHeader: string | undefined,
    @Res() res: Response,
  ) {
    const { sessionId, userId } = this.identityFromAuthHeader(authHeader);

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

  @Post('reset')
  async resetByToken(@Headers('authorization') authHeader?: string) {
    const { sessionId, userId } = this.identityFromAuthHeader(authHeader);
    const ok = await this.exchangeService.resetSession(sessionId, userId);
    return ok ? { success: true } : { success: false };
  }
}
