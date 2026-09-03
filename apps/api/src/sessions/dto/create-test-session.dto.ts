import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import type { TestType } from '@mino/shared-types';
import { DeviceMetadataDto } from './device-metadata.dto.js';
import { FingerTracingParamsDto } from './finger-tracing-params.dto.js';
import { RawTouchEventDto } from './raw-touch-event.dto.js';

export class CreateTestSessionDto {
  @IsUUID('4')
  deviceId!: string;

  @IsIn(['fingerTapping', 'reactionTime', 'targetTapping', 'fingerTracing'])
  testType!: TestType;

  @IsISO8601()
  startedAt!: string;

  @IsISO8601()
  endedAt!: string;

  @IsString()
  clientAppVersion!: string;

  @ValidateNested()
  @Type(() => DeviceMetadataDto)
  deviceMetadata!: DeviceMetadataDto;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => RawTouchEventDto)
  events!: RawTouchEventDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => FingerTracingParamsDto)
  testParams?: FingerTracingParamsDto;
}
