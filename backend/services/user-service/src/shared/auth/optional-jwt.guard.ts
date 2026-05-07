import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Cho phép không có JWT; nếu có token hợp lệ thì gắn `req.user`. */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return (await super.canActivate(context)) as boolean;
    } catch {
      return true;
    }
  }

  handleRequest<TUser = unknown>(err: unknown, user: TUser): TUser {
    return user ?? (undefined as TUser);
  }
}
