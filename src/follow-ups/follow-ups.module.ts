import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FollowUp, FollowUpSchema } from './schemas/follow-up.schema';
import { FollowUpsService } from './follow-ups.service';
import { FollowUpsController } from './follow-ups.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: FollowUp.name, schema: FollowUpSchema }]),
  ],
  controllers: [FollowUpsController],
  providers: [FollowUpsService],
  exports: [FollowUpsService],
})
export class FollowUpsModule {}
