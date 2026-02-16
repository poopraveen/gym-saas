import { Controller, Post, Get, Patch, Body, Query, Param, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles';
import { AuthService } from '../auth/auth.service';
import { CaloriesService, ChatCalorieResult, DaySummary } from './calories.service';
import { ChatCalorieDto } from './dto/chat-calorie.dto';
import { AcceptDefaultDto } from './dto/accept-default.dto';
import { SetEntryDto } from './dto/set-entry.dto';
import { AnalyzeDto } from './dto/analyze.dto';
import { SaveProfileDto } from './dto/profile.dto';

/**
 * Member-facing calorie tracking.
 * All data isolated by tenant and user (from JWT).
 * Trainer can view a member's progress via /calories/member/:memberUserId/*.
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

  /** GET /calories/profile - RDI profile for current user (from linked member if MEMBER). */
  @Get('profile')
  async getProfile(@Req() req: any) {
    const tenantId = this.tenantId(req);
    const userId = this.userId(req);
    if (!tenantId || !userId) throw new Error('Unauthorized');
    return this.caloriesService.getProfile(tenantId, userId);
  }

  /** POST /calories/profile - Save RDI profile (members only; stored on linked member). */
  @Post('profile')
  async saveProfile(@Req() req: any, @Body() body: SaveProfileDto) {
    const tenantId = this.tenantId(req);
    const userId = this.userId(req);
    if (!tenantId || !userId) throw new Error('Unauthorized');
    const profile = body ?? {};
    await this.caloriesService.saveProfile(tenantId, userId, {
      age: profile.age,
      gender: profile.gender,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      goal: profile.goal,
    });
    return { success: true };
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
   * Trainer only: get a member's calorie progress (member onboarded for AI).
   * GET /calories/member/:memberUserId/today
   */
  @Get('member/:memberUserId/today')
  @UseGuards(RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF, Role.TRAINER)
  async getMemberToday(@Req() req: any, @Param('memberUserId') memberUserId: string) {
    const tenantId = this.tenantId(req);
    const currentUserId = this.userId(req);
    const role = req.user?.role;
    if (!tenantId || !currentUserId) throw new Error('Unauthorized');
    if (role === Role.TRAINER) {
      const allowed = await this.authService.isMemberAssignedToTrainer(tenantId, currentUserId, memberUserId);
      if (!allowed) throw new ForbiddenException('Member is not assigned to you');
    } else {
      await this.authService.assertMemberInTenant(tenantId, memberUserId);
    }
    return this.caloriesService.getToday(tenantId, memberUserId);
  }

  /**
   * Trainer only: get a member's last 7 days summary.
   */
  @Get('member/:memberUserId/last-7-days')
  @UseGuards(RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF, Role.TRAINER)
  async getMemberLast7Days(
    @Req() req: any,
    @Param('memberUserId') memberUserId: string,
  ): Promise<DaySummary[]> {
    const tenantId = this.tenantId(req);
    const currentUserId = this.userId(req);
    const role = req.user?.role;
    if (!tenantId || !currentUserId) throw new Error('Unauthorized');
    if (role === Role.TRAINER) {
      const allowed = await this.authService.isMemberAssignedToTrainer(tenantId, currentUserId, memberUserId);
      if (!allowed) throw new ForbiddenException('Member is not assigned to you');
    } else {
      await this.authService.assertMemberInTenant(tenantId, memberUserId);
    }
    return this.caloriesService.getLast7Days(tenantId, memberUserId);
  }

  /**
   * Trainer only: get a member's calorie history for a date range.
   */
  @Get('member/:memberUserId/history')
  @UseGuards(RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF, Role.TRAINER)
  async getMemberHistory(
    @Req() req: any,
    @Param('memberUserId') memberUserId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const tenantId = this.tenantId(req);
    const currentUserId = this.userId(req);
    const role = req.user?.role;
    if (!tenantId || !currentUserId) throw new Error('Unauthorized');
    if (role === Role.TRAINER) {
      const allowed = await this.authService.isMemberAssignedToTrainer(tenantId, currentUserId, memberUserId);
      if (!allowed) throw new ForbiddenException('Member is not assigned to you');
    } else {
      await this.authService.assertMemberInTenant(tenantId, memberUserId);
    }
    const fromStr = from || new Date().toISOString().slice(0, 10);
    const toStr = to || new Date().toISOString().slice(0, 10);
    return this.caloriesService.getHistory(tenantId, memberUserId, fromStr, toStr);
  }

  /**
   * POST /calories/analyze
   * One-shot AI nutrition analysis: meals + optional userProfile → full breakdown,
   * daily total, RDI %, deficiencies, suggestions, improvements.
   */
  @Post('analyze')
  async analyze(@Req() req: any, @Body() body: AnalyzeDto) {
    const tenantId = this.tenantId(req);
    const userId = this.userId(req);
    if (!tenantId || !userId) throw new Error('Unauthorized');
    if (!body.meals?.length) throw new Error('At least one meal is required');
    return this.caloriesService.analyze(tenantId, userId, body.meals, {
      date: body.date,
      userProfile: body.userProfile,
    });
  }

  /**
   * GET /calories/analysis?date=YYYY-MM-DD
   * Get saved nutrition analysis for a date (tenant/user scoped).
   */
  @Get('analysis')
  async getAnalysis(@Req() req: any, @Query('date') date: string) {
    const tenantId = this.tenantId(req);
    const userId = this.userId(req);
    if (!tenantId || !userId) throw new Error('Unauthorized');
    const dateStr = date || new Date().toISOString().slice(0, 10);
    return this.caloriesService.getAnalysis(tenantId, userId, dateStr);
  }

  /**
   * Trainer only: get a member's saved nutrition analysis for a date.
   * GET /calories/member/:memberUserId/analysis?date=YYYY-MM-DD
   */
  @Get('member/:memberUserId/analysis')
  @UseGuards(RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF, Role.TRAINER)
  async getMemberAnalysis(
    @Req() req: any,
    @Param('memberUserId') memberUserId: string,
    @Query('date') date: string,
  ) {
    const tenantId = this.tenantId(req);
    const currentUserId = this.userId(req);
    const role = req.user?.role;
    if (!tenantId || !currentUserId) throw new Error('Unauthorized');
    if (role === Role.TRAINER) {
      const allowed = await this.authService.isMemberAssignedToTrainer(tenantId, currentUserId, memberUserId);
      if (!allowed) throw new ForbiddenException('Member is not assigned to you');
    } else {
      await this.authService.assertMemberInTenant(tenantId, memberUserId);
    }
    const dateStr = date || new Date().toISOString().slice(0, 10);
    return this.caloriesService.getAnalysis(tenantId, memberUserId, dateStr);
  }

  /**
   * Trainer: add food (chat) on behalf of a member. TRAINER can only do this for assigned members.
   */
  @Post('member/:memberUserId/chat')
  @UseGuards(RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF, Role.TRAINER)
  async chatOnBehalfOfMember(
    @Req() req: any,
    @Param('memberUserId') memberUserId: string,
    @Body() body: ChatCalorieDto,
  ): Promise<ChatCalorieResult> {
    const tenantId = this.tenantId(req);
    const currentUserId = this.userId(req);
    const role = req.user?.role;
    if (!tenantId || !currentUserId) throw new Error('Unauthorized');
    if (role === Role.TRAINER) {
      const allowed = await this.authService.isMemberAssignedToTrainer(tenantId, currentUserId, memberUserId);
      if (!allowed) throw new ForbiddenException('Member is not assigned to you');
    } else {
      await this.authService.assertMemberInTenant(tenantId, memberUserId);
    }
    return this.caloriesService.chat(tenantId, memberUserId, body.message || '', {
      date: body.date,
      existingItems: body.existingItems,
    });
  }

  /**
   * Trainer: set a day's entry (replace) on behalf of a member. TRAINER can only do this for assigned members.
   */
  @Patch('member/:memberUserId/entry')
  @UseGuards(RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF, Role.TRAINER)
  async setEntryOnBehalfOfMember(
    @Req() req: any,
    @Param('memberUserId') memberUserId: string,
    @Body() body: SetEntryDto,
  ) {
    const tenantId = this.tenantId(req);
    const currentUserId = this.userId(req);
    const role = req.user?.role;
    if (!tenantId || !currentUserId) throw new Error('Unauthorized');
    if (role === Role.TRAINER) {
      const allowed = await this.authService.isMemberAssignedToTrainer(tenantId, currentUserId, memberUserId);
      if (!allowed) throw new ForbiddenException('Member is not assigned to you');
    } else {
      await this.authService.assertMemberInTenant(tenantId, memberUserId);
    }
    return this.caloriesService.setEntry(tenantId, memberUserId, body.date, body.items ?? []);
  }

  /**
   * POST /calories/trainer/needs-attention
   * Trainer: submit member activity data and get AI analysis (who needs attention today).
   */
  @Post('trainer/needs-attention')
  @UseGuards(RolesGuard)
  @Roles(Role.TRAINER)
  async trainerNeedsAttention(
    @Req() req: any,
    @Body()
    body: {
      members: Array<{
        memberName: string;
        daysWorkoutMissed: number;
        mealFollowedYesterday: boolean;
        lastActivityDate: string;
        upcomingRenewalDate: string;
      }>;
    },
  ): Promise<{ result: string }> {
    const tenantId = this.tenantId(req);
    if (!tenantId) throw new Error('Unauthorized');
    const result = await this.caloriesService.needsAttentionAnalysis(body.members ?? []);
    return { result };
  }

  /**
   * GET /calories/trainer/assigned-summary
   * Trainer: compact AI summary of assigned members for mobile dashboard (tap to view).
   */
  @Get('trainer/assigned-summary')
  @UseGuards(RolesGuard)
  @Roles(Role.TRAINER)
  async trainerAssignedSummary(@Req() req: any): Promise<{ result: string }> {
    const tenantId = this.tenantId(req);
    const trainerUserId = this.userId(req);
    if (!tenantId || !trainerUserId) throw new Error('Unauthorized');
    const result = await this.caloriesService.assignedMembersSummary(tenantId, trainerUserId);
    return { result };
  }

  /**
   * GET /calories/reference-foods
   * List reference foods for food input (tenant-agnostic, shared).
   */
  @Get('reference-foods')
  async getReferenceFoods() {
    const { NUTRITION_REFERENCE } = await import('./data/nutrition-reference');
    const baseUnits = ['pieces', 'cups', 'grams', 'serving'];
    const liquidUnits = ['pieces', 'cups', 'grams', 'serving', 'ml'];
    return NUTRITION_REFERENCE.map((f) => ({
      id: f.id,
      name: f.name,
      defaultUnit: f.defaultUnit,
      units: f.liquid ? liquidUnits : baseUnits,
    }));
  }
}
