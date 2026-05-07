import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreatePostCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content!: string;
}
