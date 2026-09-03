import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, ValidateNested } from 'class-validator';

class PathPointDto {
  @IsNumber()
  x!: number;

  @IsNumber()
  y!: number;
}

export class FingerTracingParamsDto {
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => PathPointDto)
  referencePath!: PathPointDto[];
}
