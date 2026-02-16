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
  ConflictException,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Role } from '../common/constants/roles';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: { email: string; password: string },
    @Headers('x-tenant-id') tenantId: string,
    @Headers('host') host: string,
    @Headers('x-forwarded-host') forwardedHost: string,
  ) {
    try {
      const resolvedHost = forwardedHost || host;
      return await this.authService.login(
        body?.email ?? '',
        body?.password ?? '',
        tenantId || undefined,
        resolvedHost,
      );
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof UnauthorizedException) throw err;
      this.logger.error('login failed', err instanceof Error ? err.stack : err);
      throw new InternalServerErrorException('Login failed. Check server logs.');
    }
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
      role?: Role.STAFF | Role.MANAGER | Role.TRAINER;
    },
  ) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new BadRequestException('Unauthorized');
    if (!body.email?.trim() || !body.password) {
      throw new BadRequestException('Email and password are required.');
    }
    const role = body.role === Role.MANAGER ? Role.MANAGER : body.role === Role.TRAINER ? Role.TRAINER : Role.STAFF;
    try {
      return await this.authService.register(
        body.email.trim(),
        body.password,
        tenantId,
        (body.name || body.email || '').trim() || body.email.trim(),
        role,
      );
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof ConflictException) throw err;
      this.logger.error('onboard-user failed', err instanceof Error ? err.stack : err);
      throw new InternalServerErrorException(
        err instanceof Error ? err.message : 'Failed to create user. Check server logs.',
      );
    }
  }

  /**
   * Tenant onboarding: create a member login for a gym member (role MEMBER).
   * They can log in later and see only Nutrition AI. Only Tenant Admin or Manager.
   */
  @Post('onboard-member')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.TRAINER)
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
   * List members onboarded for AI (Nutrition) in this tenant. Trainer/Admin only.
   * Used on /nutrition-ai to search and view member progress one by one.
   */
  @Get('ai-members')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF, Role.TRAINER)
  async listAiMembers(
    @Req() req: { user: { tenantId: string } },
    @Query('search') search: string | undefined,
  ) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new BadRequestException('Unauthorized');
    try {
      return await this.authService.listMemberUsers(tenantId, search);
    } catch (err) {
      this.logger.error('ai-members failed', err instanceof Error ? err.stack : err);
      return [];
    }
  }

  /**
   * Reset password for a member enrolled for AI. Returns new password once so admin can share it.
   * TENANT_ADMIN or MANAGER only.
   */
  @Post('reset-member-password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.TRAINER)
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

  /**
   * List trainers in the tenant (for admin to assign members to trainer).
   * TENANT_ADMIN or MANAGER only.
   */
  @Get('trainers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  async listTrainers(@Req() req: { user: { tenantId: string } }) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new BadRequestException('Unauthorized');
    try {
      return await this.authService.listTrainers(tenantId);
    } catch (err) {
      this.logger.error('trainers failed', err instanceof Error ? err.stack : err);
      return [];
    }
  }

  /**
   * Assign a member user to a trainer. TENANT_ADMIN or MANAGER only.
   */
  @Post('assign-member-to-trainer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  async assignMemberToTrainer(
    @Req() req: { user: { tenantId: string } },
    @Body() body: { trainerUserId: string; memberUserId: string },
  ) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new BadRequestException('Unauthorized');
    if (!body.trainerUserId || !body.memberUserId) throw new BadRequestException('trainerUserId and memberUserId required');
    await this.authService.assignMemberToTrainer(tenantId, body.trainerUserId, body.memberUserId);
    return { success: true };
  }

  /**
   * Unassign a member from their trainer. TENANT_ADMIN or MANAGER only.
   */
  @Delete('trainer-assignments/:memberUserId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  async unassignMemberFromTrainer(
    @Req() req: { user: { tenantId: string } },
    @Param('memberUserId') memberUserId: string,
  ) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new BadRequestException('Unauthorized');
    await this.authService.unassignMemberFromTrainer(tenantId, memberUserId);
    return { success: true };
  }

  /**
   * Get auth member user (enrolled for AI) by gym reg no. For admin edit screen to show/assign trainer.
   */
  @Get('member-user-by-reg')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  async getMemberUserByReg(
    @Req() req: { user: { tenantId: string } },
    @Query('regNo') regNo: string,
  ) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new BadRequestException('Unauthorized');
    const reg = regNo != null ? parseInt(String(regNo), 10) : NaN;
    if (Number.isNaN(reg)) throw new BadRequestException('regNo is required');
    return this.authService.getMemberUserByRegNo(tenantId, reg);
  }

  /**
   * Get current trainer assigned to a member (for admin UI). TENANT_ADMIN or MANAGER only.
   */
  @Get('member-assignment/:memberUserId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  async getMemberAssignment(
    @Req() req: { user: { tenantId: string } },
    @Param('memberUserId') memberUserId: string,
  ) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new BadRequestException('Unauthorized');
    const trainerUserId = await this.authService.getTrainerForMember(tenantId, memberUserId);
    return { trainerUserId };
  }

  /**
   * List all trainer assignments in the tenant (for admin UI). TENANT_ADMIN or MANAGER only.
   */
  @Get('trainer-assignments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  async listTrainerAssignments(@Req() req: { user: { tenantId: string } }) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new BadRequestException('Unauthorized');
    try {
      return await this.authService.listAssignmentsForTenant(tenantId);
    } catch (err) {
      this.logger.error('trainer-assignments failed', err instanceof Error ? err.stack : err);
      return [];
    }
  }

  /**
   * List member users assigned to the current trainer. TRAINER only.
   */
  @Get('my-assigned-members')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TRAINER)
  async getMyAssignedMembers(@Req() req: { user: { tenantId: string; userId: string } }) {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.userId;
    if (!tenantId || !userId) throw new BadRequestException('Unauthorized');
    return this.authService.getAssignedMembersForTrainer(tenantId, userId);
  }

  /**
   * Deactivate a trainer (they can no longer log in). Unassigns all their members. TENANT_ADMIN or MANAGER only.
   */
  @Delete('trainers/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  async deleteTrainer(
    @Req() req: { user: { tenantId: string } },
    @Param('userId') trainerUserId: string,
  ) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new BadRequestException('Unauthorized');
    await this.authService.deactivateTrainer(tenantId, trainerUserId);
    return { success: true };
  }
}
