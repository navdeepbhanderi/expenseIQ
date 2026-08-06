import { SetMetadata } from '@nestjs/common';
import type { Action } from './domain/permissions';

export const REQUIRE_ACTION = 'require_action';

/**
 * Declares what a route does, so ProfileAccessGuard can decide whether the
 * caller's role permits it.
 *
 * Declarative rather than imperative on purpose: the permission lives next to
 * the route it protects and is visible in one grep, instead of being an
 * `if (role !== 'OWNER') throw` buried three calls deep in a service.
 */
export const RequireAction = (action: Action) =>
  SetMetadata(REQUIRE_ACTION, action);
