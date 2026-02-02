import { IsString, IsArray, ArrayMaxSize } from 'class-validator';

export class SetEntryDto {
  @IsString()
  date: string;

  @IsArray()
  @ArrayMaxSize(200)
  items: Array<{ name: string; quantity?: string; estimatedCalories: number }>;
}
