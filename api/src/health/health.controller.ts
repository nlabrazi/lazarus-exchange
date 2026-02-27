import {
  Controller,
  Get,
  Query,
  Res,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) { }

  @Get()
  health(@Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(HttpStatus.OK).json({ ok: true });
  }

  @Get('db')
  async healthDb(@Query('key') key: string | undefined, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');

    // Protection with API key (optional, but recommended for security)
    const expected = (process.env.HEALTH_KEY ?? '').trim();
    if (expected && key !== expected) {
      return res.status(HttpStatus.UNAUTHORIZED).json({
        ok: false,
        error: 'unauthorized',
      });
    }

    try {
      await this.healthService.checkSupabaseStorage();
      return res.status(HttpStatus.OK).json({ ok: true, storage: 'up' });
    } catch {
      return res
        .status(HttpStatus.SERVICE_UNAVAILABLE)
        .json({ ok: false, storage: 'down' });
    }
  }
}