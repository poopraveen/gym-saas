import { Controller, Post, Get, Patch, Body, Query, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles';
import { AuthService } from '../auth/auth.service';
import { CaloriesService, ChatCalorieResult, DaySummary } from './calories.service';
import { ChatCalorieDto } from './dto/chat-calorie.dto';
import { AcceptDefaultDto } from './dto/accept-default.dto';
import { SetEntryDto } from './dto/set-entry.dto';

/**
 * Member-facing calorie tracking.
 * All data isolated by tenant and user (from JWT).
 * Staff can view a member's progress via /calories/member/:memberUserId/*.
 */
@Controller('calories')
@UseGuards(JwtAuthGuard)
export class CaloriesController {
  constructor(
    private readonly caloriesService: CaloriesService,
    private readonly authService: AuthService,
  ) {}

  private tenantId(req: any): string {
    return req.user?.tenantId;
  }

  private userId(req: any): string {
    return req.user?.userId;
  }

  /**
   * POST /calories/chat
   * Accepts free-form chat (e.g. "ate 2 idlis and sambar"), sends to OpenAI,
   * converts to calories, saves to DB. Returns structured result.
   */
  @Post('chat')
  async chat(@Req() req: any, @Body() body: ChatCalorieDto): Promise<ChatCalorieResult> {
    const tenantId = this.tenantId(req);
    const userId = this.userId(req);
    if (!tenantId || !userId) throw new Error('Unauthorized');
    return this.caloriesService.chat(tenantId, userId, body.message || '', {
      date: body.date,
      existingItems: body.existingItems,
    });
  }

  /** PATCH /calories/entry - replace a day's entry with given items (e.g. after removing items in edit). */
  @Patch('entry')
  async setEntry(@Req() req: any, @Body() body: SetEntryDto) {
    const tenantId = this.tenantId(req);
    const userId = this.userId(req);
    if (!tenantId || !userId) throw new Error('Unauthorized');
    return this.caloriesService.setEntry(tenantId, userId, body.date, body.items ?? []);
  }

  /** GET /calories/today - today's entry if any */
  @Get('today')
  async getToday(@Req() req: any) {
    const tenantId = this.tenantId(req);
    const userId = this.userId(req);
    if (!tenantId || !userId) throw new Error('Unauthorized');
    return this.caloriesService.getToday(tenantId, userId);
  }

  /** GET /calories/last-7-days - for dashboard alerts (missing days) */
  @Get('last-7-days')
  async getLast7Days(@Req() req: any): Promise<DaySummary[]> {
    const tenantId = this.tenantId(req);
    const userId = this.userId(req);
    if (!tenantId || !userId) throw new Error('Unauthorized');
    return this.caloriesService.getLast7Days(tenantId, userId);
  }

  /** GET /calories/history?from=YYYY-MM-DD&to=YYYY-MM-DD - for table and roadmap (from onboarded date) */
  @Get('history')
  async getHistory(
    @Req() req: any,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const tenantId = this.tenantId(req);
    const userId = this.userId(req);
    if (!tenantId || !userId) throw new Error('Unauthorized');
    const fromStr = from || new Date().toISOString().slice(0, 10);
    const toStr = to || new Date().toISOString().slice(0, 10);
    return this.caloriesService.getHistory(tenantId, userId, fromStr, toStr);
  }

  /**
   * POST /calories/accept-default
   * Fill a missing day with system-estimated default (Indian average).
   */
  @Post('accept-default')
  async acceptDefault(@Req() req: any, @Body() body: AcceptDefaultDto) {
    const tenantId = this.tenantId(req);
    const userId = this.userId(req);
    if (!tenantId || !userId) throw new Error('Unauthorized');
    return this.caloriesService.acceptDefault(
      tenantId,
      userId,
      body.date || new Date().toISOString().slice(0, 10),
      body.gender,
    );
  }

  /**
   * Staff only: get a member's calorie progress (member onboarded for AI).
   * GET /calories/member/:memberUserId/today
   */
  @Get('member/:memberUserId/today')
  @UseGuards(RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF)
  async getMemberToday(@Req() req: any, @Param('memberUserId') memberUserId: string) {
    const tenantId = this.tenantId(req);
    if (!tenantId) throw new Error('Unauthorized');
    await this.authService.assertMemberInTenant(tenantId, memberUserId);
    return this.caloriesService.getToday(tenantId, memberUserId);
  }

  /**
   * Staff only: get a member's last 7 days summary.
   */
  @Get('member/:memberUserId/last-7-days')
  @UseGuards(RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF)
  async getMemberLast7Days(
    @Req() req: any,
    @Param('memberUserId') memberUserId: string,
  ): Promise<DaySummary[]> {
    const tenantId = this.tenantId(req);
    if (!tenantId) throw new Error('Unauthorized');
    await this.authService.assertMemberInTenant(tenantId, memberUserId);
    return this.caloriesService.getLast7Days(tenantId, memberUserId);
  }

  /**
   * Staff only: get a member's calorie history for a date range.
   */
  @Get('member/:memberUserId/history')
  @UseGuards(RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF)
  async getMemberHistory(
    @Req() req: any,
    @Param('memberUserId') memberUserId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const tenantId = this.tenantId(req);
    if (!tenantId) throw new Error('Unauthorized');
    await this.authService.assertMemberInTenant(tenantId, memberUserId);
    const fromStr = from || new Date().toISOString().slice(0, 10);
    const toStr = to || new Date().toISOString().slice(0, 10);
    return this.caloriesService.getHistory(tenantId, memberUserId, fromStr, toStr);
  }
}
