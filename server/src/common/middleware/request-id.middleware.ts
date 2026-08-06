import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

/**
 * Assigns the correlation id, in middleware rather than in an interceptor.
 *
 * Interceptors only run once a route has matched, so a request that 404s or
 * is rejected by a guard would come back with no `x-request-id` — exactly the
 * responses a user is most likely to be reporting when they quote one.
 *
 * An inbound `x-request-id` is honoured so a trace survives a proxy hop,
 * but it's length-capped: the value is echoed into a response header and into
 * every log line, so an unbounded client-supplied string is a log-injection
 * and header-size problem waiting to happen.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private static readonly MAX_LENGTH = 128;
  private static readonly SAFE_PATTERN = /^[A-Za-z0-9._:-]+$/;

  use(request: Request, response: Response, next: NextFunction): void {
    const inbound = request.headers['x-request-id'];
    const candidate = Array.isArray(inbound) ? inbound[0] : inbound;

    const requestId =
      candidate &&
      candidate.length <= RequestIdMiddleware.MAX_LENGTH &&
      RequestIdMiddleware.SAFE_PATTERN.test(candidate)
        ? candidate
        : randomUUID();

    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    next();
  }
}
