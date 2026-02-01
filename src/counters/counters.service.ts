import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Counter } from './schemas/counter.schema';

@Injectable()
export class CountersService {
  constructor(@InjectModel(Counter.name) private counterModel: Model<Counter>) {}

  async getNextReceiptId(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const id = `receipt_${tenantId}_${year}`;
    const doc = await this.counterModel.findOneAndUpdate(
      { _id: id },
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    );
    const seq = doc?.seq ?? 1;
    return `REC-${year}-${String(seq).padStart(5, '0')}`;
  }
}
