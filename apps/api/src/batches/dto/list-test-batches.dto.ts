import { IsUUID } from 'class-validator';

export class ListTestBatchesDto {
  @IsUUID('4')
  deviceId!: string;
}
