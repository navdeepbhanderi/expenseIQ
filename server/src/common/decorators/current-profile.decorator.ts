import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { ProfileAccess } from '../types/express';

/** Populated by ProfileAccessGuard; carries the caller's role on this profile. */
export const CurrentProfile = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ProfileAccess => {
    const request = context.switchToHttp().getRequest<Request>();
    return request.profileAccess!;
  },
);
