import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CalorieEntry, CalorieEntrySchema } from './schemas/calorie-entry.schema';
import { CaloriesController } from './calories.controller';
import { CaloriesService } from './calories.service';
import { AuthModule } from '../auth/auth.module';

/**
 * Member-facing calorie tracking. Decoupled from other modules.
 * Single OpenAI-powered chat API; data isolated per tenant and user.
 * Staff can view member progress via /calories/member/:memberUserId/*.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CalorieEntry.name, schema: CalorieEntrySchema },
    ]),
    AuthModule,
  ],
  controllers: [CaloriesController],
  providers: [CaloriesService],
  exports: [CaloriesService],
})
export class CaloriesModule {}
