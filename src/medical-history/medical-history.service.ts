import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MedicalHistory } from './schemas/medical-history.schema';
import { SaveMedicalHistoryDto } from './dto/medical-history.dto';

@Injectable()
export class MedicalHistoryService {
  constructor(
    @InjectModel(MedicalHistory.name)
    private medicalHistoryModel: Model<MedicalHistory>,
  ) {}

  async getForUser(tenantId: string, userId: string): Promise<Record<string, unknown> | null> {
    const doc = await this.medicalHistoryModel
      .findOne({ tenantId, userId })
      .lean();
    if (!doc) return null;
    const d = doc as unknown as Record<string, unknown>;
    return {
      bloodGroup: d.bloodGroup,
      allergies: d.allergies ?? [],
      conditions: d.conditions ?? [],
      medications: d.medications ?? [],
      injuries: d.injuries ?? [],
      notes: d.notes,
      emergencyContactName: d.emergencyContactName,
      emergencyContactPhone: d.emergencyContactPhone,
      updatedAt: d.updatedAt,
    };
  }

  async saveForUser(tenantId: string, userId: string, dto: SaveMedicalHistoryDto) {
    const normalizeArray = (v: unknown): string[] => {
      if (!Array.isArray(v)) return [];
      return v
        .filter((x) => typeof x === 'string')
        .map((s) => s.trim())
        .filter(Boolean);
    };

    const update = {
      bloodGroup: dto.bloodGroup?.trim() || undefined,
      allergies: normalizeArray(dto.allergies),
      conditions: normalizeArray(dto.conditions),
      medications: normalizeArray(dto.medications),
      injuries: normalizeArray(dto.injuries),
      notes: dto.notes?.trim() || undefined,
      emergencyContactName: dto.emergencyContactName?.trim() || undefined,
      emergencyContactPhone: dto.emergencyContactPhone?.trim() || undefined,
    };

    await this.medicalHistoryModel.updateOne(
      { tenantId, userId },
      { $set: update, $setOnInsert: { tenantId, userId } },
      { upsert: true },
    );

    return this.getForUser(tenantId, userId);
  }
}

