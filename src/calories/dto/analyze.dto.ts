import { IsString, IsOptional, IsArray, ValidateNested, ArrayMaxSize, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

export class MealItemDto {
  @IsString()
  food: string;

  @IsString()
  quantity: string;

  @IsString()
  unit: string;
}

export class AnalyzeDto {
  @IsOptional()
  @IsString()
  date?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMaxSize(50)
  @Type(() => MealItemDto)
  meals: MealItemDto[];

  @IsOptional()
  @IsObject()
  userProfile?: {
    age?: number;
    gender?: string;
    heightCm?: number;
    weightKg?: number;
    goal?: string;
  };
}
