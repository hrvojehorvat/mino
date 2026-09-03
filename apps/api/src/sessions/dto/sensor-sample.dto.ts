import { IsInt, IsNumber, Min } from 'class-validator';

export class SensorSampleDto {
  @IsInt()
  @Min(0)
  tMs!: number;

  @IsNumber()
  ax!: number;

  @IsNumber()
  ay!: number;

  @IsNumber()
  az!: number;

  @IsNumber()
  gx!: number;

  @IsNumber()
  gy!: number;

  @IsNumber()
  gz!: number;
}
