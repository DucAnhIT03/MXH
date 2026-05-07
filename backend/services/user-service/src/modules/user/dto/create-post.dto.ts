import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePostDto {
  @IsString()
  @MaxLength(5000)
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @IsIn(['POST', 'SHORT_VIDEO', 'STORY'])
  postType?: 'POST' | 'SHORT_VIDEO' | 'STORY';

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  shortVideoUrl?: string;
}
