import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth(): { status: string; uptime: number; timestamp: string } {
    return {
      status: 'ok',
      uptime: process.uptime(), // app running time in seconds
      timestamp: new Date().toISOString(), // current ISO timestamp
    };
  }
}
