import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User } from './schemas/user.schema';
import { Role } from '../common/constants/roles';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private jwtService: JwtService,
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

  async login(email: string, password: string, tenantId: string) {
    const user = await this.validateUser(email, password, tenantId);
    if (!user) throw new UnauthorizedException('Invalid credentials');
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
}
