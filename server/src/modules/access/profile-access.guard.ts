import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { can, type Action } from './domain/permissions';
import { REQUIRE_ACTION } from './require-action.decorator';

/**
 * The single chokepoint for "may this user touch this profile, this way".
 *
 * Every profile-scoped route passes through here, which is why it's worth
 * being strict about two things:
 *
 *   1. It answers with 404, not 403, when the user has no membership. A 403
 *      confirms the profile exists, which lets anyone enumerate profile ids by
 *      watching the status code. From outside, a profile you can't see is
 *      indistinguishable from one that doesn't exist.
 *
 *   2. It resolves the role from the database on every request rather than
 *      trusting a claim in the JWT. Roles change — a member gets demoted, a
 *      child grows up — and a 15-minute access token would otherwise carry
 *      stale authority for 15 minutes after the change.
 */
@Injectable()
export class ProfileAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user) {
      // JwtAuthGuard should have run first; if it didn't, fail closed.
      throw new ForbiddenException('Not authenticated');
    }

    const profileId = extractProfileId(request);
    if (!profileId) {
      throw new NotFoundException('Profile not found');
    }

    const membership = await this.prisma.profileMember.findUnique({
      where: { profileId_userId: { profileId, userId: user.id } },
      select: { role: true },
    });

    if (!membership) {
      throw new NotFoundException('Profile not found');
    }

    request.profileAccess = { profileId, role: membership.role };

    const required = this.reflector.getAllAndOverride<Action | undefined>(
      REQUIRE_ACTION,
      [context.getHandler(), context.getClass()],
    );

    if (required && !can(membership.role, required)) {
      throw new ForbiddenException(
        `Your role (${membership.role}) cannot perform this action`,
      );
    }

    return true;
  }
}

/**
 * Routes name the parameter differently depending on whether the profile is
 * the resource or the scope — `/profiles/:id` versus
 * `/profiles/:profileId/accounts`.
 *
 * Express types params as `string | string[]`, because a repeated wildcard
 * segment can produce an array. An array here means the route shape isn't
 * what this guard assumes, so it resolves to "no profile" and the caller gets
 * a 404 rather than a coerced id like "a,b".
 */
function extractProfileId(request: Request): string | undefined {
  const params = request.params as Record<
    string,
    string | string[] | undefined
  >;
  const candidate = params.profileId ?? params.pid ?? params.id;
  return typeof candidate === 'string' ? candidate : undefined;
}
