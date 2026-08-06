import {
  ExecutionContext,
  Injectable,
  NotImplementedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import type { Observable } from 'rxjs';

import type { AppConfig } from '@/config/configuration';

/**
 * Delegates to passport's Google strategy, but only once it's certain the
 * strategy exists.
 *
 * Without the check, hitting `/auth/google` on a server with no Google
 * credentials produces passport's "Unknown authentication strategy" as an
 * opaque 500. 501 Not Implemented is the honest answer: the endpoint is real,
 * this deployment just hasn't enabled it.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly config: ConfigService) {
    super();
  }

  override canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const google = this.config.get<AppConfig['google']>('google');

    if (!google?.clientId || !google.clientSecret) {
      throw new NotImplementedException(
        'Google sign-in is not configured on this server',
      );
    }

    return super.canActivate(context);
  }
}
