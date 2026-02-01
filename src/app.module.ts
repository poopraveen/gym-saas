import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { MembersModule } from './members/members.module';
import { AttendanceModule } from './attendance/attendance.module';
import { ProfileUsersModule } from './profile-users/profile-users.module';
import { LegacyModule } from './legacy/legacy.module';
import { FollowUpsModule } from './follow-ups/follow-ups.module';
import { AtlasMembersModule } from './atlas-members/atlas-members.module';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(process.env.MONGODB_URI || 'mongodb://localhost:27017/gym-saas'),
    AuthModule,
    TenantsModule,
    MembersModule,
    AttendanceModule,
    ProfileUsersModule,
    LegacyModule,
    FollowUpsModule,
    AtlasMembersModule,
  ],
})
export class AppModule {}
