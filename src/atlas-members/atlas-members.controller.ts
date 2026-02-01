import { Controller, Get, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { AtlasMembersService } from './atlas-members.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles';

@Controller('members')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF)
export class AtlasMembersController {
  constructor(private readonly atlasMembers: AtlasMembersService) {}

  /**
   * GET /api/members
   * Fetches all documents from gym_users collection (MongoDB Atlas).
   * Requires MONGO_URI or MONGODB_URI pointing to database with gym_users collection.
   */
  @Get()
  async getMembers() {
    try {
      return await this.atlasMembers.getGymMembers();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch members';
      throw new HttpException(
        { success: false, count: 0, data: [], error: message },
        HttpStatus.BAD_GATEWAY,
        { cause: err },
      );
    }
  }
}