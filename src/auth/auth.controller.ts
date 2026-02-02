import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Role } from '../common/constants/roles';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: { email: string; password: string },
    @Headers('x-tenant-id') tenantId: string,
    @Headers('host') host: string,
    @Headers('x-forwarded-host') forwardedHost: string,
  ) {
    const resolvedHost = forwardedHost || host;
    return this.authService.login(
      body.email,
      body.password,
      tenantId || undefined,
      resolvedHost,
    );
  }

  @Post('register')
  async register(
    @Body()
    body: {
      email: string;
      password: string;
      name: string;
      role?: Role;
    },
    @Headers('x-tenant-id') tenantId: string,
  ) {
    if (!tenantId) throw new BadRequestException('X-Tenant-ID header required');
    return this.authService.register(
      body.email,
      body.password,
      tenantId,
      body.name,
      body.role || Role.STAFF,
    );
  }
}
