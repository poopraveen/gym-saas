import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkoutPlanController } from './workout-plan.controller';
import { WorkoutPlanService } from './workout-plan.service';
import { WorkoutPlan, WorkoutPlanSchema } from './schemas/workout-plan.schema';
import { WorkoutLog, WorkoutLogSchema } from './schemas/workout-log.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkoutPlan.name, schema: WorkoutPlanSchema },
      { name: WorkoutLog.name, schema: WorkoutLogSchema },
    ]),
  ],
  controllers: [WorkoutPlanController],
  providers: [WorkoutPlanService],
  exports: [WorkoutPlanService],
})
export class WorkoutPlanModule {}
