import { IsString, IsOptional, MaxLength, IsArray, ArrayMaxSize } from 'class-validator';

export class ChatCalorieDto {
  @IsString()
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @IsString()
  date?: string;

  /** When editing: current items for this day (after removals). Backend merges new items with this instead of DB. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  existingItems?: Array<{ name: string; quantity?: string; estimatedCalories: number }>;
}
