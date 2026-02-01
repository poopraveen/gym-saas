import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  health() {
    return {
      status: 'ok',
      message: 'Gym SaaS API',
      docs: '/api/docs',
      auth: '/api/auth/login',
    };
  }
}
