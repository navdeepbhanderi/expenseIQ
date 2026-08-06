import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'is_public';

/**
 * Opts a route out of JwtAuthGuard.
 *
 * Authentication is global and opt-*out* rather than opt-in, so forgetting a
 * decorator leaves an endpoint locked rather than exposed. Failing closed is
 * the only safe default for an app holding someone's finances.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);
