import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Req,
  Query,
  Param,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Role } from '../common/constants/roles';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

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

  /**
   * Tenant onboarding: add a new user (Staff or Manager) under the same tenant.
   * Only Tenant Admin or Manager can call. JWT required.
   */
  @Post('onboard-user')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  async onboardUser(
    @Req() req: { user: { tenantId: string } },
    @Body()
    body: {
      email: string;
      password: string;
      name: string;
      role?: Role.STAFF | Role.MANAGER;
    },
  ) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new BadRequestException('Unauthorized');
    const role = body.role === Role.MANAGER ? Role.MANAGER : Role.STAFF;
    return this.authService.register(
      body.email,
      body.password,
      tenantId,
      body.name || body.email,
      role,
    );
  }

  /**
   * Tenant onboarding: create a member login for a gym member (role MEMBER).
   * They can log in later and see only Nutrition AI. Only Tenant Admin or Manager.
   */
  @Post('onboard-member')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  async onboardMember(
    @Req() req: { user: { tenantId: string } },
    @Body()
    body: { email: string; password: string; name?: string; regNo: number },
  ) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new BadRequestException('Unauthorized');
    if (body.regNo == null) throw new BadRequestException('regNo is required');
    return this.authService.onboardMember(
      tenantId,
      body.email,
      body.password,
      body.name || '',
      Number(body.regNo),
    );
  }

  /** Get current user (for member onboarded date, etc.). JWT required. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: { user: { userId: string } }) {
    const userId = req.user?.userId;
    if (!userId) throw new BadRequestException('Unauthorized');
    return this.authService.getMe(userId);
  }

  /**
   * List members onboarded for AI (Nutrition) in this tenant. Staff/Admin only.
   * Used on /nutrition-ai to search and view member progress one by one.
   */
  @Get('ai-members')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF)
  async listAiMembers(
    @Req() req: { user: { tenantId: string } },
    @Query('search') search: string | undefined,
  ) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new BadRequestException('Unauthorized');
    return this.authService.listMemberUsers(tenantId, search);
  }

  /**
   * Reset password for a member enrolled for AI. Returns new password once so admin can share it.
   * TENANT_ADMIN or MANAGER only.
   */
  @Post('reset-member-password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  async resetMemberPassword(
    @Req() req: { user: { tenantId: string } },
    @Body() body: { userId: string; newPassword: string },
  ) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new BadRequestException('Unauthorized');
    if (!body.userId || !body.newPassword || body.newPassword.length < 6) {
      throw new BadRequestException('userId and newPassword (min 6 characters) required');
    }
    return this.authService.resetMemberPassword(tenantId, body.userId, body.newPassword);
  }

  /**
   * Deactivate a member user (remove Nutrition AI login). Soft delete.
   * TENANT_ADMIN or MANAGER only.
   */
  @Delete('member-users/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  async deactivateMemberUser(
    @Req() req: { user: { tenantId: string } },
    @Param('userId') userId: string,
  ) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new BadRequestException('Unauthorized');
    return this.authService.deactivateMemberUser(tenantId, userId);
  }
}
