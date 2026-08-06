import type { ProfileRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface ProfileAccess {
  profileId: string;
  role: ProfileRole;
}

/**
 * Request augmentations set by middleware and guards.
 *
 * `Express.User` rather than a `user?:` property on Request: @nestjs/passport
 * declares `Request.user` as `Express.User`, and a competing property
 * declaration loses to it — leaving every `request.user.id` a type error. The
 * supported extension point is the `User` interface itself.
 *
 * These stay optional because they're populated progressively: `requestId` by
 * RequestIdMiddleware, `user` by JwtAuthGuard, `profileAccess` by
 * ProfileAccessGuard. A handler that needs one sits behind the guard that
 * sets it, and the @CurrentUser / @CurrentProfile decorators narrow the type
 * at the point of use.
 */
declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends AuthenticatedUser {}

    interface Request {
      requestId?: string;
      profileAccess?: ProfileAccess;
    }
  }
}

export {};
