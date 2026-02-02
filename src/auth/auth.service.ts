import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User } from './schemas/user.schema';
import { Role } from '../common/constants/roles';
import { TenantsService } from '../tenants/tenants.service';
import { MembersService } from '../members/members.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private jwtService: JwtService,
    private tenantsService: TenantsService,
    private membersService: MembersService,
  ) {}

  async validateUser(
    email: string,
    password: string,
    tenantId: string,
  ): Promise<Omit<User, 'passwordHash'> | null> {
    const user = await this.userModel
      .findOne({ email, tenantId, isActive: true })
      .lean();
    if (!user) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return null;
    const { passwordHash, ...rest } = user;
    return rest as unknown as Omit<User, 'passwordHash'>;
  }

  /**
   * Resolve tenant from host (subdomain or custom domain).
   * e.g. repsanddips.app.com -> subdomain repsanddips
   *      gym1.com -> customDomain
   */
  async resolveTenantFromHost(host: string): Promise<string | null> {
    if (!host) return null;
    const h = host.replace(/:\d+$/, '').toLowerCase();
    const tenant = await this.tenantsService.findBySubdomainOrDomain(h);
    return tenant ? String((tenant as { _id: unknown })._id) : null;
  }

  /**
   * Login with email + password. Tenant resolved by:
   * 1. Host header (subdomain / custom domain) if provided
   * 2. Otherwise: find user by email (must be unique across tenants)
   */
  async login(
    email: string,
    password: string,
    tenantIdHint?: string | null,
    host?: string | null,
  ) {
    let tenantId = tenantIdHint ?? null;
    if (!tenantId && host) {
      tenantId = await this.resolveTenantFromHost(host);
    }
    let user: (Omit<User, 'passwordHash'> & { tenantId: string }) | null = null;
    if (tenantId) {
      user = await this.validateUser(email, password, tenantId) as (Omit<User, 'passwordHash'> & { tenantId: string }) | null;
    }
    if (!user) {
      const candidates = await this.userModel
        .find({ email, isActive: true })
        .lean();
      if (candidates.length === 0) throw new UnauthorizedException('Invalid credentials');
      if (candidates.length > 1) {
        throw new UnauthorizedException('Multiple accounts - use your gym\'s login link');
      }
      const c = candidates[0];
      const ok = await bcrypt.compare(password, (c as unknown as { passwordHash: string }).passwordHash);
      if (!ok) throw new UnauthorizedException('Invalid credentials');
      const { passwordHash, ...rest } = c;
      user = rest as unknown as Omit<User, 'passwordHash'> & { tenantId: string };
    }
    // Do not expose tenantId in user object per security req - keep for JWT only
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  async register(
    email: string,
    password: string,
    tenantId: string,
    name: string,
    role: Role,
  ) {
    const hash = await bcrypt.hash(password, 10);
    const user = await this.userModel.create({
      email,
      passwordHash: hash,
      name,
      tenantId,
      role,
    });
    const { passwordHash, ...rest } = user.toObject();
    return rest;
  }

  /** Get tenant admin user (email, name) for platform admin panel. No password. */
  async getAdminUserByTenantId(tenantId: string): Promise<{ email: string; name?: string; role: string } | null> {
    const user = await this.userModel
      .findOne({ tenantId, role: Role.TENANT_ADMIN })
      .select('email name role')
      .lean();
    if (!user) return null;
    const u = user as unknown as { email: string; name?: string; role: string };
    return { email: u.email, name: u.name, role: u.role };
  }

  /** Super admin: reset user password by tenant + email */
  async resetUserPassword(tenantId: string, email: string, newPassword: string) {
    const hash = await bcrypt.hash(newPassword, 10);
    const r = await this.userModel.updateOne(
      { tenantId, email },
      { $set: { passwordHash: hash } },
    );
    return r.matchedCount > 0;
  }

  /**
   * Tenant onboarding: create a login for a gym member (role MEMBER).
   * Member can later log in and see only Nutrition AI. Caller must be TENANT_ADMIN or MANAGER.
   */
  async onboardMember(
    tenantId: string,
    email: string,
    password: string,
    name: string,
    regNo: number,
  ) {
    const member = await this.membersService.findByGymIdOrRegNo(tenantId, String(regNo));
    if (!member) {
      throw new BadRequestException('Gym member not found with this Reg No');
    }
    const hash = await bcrypt.hash(password, 10);
    const user = await this.userModel.create({
      email,
      passwordHash: hash,
      name: name || (member.NAME as string) || email,
      tenantId,
      role: Role.MEMBER,
      linkedRegNo: regNo,
    });
    const { passwordHash, ...rest } = user.toObject();
    return rest;
  }

  /** Get current user profile (for /me). Returns id, email, name, role, tenantId, createdAt, linkedRegNo. */
  async getMe(userId: string): Promise<Record<string, unknown>> {
    const user = await this.userModel
      .findById(userId)
      .select('-passwordHash')
      .lean();
    if (!user) throw new UnauthorizedException('User not found');
    const u = user as unknown as Record<string, unknown>;
    return {
      id: u._id,
      email: u.email,
      name: u.name,
      role: u.role,
      tenantId: u.tenantId,
      createdAt: u.createdAt,
      linkedRegNo: u.linkedRegNo,
    };
  }

  /**
   * List users with role MEMBER in the tenant (onboarded for AI / Nutrition).
   * For staff to search and view member progress. Optional search by name/email.
   */
  async listMemberUsers(
    tenantId: string,
    search?: string,
  ): Promise<Array<{ id: string; email: string; name?: string; linkedRegNo?: number; createdAt?: Date }>> {
    const q: Record<string, unknown> = { tenantId, role: Role.MEMBER, isActive: true };
    if (search && search.trim()) {
      const s = search.trim();
      q.$or = [
        { name: new RegExp(s, 'i') },
        { email: new RegExp(s, 'i') },
      ];
    }
    const users = await this.userModel
      .find(q)
      .select('email name linkedRegNo createdAt')
      .sort({ createdAt: -1 })
      .lean();
    return (users as unknown as Array<{ _id: string; email: string; name?: string; linkedRegNo?: number; createdAt?: Date }>).map(
      (u) => ({
        id: String(u._id),
        email: u.email,
        name: u.name,
        linkedRegNo: u.linkedRegNo,
        createdAt: u.createdAt,
      }),
    );
  }

  /**
   * Ensure userId is a MEMBER user in the given tenant (for staff viewing member progress).
   */
  async assertMemberInTenant(tenantId: string, userId: string): Promise<void> {
    const user = await this.userModel.findOne({ _id: userId, tenantId, role: Role.MEMBER }).lean();
    if (!user) throw new UnauthorizedException('Member not found in your tenant');
  }
}
