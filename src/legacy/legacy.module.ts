import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { FollowUpsModule } from '../follow-ups/follow-ups.module';
import { CountersModule } from '../counters/counters.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LegacyController } from './legacy.controller';

@Module({
  imports: [MembersModule, AttendanceModule, FollowUpsModule, CountersModule, NotificationsModule],
  controllers: [LegacyController],
})
export class LegacyModule {}
