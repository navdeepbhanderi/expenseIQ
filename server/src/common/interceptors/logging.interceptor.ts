import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { AppLogger } from '../logger/app-logger.service';

/**
 * One structured line per request: method, path, status, latency, requestId,
 * userId. That set is what makes a production log searchable - anything less
 * and you can't answer "what did this user hit before the 500?".
 *
 * The correlation id itself is assigned upstream by RequestIdMiddleware, so
 * that responses which never reach a handler (404s, guard rejections) still
 * carry one.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLogger) {
    this.logger.setContext('HTTP');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const startedAt = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => this.record(request, response, startedAt),
        // Errors are logged by the exception filter, which knows the final
        // status code. Logging here too would double every failed request.
        error: () => undefined,
      }),
    );
  }

  private record(
    request: Request,
    response: Response,
    startedAt: bigint,
  ): void {
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    this.logger.log(`${request.method} ${request.originalUrl}`, {
      requestId: request.requestId,
      userId: request.user?.id,
      profileId: request.profileAccess?.profileId,
      status: response.statusCode,
      latencyMs: Math.round(latencyMs * 100) / 100,
    });
  }
}
