import { IsString, IsOptional, IsIn } from 'class-validator';

export class AcceptDefaultDto {
  @IsString()
  date: string;

  @IsOptional()
  @IsIn(['male', 'female'])
  gender?: 'male' | 'female';
}
