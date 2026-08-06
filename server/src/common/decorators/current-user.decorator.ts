import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../types/express';

/**
 * Non-null by contract: only reachable behind JwtAuthGuard, which rejects the
 * request before a handler runs if there's no user. Typing it as optional
 * would push a pointless null check into every controller.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<Request>();
    return request.user as AuthenticatedUser;
  },
);
