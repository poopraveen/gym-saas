import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProfileUser } from './schemas/profile-user.schema';

@Injectable()
export class ProfileUsersService {
  constructor(
    @InjectModel(ProfileUser.name) private profileUserModel: Model<ProfileUser>,
  ) {}

  async create(tenantId: string, dto: Record<string, unknown>) {
    const { imageUrl, ...rest } = dto as Record<string, unknown> & { imageUrl?: string };
    const image = imageUrl
      ? { publicUrl: imageUrl, imageName: `img-${Date.now()}` }
      : undefined;
    return this.profileUserModel.create({ ...rest, tenantId, image });
  }

  async list(tenantId: string) {
    return this.profileUserModel.find({ tenantId }).lean();
  }
}
