import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Observable } from 'rxjs';

import { IS_PUBLIC } from '@/common/decorators/public.decorator';

/**
 * Registered globally, so every route requires a valid access token unless it
 * is explicitly marked @Public().
 *
 * The direction matters: an opt-in guard means a forgotten decorator exposes
 * an endpoint, while an opt-out guard means a forgotten decorator merely
 * breaks it. For an app holding someone's finances, only the second failure
 * mode is acceptable.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}
