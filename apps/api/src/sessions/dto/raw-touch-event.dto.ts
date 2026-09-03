import { IsIn, IsInt, IsNumber, Min } from 'class-validator';
import type { TouchEventType } from '@mino/shared-types';

export class RawTouchEventDto {
  @IsInt()
  @Min(0)
  seq!: number;

  @IsIn(['touchDown', 'touchUp'])
  eventType!: TouchEventType;

  @IsInt()
  @Min(0)
  tMs!: number;

  @IsNumber()
  x!: number;

  @IsNumber()
  y!: number;

  @IsInt()
  @Min(0)
  pointerId!: number;
}
