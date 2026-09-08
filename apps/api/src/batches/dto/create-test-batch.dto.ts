import { IsOptional, IsString } from 'class-validator';

export class CreateTestBatchDto {
  @IsOptional()
  @IsString()
  name?: string;
}
