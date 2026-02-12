import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveMedicalHistoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  bloodGroup?: string;

  @IsOptional()
  @IsArray()
  allergies?: string[];

  @IsOptional()
  @IsArray()
  conditions?: string[];

  @IsOptional()
  @IsArray()
  medications?: string[];

  @IsOptional()
  @IsArray()
  injuries?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  emergencyContactPhone?: string;
}

