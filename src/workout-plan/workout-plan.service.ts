import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WorkoutPlan, PlanDay } from './schemas/workout-plan.schema';
import { WorkoutLog } from './schemas/workout-log.schema';
import { UpsertWorkoutPlanDto } from './dto/workout-plan.dto';
import { CreateWorkoutLogDto } from './dto/workout-log.dto';

@Injectable()
export class WorkoutPlanService {
  constructor(
    @InjectModel(WorkoutPlan.name) private planModel: Model<WorkoutPlan>,
    @InjectModel(WorkoutLog.name) private logModel: Model<WorkoutLog>,
  ) {}

  async getPlanForUser(tenantId: string, userId: string): Promise<{ name: string; days: PlanDay[]; updatedAt?: string } | null> {
    const doc = await this.planModel.findOne({ tenantId, userId }).lean();
    if (!doc) return null;
    const d = doc as any;
    return {
      name: d.name ?? 'My Plan',
      days: Array.isArray(d.days) ? d.days : [],
      updatedAt: d.updatedAt?.toISOString?.(),
    };
  }

  async upsertPlanForUser(
    tenantId: string,
    userId: string,
    dto: UpsertWorkoutPlanDto,
  ): Promise<{ name: string; days: PlanDay[]; updatedAt: string }> {
    const days = Array.isArray(dto.days)
      ? dto.days
          .filter((x) => x != null && typeof x.dayOfWeek === 'number')
          .map((x) => ({ dayOfWeek: x.dayOfWeek, label: String(x.label ?? '').trim() || 'Rest' }))
      : [];
    const name = (dto.name ?? '').trim() || 'My Plan';
    await this.planModel.updateOne(
      { tenantId, userId },
      { $set: { name, days, updatedAt: new Date() }, $setOnInsert: { tenantId, userId } },
      { upsert: true },
    );
    const updated = await this.getPlanForUser(tenantId, userId);
    return {
      name: updated?.name ?? name,
      days: updated?.days ?? days,
      updatedAt: updated?.updatedAt ?? new Date().toISOString(),
    };
  }

  async getLogsForUser(
    tenantId: string,
    userId: string,
    options?: { from?: string; to?: string; limit?: number },
  ): Promise<Array<{ _id: string; date: string; workoutLabel: string; notes?: string; durationMinutes?: number; createdAt: string }>> {
    const query: Record<string, unknown> = { tenantId, userId };
    if (options?.from || options?.to) {
      query.date = {};
      if (options.from) (query.date as Record<string, string>).$gte = options.from;
      if (options.to) (query.date as Record<string, string>).$lte = options.to;
    }
    const limit = Math.min(options?.limit ?? 50, 100);
    const docs = await this.logModel
      .find(query)
      .sort({ date: -1, createdAt: -1 })
      .limit(limit)
      .lean();
    return docs.map((d) => {
      const x = d as any;
      return {
        _id: String(x._id),
        date: x.date,
        workoutLabel: x.workoutLabel,
        notes: x.notes,
        durationMinutes: x.durationMinutes,
        createdAt: x.createdAt?.toISOString?.() ?? new Date().toISOString(),
      };
    });
  }

  async createLogForUser(
    tenantId: string,
    userId: string,
    dto: CreateWorkoutLogDto,
  ): Promise<{ _id: string; date: string; workoutLabel: string; notes?: string; durationMinutes?: number; createdAt: string }> {
    const date = String(dto.date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('Invalid date format. Use YYYY-MM-DD.');
    }
    const workoutLabel = String(dto.workoutLabel ?? '').trim();
    if (!workoutLabel) throw new Error('Workout label is required.');
    const doc = await this.logModel.create({
      tenantId,
      userId,
      date,
      workoutLabel,
      notes: dto.notes?.trim() || undefined,
      durationMinutes: dto.durationMinutes != null ? Number(dto.durationMinutes) : undefined,
    });
    return {
      _id: String(doc._id),
      date: doc.date,
      workoutLabel: doc.workoutLabel,
      notes: doc.notes,
      durationMinutes: doc.durationMinutes,
      createdAt: (doc.createdAt ?? new Date()).toISOString(),
    };
  }

  async deleteLogForUser(tenantId: string, userId: string, logId: string): Promise<boolean> {
    const result = await this.logModel.deleteOne({ _id: logId, tenantId, userId });
    return result.deletedCount === 1;
  }
}
