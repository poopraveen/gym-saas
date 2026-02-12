import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateWorkoutLogDto {
  @IsString()
  date: string;

  @IsString()
  workoutLabel: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;
}
