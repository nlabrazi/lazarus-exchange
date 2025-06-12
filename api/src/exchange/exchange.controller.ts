import {
  Controller,
  Post,
  Get,
  Param,
  UploadedFile,
  UseInterceptors,
  Body,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExchangeService } from './exchange.service';
import { Response } from 'express';

@Controller('exchange')
export class ExchangeController {
  constructor(private readonly exchangeService: ExchangeService) { }

  @Post('upload/:sessionId/:userId')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('sessionId') sessionId: string,
    @Param('userId') userId: 'user1' | 'user2',
    @UploadedFile() file: Express.Multer.File,
  ) {
    this.exchangeService.uploadFile(sessionId, userId, file);
    return { success: true };
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
  download(
    @Param('sessionId') sessionId: string,
    @Param('userId') userId: string,
    @Res() res: Response,
  ) {
    if (!this.exchangeService.canDownload(sessionId, userId)) {
      return res
        .status(403)
        .json({ error: 'Both parties must validate first' });
    }

    const file = this.exchangeService.getFile(sessionId, userId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.set({
      'Content-Type': file.mimetype,
      'Content-Disposition': `attachment; filename="${file.originalname}"`,
    });
    res.send(file.buffer);
  }
}
