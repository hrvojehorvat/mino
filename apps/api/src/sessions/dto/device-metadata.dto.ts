import { IsString } from 'class-validator';

export class DeviceMetadataDto {
  @IsString()
  os!: string;

  @IsString()
  osVersion!: string;

  @IsString()
  model!: string;
}
