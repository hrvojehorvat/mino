import { IsIn, IsInt, IsNumber, IsOptional, Min } from 'class-validator';
import type { TouchEventType } from '@mino/shared-types';

export class RawTouchEventDto {
  @IsInt()
  @Min(0)
  seq!: number;

  @IsIn(['touchDown', 'touchUp', 'stimulusShown', 'targetShown'])
  eventType!: TouchEventType;

  @IsInt()
  @Min(0)
  tMs!: number;

  @IsOptional()
  @IsNumber()
  x?: number;

  @IsOptional()
  @IsNumber()
  y?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  pointerId?: number;
}
