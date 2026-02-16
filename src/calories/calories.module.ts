import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CalorieEntry, CalorieEntrySchema } from './schemas/calorie-entry.schema';
import { NutritionAnalysis, NutritionAnalysisSchema } from './schemas/nutrition-analysis.schema';
import { CaloriesController } from './calories.controller';
import { CaloriesService } from './calories.service';
import { AuthModule } from '../auth/auth.module';
import { MembersModule } from '../members/members.module';

/**
 * Member-facing calorie tracking + full nutrition analysis (one AI call).
 * Data isolated per tenant and user. Trainer can view member progress.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CalorieEntry.name, schema: CalorieEntrySchema },
      { name: NutritionAnalysis.name, schema: NutritionAnalysisSchema },
    ]),
    AuthModule,
    MembersModule,
  ],
  controllers: [CaloriesController],
  providers: [CaloriesService],
  exports: [CaloriesService],
})
export class CaloriesModule {}
