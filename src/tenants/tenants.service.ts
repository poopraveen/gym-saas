import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tenant } from './schemas/tenant.schema';

@Injectable()
export class TenantsService {
  constructor(
    @InjectModel(Tenant.name) private tenantModel: Model<Tenant>,
  ) {}

  async create(name: string, slug?: string): Promise<Tenant> {
    const s = slug || name.toLowerCase().replace(/\s+/g, '-');
    return this.tenantModel.create({ name, slug: s });
  }

  async findAll() {
    return this.tenantModel.find().lean();
  }

  async findById(id: string) {
    return this.tenantModel.findById(id).lean();
  }

  async findBySlug(slug: string) {
    return this.tenantModel.findOne({ slug }).lean();
  }
}
