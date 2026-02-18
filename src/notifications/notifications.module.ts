import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';
import { MembersModule } from '../members/members.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { TelegramService } from './telegram.service';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { TelegramOptIn, TelegramOptInSchema } from './schemas/telegram-opt-in.schema';
import { PushSubscriptionDoc, PushSubscriptionSchema } from './schemas/push-subscription.schema';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    MongooseModule.forFeature([
      { name: TelegramOptIn.name, schema: TelegramOptInSchema },
      { name: PushSubscriptionDoc.name, schema: PushSubscriptionSchema },
    ]),
    TenantsModule,
    MembersModule,
    forwardRef(() => AttendanceModule),
  ],
  controllers: [NotificationsController, TelegramWebhookController],
  providers: [TelegramService, NotificationsService],
  exports: [TelegramService, NotificationsService],
})
export class NotificationsModule {}
