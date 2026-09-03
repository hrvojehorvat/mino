import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTestBatchDto {
  @IsUUID('4')
  deviceId!: string;

  @IsOptional()
  @IsString()
  name?: string;
}
