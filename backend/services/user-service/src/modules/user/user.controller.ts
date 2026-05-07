import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../shared/auth/jwt.guard';
import { OptionalJwtAuthGuard } from '../../shared/auth/optional-jwt.guard';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { CreatePostCommentDto } from './dto/create-post-comment.dto';
import { SearchUserQueryDto } from './dto/search-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { PatchMyPostDto } from './dto/patch-my-post.dto';
import { UserService } from './user.service';
import { PostService } from './post.service';

@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly postService: PostService,
  ) {}

  // ─── Auth proxy ───────────────────────────────────────────────────────────

  @Post('register')
  register(@Body() dto: RegisterUserDto) {
    return this.userService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginUserDto) {
    return this.userService.login(dto);
  }

  // ─── Search / Recommend ───────────────────────────────────────────────────

  @Get('search')
  search(@Query() query: SearchUserQueryDto) {
    return this.userService.search(query.username, query);
  }

  @UseGuards(JwtAuthGuard)
  @Get('recommendations')
  recommend(@Req() req: any, @Query() q: PaginationQueryDto) {
    return this.userService.recommend(req.user.userId, q);
  }

  // ─── Friend Requests ──────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('me/friend-requests')
  friendRequests(@Req() req: any, @Query() q: PaginationQueryDto) {
    return this.userService.listFriendRequests(req.user.userId, q);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/friend-requests/:id/accept')
  acceptFriendRequest(@Req() req: any, @Param('id') id: string) {
    return this.userService.acceptFriendRequest(req.user.userId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/friend-requests/:id/reject')
  rejectFriendRequest(@Req() req: any, @Param('id') id: string) {
    return this.userService.rejectFriendRequest(req.user.userId, id);
  }

  // ─── Me ───────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('me/following-ids')
  followingIds(@Req() req: any) {
    return this.userService.listFollowingIds(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/friends')
  friends(@Req() req: any, @Query() q: PaginationQueryDto) {
    return this.userService.listFriends(req.user.userId, q);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@Req() req: any) {
    return this.userService.getProfileById(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.userService.updateProfile(req.user.userId, dto);
  }

  // ─── My Posts ─────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('me/posts')
  listMyPosts(@Req() req: any, @Query() q: PaginationQueryDto) {
    return this.postService.listMyPosts(req.user.userId, q);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/posts')
  createMyPost(@Req() req: any, @Body() dto: CreatePostDto) {
    return this.postService.createPost(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/posts/:postId')
  patchMyPost(@Req() req: any, @Param('postId') postId: string, @Body() dto: PatchMyPostDto) {
    return this.postService.patchMyPost(req.user.userId, postId, dto.hidden);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me/posts/:postId')
  deleteMyPost(@Req() req: any, @Param('postId') postId: string) {
    return this.postService.deleteMyPost(req.user.userId, postId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/uploads')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 500 * 1024 * 1024 } }))
  uploadMyPostMedia(@Req() req: any, @UploadedFile() file: any, @Query('type') type?: string) {
    if (!file) throw new BadRequestException('File is required');
    return this.postService.uploadPostMedia(req.user.userId, file, type);
  }

  // ─── Feed ─────────────────────────────────────────────────────────────────

  @UseGuards(OptionalJwtAuthGuard)
  @Get('feed/posts')
  listFeedPosts(@Req() req: any, @Query() q: PaginationQueryDto) {
    return this.postService.listFeedPosts(q, req.user?.userId ?? null);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('feed/short-videos')
  listShortVideos(@Req() req: any, @Query() q: PaginationQueryDto) {
    return this.postService.listShortVideos(q, req.user?.userId ?? null);
  }

  @UseGuards(JwtAuthGuard)
  @Get('feed/friends-posts')
  listFriendsFeedPosts(@Req() req: any, @Query() q: PaginationQueryDto) {
    return this.postService.listFriendsFeedPosts(req.user.userId, q);
  }

  @UseGuards(JwtAuthGuard)
  @Get('feed/stories')
  listStories(@Req() req: any) {
    return this.postService.listStories(req.user.userId);
  }

  // ─── Post interactions ────────────────────────────────────────────────────

  @Get('posts/:postId/comments')
  listPostComments(@Param('postId') postId: string, @Query() q: PaginationQueryDto) {
    return this.postService.listPostComments(postId, q);
  }

  @UseGuards(JwtAuthGuard)
  @Post('posts/:postId/comments')
  createPostComment(@Req() req: any, @Param('postId') postId: string, @Body() dto: CreatePostCommentDto) {
    return this.postService.createPostComment(req.user.userId, postId, dto.content);
  }

  @UseGuards(JwtAuthGuard)
  @Post('posts/:postId/reactions/toggle')
  togglePostReaction(@Req() req: any, @Param('postId') postId: string) {
    return this.postService.togglePostReaction(req.user.userId, postId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('posts/:postId/share')
  recordPostShare(@Param('postId') postId: string) {
    return this.postService.recordPostShare(postId);
  }

  // ─── Profile (public) ─────────────────────────────────────────────────────

  @Get(':id')
  getProfile(@Param('id') id: string) {
    return this.userService.getProfileById(id);
  }

  @Get(':id/followers')
  followers(@Param('id') id: string, @Query() q: PaginationQueryDto) {
    return this.userService.listFollowers(id, q);
  }

  @Get(':id/following')
  following(@Param('id') id: string, @Query() q: PaginationQueryDto) {
    return this.userService.listFollowing(id, q);
  }

  @Get(':id/posts')
  listProfilePosts(@Param('id') authorId: string, @Query() q: PaginationQueryDto) {
    return this.postService.listPostsOnProfile(authorId, q);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/follow')
  follow(@Req() req: any, @Param('id') id: string) {
    return this.userService.follow(req.user.userId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/follow')
  unfollow(@Req() req: any, @Param('id') id: string) {
    return this.userService.unfollow(req.user.userId, id);
  }
}
