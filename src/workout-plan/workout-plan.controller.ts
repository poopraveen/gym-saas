import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkoutPlanService } from './workout-plan.service';
import { UpsertWorkoutPlanDto } from './dto/workout-plan.dto';
import { CreateWorkoutLogDto } from './dto/workout-log.dto';

@Controller('workout-plan')
@UseGuards(JwtAuthGuard)
export class WorkoutPlanController {
  constructor(private readonly workoutPlanService: WorkoutPlanService) {}

  @Get()
  async getMine(@Req() req: { user: { tenantId: string; userId: string } }) {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.userId;
    if (!tenantId || !userId) throw new BadRequestException('Unauthorized');
    return this.workoutPlanService.getPlanForUser(tenantId, userId);
  }

  @Put()
  async upsertMine(
    @Req() req: { user: { tenantId: string; userId: string } },
    @Body() body: UpsertWorkoutPlanDto,
  ) {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.userId;
    if (!tenantId || !userId) throw new BadRequestException('Unauthorized');
    return this.workoutPlanService.upsertPlanForUser(tenantId, userId, body);
  }

  @Get('logs')
  async getMyLogs(
    @Req() req: { user: { tenantId: string; userId: string } },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.userId;
    if (!tenantId || !userId) throw new BadRequestException('Unauthorized');
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.workoutPlanService.getLogsForUser(tenantId, userId, {
      from: from?.slice(0, 10),
      to: to?.slice(0, 10),
      limit: isNaN(limitNum) ? 50 : Math.min(limitNum, 100),
    });
  }

  @Post('logs')
  async createLog(
    @Req() req: { user: { tenantId: string; userId: string } },
    @Body() body: CreateWorkoutLogDto,
  ) {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.userId;
    if (!tenantId || !userId) throw new BadRequestException('Unauthorized');
    try {
      return await this.workoutPlanService.createLogForUser(tenantId, userId, body);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Invalid request');
    }
  }

  @Delete('logs/:id')
  async deleteLog(
    @Req() req: { user: { tenantId: string; userId: string } },
    @Param('id') id: string,
  ) {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.userId;
    if (!tenantId || !userId) throw new BadRequestException('Unauthorized');
    const ok = await this.workoutPlanService.deleteLogForUser(tenantId, userId, id);
    if (!ok) throw new BadRequestException('Log not found');
    return { success: true };
  }
}
