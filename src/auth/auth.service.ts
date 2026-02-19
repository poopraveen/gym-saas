import { Injectable, UnauthorizedException, BadRequestException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User } from './schemas/user.schema';
import { TrainerAssignment } from './schemas/trainer-assignment.schema';
import { Role } from '../common/constants/roles';
import { TenantsService } from '../tenants/tenants.service';
import { MembersService } from '../members/members.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(TrainerAssignment.name) private assignmentModel: Model<TrainerAssignment>,
    private jwtService: JwtService,
    private tenantsService: TenantsService,
    private membersService: MembersService,
  ) {}

  async validateUser(
    email: string,
    password: string,
    tenantId: string,
  ): Promise<Omit<User, 'passwordHash'> | null> {
    const emailRegex = new RegExp(`^${(email ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const user = await this.userModel
      .findOne({ email: emailRegex, tenantId, isActive: true })
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
    const normalizedEmail = (email ?? '').trim().toLowerCase();
    if (!normalizedEmail || !password) {
      throw new UnauthorizedException('Invalid credentials');
    }
    let tenantId = tenantIdHint ?? null;
    if (!tenantId && host) {
      tenantId = await this.resolveTenantFromHost(host);
    }
    let user: (Omit<User, 'passwordHash'> & { tenantId: string }) | null = null;
    if (tenantId) {
      user = await this.validateUser(normalizedEmail, password, tenantId) as (Omit<User, 'passwordHash'> & { tenantId: string }) | null;
    }
    if (!user) {
      const candidates = await this.userModel
        .find({ email: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), isActive: true })
        .lean();
      if (candidates.length === 0) throw new UnauthorizedException('Invalid credentials');
      if (candidates.length > 1) {
        throw new UnauthorizedException('Multiple accounts - use your gym\'s login link');
      }
      const c = candidates[0];
      const storedHash = (c as unknown as { passwordHash?: string }).passwordHash;
      if (!storedHash) throw new UnauthorizedException('Invalid credentials');
      const ok = await bcrypt.compare(password, storedHash);
      if (!ok) throw new UnauthorizedException('Invalid credentials');
      const { passwordHash, ...rest } = c;
      user = rest as unknown as Omit<User, 'passwordHash'> & { tenantId: string };
    }
    // Do not expose tenantId in user object per security req - keep for JWT only. Return JSON-safe values (no ObjectId).
    const userId = user._id != null ? String(user._id) : '';
    const payload = {
      sub: userId,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: userId,
        email: user.email ?? '',
        name: user.name,
        role: user.role,
        tenantId: user.tenantId ?? '',
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
    const normalizedEmail = (email ?? '').trim().toLowerCase();
    if (!normalizedEmail) throw new BadRequestException('Email is required.');
    const existing = await this.userModel.findOne({ tenantId, email: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).lean();
    if (existing) {
      throw new ConflictException('Email already registered for this tenant.');
    }
    const hash = await bcrypt.hash(password, 10);
    try {
      const user = await this.userModel.create({
        email: normalizedEmail,
        passwordHash: hash,
        name,
        tenantId,
        role,
        isActive: true,
      });
      const obj = user.toObject() as unknown as Record<string, unknown>;
      const { passwordHash, _id, ...rest } = obj;
      return {
        _id: _id != null ? String(_id) : _id,
        id: _id != null ? String(_id) : undefined,
        ...rest,
      };
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 11000) {
        throw new ConflictException('Email already registered for this tenant.');
      }
      throw err;
    }
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

  /** Get tenant admin user id (for push notifications to gym owner). Returns first TENANT_ADMIN userId or null. */
  async getTenantAdminUserId(tenantId: string): Promise<string | null> {
    const user = await this.userModel
      .findOne({ tenantId, role: Role.TENANT_ADMIN, isActive: true })
      .select('_id')
      .lean();
    if (!user || !(user as { _id?: unknown })._id) return null;
    return String((user as { _id: unknown })._id);
  }

  /** Get all tenant admin and manager user ids (for push notifications — each who has push enabled will receive). */
  async getTenantAdminAndManagerUserIds(tenantId: string): Promise<string[]> {
    const users = await this.userModel
      .find({ tenantId, role: { $in: [Role.TENANT_ADMIN, Role.MANAGER] }, isActive: true })
      .select('_id')
      .lean();
    return users
      .map((u) => (u as { _id?: unknown })._id)
      .filter((id) => id != null)
      .map((id) => String(id));
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
    const existingByEmail = await this.userModel.findOne({ tenantId, email }).lean();
    if (existingByEmail) {
      throw new ConflictException('This email is already registered for this tenant.');
    }
    const existingByRegNo = await this.userModel
      .findOne({ tenantId, role: Role.MEMBER, linkedRegNo: regNo })
      .lean();
    if (existingByRegNo) {
      throw new ConflictException('This Reg No already has a member login. Use reset password or a different Reg No.');
    }
    const hash = await bcrypt.hash(password, 10);
    try {
      const user = await this.userModel.create({
        email,
        passwordHash: hash,
        name: name || (member.NAME as string) || email,
        tenantId,
        role: Role.MEMBER,
        linkedRegNo: regNo,
      });
      // Store email on the member record for later use (lookup, display, etc.)
      await this.membersService.updateEmail(tenantId, regNo, email);
      const { passwordHash, ...rest } = user.toObject();
      return rest;
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 11000) {
        throw new ConflictException(
          'A member login with this email or Reg No already exists. Use a different email or Reg No.',
        );
      }
      throw err;
    }
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
   * For trainer/admin to search and view member progress. Optional search by name/email.
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
    return (users as unknown as Array<{ _id: unknown; email: string; name?: string; linkedRegNo?: number; createdAt?: Date }>).map(
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
   * Ensure userId is a MEMBER user in the given tenant (for trainer viewing member progress).
   */
  async assertMemberInTenant(tenantId: string, userId: string): Promise<void> {
    const user = await this.userModel.findOne({ _id: userId, tenantId, role: Role.MEMBER }).lean();
    if (!user) throw new UnauthorizedException('Member not found in your tenant');
  }

  /**
   * Reset password for a MEMBER user (enrolled for AI). Returns the new password once so admin can share it.
   * Caller must be TENANT_ADMIN or MANAGER.
   */
  async resetMemberPassword(
    tenantId: string,
    userId: string,
    newPassword: string,
  ): Promise<{ message: string; newPassword: string }> {
    const user = await this.userModel.findOne({ _id: userId, tenantId, role: Role.MEMBER }).lean();
    if (!user) throw new BadRequestException('Member user not found in your tenant');
    const hash = await bcrypt.hash(newPassword, 10);
    await this.userModel.updateOne({ _id: userId }, { $set: { passwordHash: hash } });
    return { message: 'Password updated. Share the new password with the member once.', newPassword };
  }

  /**
   * Deactivate a MEMBER user (remove login access to Nutrition AI). Soft delete: sets isActive = false.
   * Caller must be TENANT_ADMIN or MANAGER.
   */
  async deactivateMemberUser(tenantId: string, userId: string): Promise<{ message: string }> {
    const user = await this.userModel.findOne({ _id: userId, tenantId, role: Role.MEMBER }).lean();
    if (!user) throw new BadRequestException('Member user not found in your tenant');
    await this.userModel.updateOne({ _id: userId }, { $set: { isActive: false } });
    return { message: 'User deactivated. They can no longer log in to Nutrition AI.' };
  }

  /** List users with role TRAINER in the tenant (for admin to assign members). Includes createdAt and assignedMemberCount. */
  async listTrainers(
    tenantId: string,
  ): Promise<Array<{ id: string; email: string; name?: string; createdAt?: string; assignedMemberCount: number }>> {
    const users = await this.userModel
      .find({ tenantId, role: Role.TRAINER, isActive: true })
      .select('email name createdAt')
      .sort({ createdAt: -1 })
      .lean();
    const counts = await this.assignmentModel.aggregate<{ _id: string; count: number }>([
      { $match: { tenantId } },
      { $group: { _id: '$trainerUserId', count: { $sum: 1 } } },
    ]);
    const countByTrainer = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
    return (users as unknown as Array<{ _id: unknown; email: string; name?: string; createdAt?: Date }>).map((u) => ({
      id: String(u._id),
      email: u.email,
      name: u.name,
      createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : undefined,
      assignedMemberCount: countByTrainer[String(u._id)] ?? 0,
    }));
  }

  /** Assign a member user to a trainer. Caller must be TENANT_ADMIN or MANAGER. */
  async assignMemberToTrainer(tenantId: string, trainerUserId: string, memberUserId: string): Promise<void> {
    const trainer = await this.userModel.findOne({ _id: trainerUserId, tenantId, role: Role.TRAINER }).lean();
    if (!trainer) throw new BadRequestException('Trainer not found in your tenant');
    const member = await this.userModel.findOne({ _id: memberUserId, tenantId, role: Role.MEMBER }).lean();
    if (!member) throw new BadRequestException('Member user not found in your tenant');
    await this.assignmentModel.updateOne(
      { tenantId, trainerUserId, memberUserId },
      { $setOnInsert: { tenantId, trainerUserId, memberUserId } },
      { upsert: true },
    );
  }

  /** Unassign a member from their trainer. Caller must be TENANT_ADMIN or MANAGER. */
  async unassignMemberFromTrainer(tenantId: string, memberUserId: string): Promise<void> {
    await this.assignmentModel.deleteMany({ tenantId, memberUserId });
  }

  /** Get member users assigned to the given trainer. Used by TRAINER role. */
  async getAssignedMembersForTrainer(
    tenantId: string,
    trainerUserId: string,
  ): Promise<Array<{ id: string; email: string; name?: string; linkedRegNo?: number; createdAt?: Date }>> {
    const assignments = await this.assignmentModel.find({ tenantId, trainerUserId }).lean();
    const memberIds = (assignments as unknown as Array<{ memberUserId: string }>).map((a) => a.memberUserId);
    if (memberIds.length === 0) return [];
    const users = await this.userModel
      .find({ _id: { $in: memberIds }, tenantId, role: Role.MEMBER, isActive: true })
      .select('email name linkedRegNo createdAt')
      .lean();
    return (users as unknown as Array<{ _id: unknown; email: string; name?: string; linkedRegNo?: number; createdAt?: Date }>).map((u) => ({
      id: String(u._id),
      email: u.email,
      name: u.name,
      linkedRegNo: u.linkedRegNo,
      createdAt: u.createdAt,
    }));
  }

  /** Check if a member is assigned to the given trainer (for TRAINER to view member data). */
  async isMemberAssignedToTrainer(tenantId: string, trainerUserId: string, memberUserId: string): Promise<boolean> {
    const doc = await this.assignmentModel.findOne({ tenantId, trainerUserId, memberUserId }).lean();
    return !!doc;
  }

  /** Get trainer user id assigned to a member (for admin UI to show current assignment). */
  async getTrainerForMember(tenantId: string, memberUserId: string): Promise<string | null> {
    const doc = await this.assignmentModel.findOne({ tenantId, memberUserId }).lean();
    if (!doc) return null;
    return (doc as unknown as { trainerUserId: string }).trainerUserId;
  }

  /** List all trainer assignments in the tenant (for admin UI). */
  async listAssignmentsForTenant(
    tenantId: string,
  ): Promise<Array<{ memberUserId: string; trainerUserId: string }>> {
    const docs = await this.assignmentModel.find({ tenantId }).lean();
    return (docs as unknown as Array<{ memberUserId: string; trainerUserId: string }>).map((d) => ({
      memberUserId: d.memberUserId,
      trainerUserId: d.trainerUserId,
    }));
  }

  /** Deactivate a trainer (set isActive: false) and unassign all members. TENANT_ADMIN or MANAGER only. */
  async deactivateTrainer(tenantId: string, trainerUserId: string): Promise<void> {
    const trainer = await this.userModel.findOne({ _id: trainerUserId, tenantId, role: Role.TRAINER }).lean();
    if (!trainer) throw new BadRequestException('Trainer not found');
    await this.userModel.updateOne({ _id: trainerUserId, tenantId }, { $set: { isActive: false } });
    await this.assignmentModel.deleteMany({ tenantId, trainerUserId });
  }

  /**
   * Get auth member user (enrolled for AI) by gym reg no. For admin to show trainer assignment when editing a gym member.
   */
  async getMemberUserByRegNo(
    tenantId: string,
    regNo: number,
  ): Promise<{ id: string; email: string; name?: string; trainerUserId: string | null } | null> {
    const user = await this.userModel
      .findOne({ tenantId, role: Role.MEMBER, linkedRegNo: regNo, isActive: true })
      .select('email name')
      .lean();
    if (!user) return null;
    const u = user as unknown as { _id: string; email: string; name?: string };
    const trainerUserId = await this.getTrainerForMember(tenantId, String(u._id));
    return {
      id: String(u._id),
      email: u.email,
      name: u.name,
      trainerUserId,
    };
  }
}
