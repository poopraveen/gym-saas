import { Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** Trigger absence check: send Telegram alerts to gym owners (3/7/14 day absent members). */
  @Post('run-absence')
  async runAbsence() {
    return this.notificationsService.runAbsenceCheck();
  }
}
