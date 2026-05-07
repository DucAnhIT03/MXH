import { IsBoolean } from 'class-validator';

export class PatchMyPostDto {
  @IsBoolean()
  hidden!: boolean;
}
