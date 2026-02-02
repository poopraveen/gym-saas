import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { Role } from '../common/constants/roles';
import {
  EnquiriesService,
  CreateEnquiryDto,
  UpdateEnquiryDto,
  CreateEnquiryFollowUpDto,
  ListEnquiriesFilters,
} from './enquiries.service';

@Controller('enquiries')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EnquiriesController {
  constructor(private readonly enquiriesService: EnquiriesService) {}

  @Post()
  @Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF)
  create(@TenantId() tenantId: string, @Body() body: CreateEnquiryDto) {
    return this.enquiriesService.create(tenantId, body);
  }

  @Put(':id')
  @Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF)
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: UpdateEnquiryDto,
  ) {
    const result = await this.enquiriesService.update(tenantId, id, body);
    if (!result) throw new ForbiddenException('Enquiry not found');
    return result;
  }

  @Get()
  @Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF)
  list(
    @TenantId() tenantId: string,
    @Query('status') status: string,
    @Query('followUpToday') followUpToday: string,
    @Query('overdue') overdue: string,
    @Query('newLast24h') newLast24h: string,
    @Query('search') search: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
  ) {
    const filters: ListEnquiriesFilters = {};
    if (status) filters.status = status as ListEnquiriesFilters['status'];
    if (followUpToday === 'true') filters.followUpToday = true;
    if (overdue === 'true') filters.overdue = true;
    if (newLast24h === 'true') filters.newLast24h = true;
    if (search) filters.search = search;
    if (page) filters.page = parseInt(page, 10) || 1;
    if (limit) filters.limit = parseInt(limit, 10) || 20;
    return this.enquiriesService.list(tenantId, filters);
  }

  @Get(':id')
  @Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF)
  async getOne(@TenantId() tenantId: string, @Param('id') id: string) {
    const result = await this.enquiriesService.findById(tenantId, id);
    if (!result) throw new ForbiddenException('Enquiry not found');
    return result;
  }

  @Post(':id/follow-ups')
  @Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF)
  async addFollowUp(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: CreateEnquiryFollowUpDto,
  ) {
    const result = await this.enquiriesService.addFollowUp(tenantId, id, body);
    if (!result) throw new ForbiddenException('Enquiry not found');
    return result;
  }

  @Get(':id/follow-ups')
  @Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF)
  getFollowUps(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.enquiriesService.getFollowUpsByEnquiry(tenantId, id);
  }

  @Patch(':id/lost')
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  async markLost(@TenantId() tenantId: string, @Param('id') id: string) {
    const ok = await this.enquiriesService.markLost(tenantId, id);
    if (!ok) throw new ForbiddenException('Enquiry not found');
    return { success: true };
  }

  @Post(':id/convert')
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  async convertToMember(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const result = await this.enquiriesService.convertToMember(tenantId, id, body);
    if (!result) throw new ForbiddenException('Enquiry not found');
    return result;
  }
}
