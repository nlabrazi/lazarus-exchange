import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';

@Controller('health')
export class HealthController {
  @Get()
  health(@Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(HttpStatus.OK).json({ ok: true });
  }
}
