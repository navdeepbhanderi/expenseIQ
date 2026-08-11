import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppLogger } from '../logger/app-logger.service';

/** The single error shape every endpoint returns. */
export interface ErrorEnvelope {
  statusCode: number;
  error: string;
  message: string | string[];
  requestId?: string;
  /** Present only for 400s raised by validation, listing the offending fields. */
  details?: unknown;
}

/**
 * `envelope.statusCode` is a plain number (it may come from a Prisma mapping,
 * not only from HttpStatus), so comparing it against the enum member directly
 * mixes an enum with a number. The threshold is named rather than inlined as
 * a bare 500.
 */
const SERVER_ERROR_FLOOR: number = HttpStatus.INTERNAL_SERVER_ERROR;

/** Same reason as SERVER_ERROR_FLOOR: compared against a plain number. */
const PAYLOAD_TOO_LARGE: number = HttpStatus.PAYLOAD_TOO_LARGE;

/** ValidationPipe returns `message` as a string[]; most others as a string. */
function isMessage(value: unknown): value is string | string[] {
  return (
    typeof value === 'string' ||
    (Array.isArray(value) && value.every((item) => typeof item === 'string'))
  );
}

/**
 * Turns everything - HttpException, Prisma errors, and unexpected throws -
 * into one consistent envelope.
 *
 * The rule that matters: an unrecognised error never leaks its message or
 * stack to the client in production. It gets logged in full server-side and
 * the caller gets a generic 500 plus a requestId to quote.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly isProduction = process.env.NODE_ENV === 'production';

  constructor(private readonly logger: AppLogger) {
    this.logger.setContext('ExceptionFilter');
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.requestId;

    const envelope = this.toEnvelope(exception, requestId);

    if (envelope.statusCode >= SERVER_ERROR_FLOOR) {
      this.logger.error(
        `Unhandled ${envelope.statusCode} on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : undefined,
        { requestId, userId: request.user?.id },
      );
    } else {
      this.logger.warn(
        `${envelope.statusCode} on ${request.method} ${request.url}: ${String(
          envelope.message,
        )}`,
        { requestId, userId: request.user?.id },
      );
    }

    response.status(envelope.statusCode).json(envelope);
  }

  private toEnvelope(exception: unknown, requestId?: string): ErrorEnvelope {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        return {
          statusCode: status,
          error: exception.name,
          message: body,
          requestId,
        };
      }

      // Narrowed rather than cast: `payload.error as string ?? fallback` is a
      // lie the compiler believes - the assertion makes the value look
      // non-nullable, so the `??` never fires and the fallback is dead. Nest's
      // built-in exceptions do omit these fields, so the fallback matters.
      const payload = body as Record<string, unknown>;
      return {
        statusCode: status,
        error:
          typeof payload.error === 'string' ? payload.error : exception.name,
        message: isMessage(payload.message)
          ? payload.message
          : exception.message,
        requestId,
        ...(payload.details !== undefined ? { details: payload.details } : {}),
      };
    }

    const prismaEnvelope = this.fromPrisma(exception, requestId);
    if (prismaEnvelope) return prismaEnvelope;

    const middlewareEnvelope = this.fromMiddleware(exception, requestId);
    if (middlewareEnvelope) return middlewareEnvelope;

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'InternalServerError',
      message: this.isProduction
        ? 'An unexpected error occurred'
        : exception instanceof Error
          ? exception.message
          : String(exception),
      requestId,
    };
  }

  /**
   * Express middleware throws plain Errors that already carry an HTTP status -
   * body-parser's PayloadTooLargeError (413) and its malformed-JSON
   * SyntaxError (400) are the ones reachable here.
   *
   * Without this they fall through to the catch-all and become 500s, which is
   * wrong twice over: the caller is told the server broke when in fact their
   * request did, and every oversized body gets logged at error level as an
   * unhandled fault. A 413 is a normal, expected answer to a 2MB login.
   */
  private fromMiddleware(
    exception: unknown,
    requestId?: string,
  ): ErrorEnvelope | null {
    if (!(exception instanceof Error)) {
      return null;
    }

    const status = (exception as { status?: unknown; statusCode?: unknown })
      .status;
    const statusCode = (exception as { statusCode?: unknown }).statusCode;
    const resolved = typeof status === 'number' ? status : statusCode;

    // Client-error range only. A middleware error carrying a 5xx is a genuine
    // server fault and should keep the catch-all's redaction.
    if (typeof resolved !== 'number' || resolved < 400 || resolved >= 500) {
      return null;
    }

    return {
      statusCode: resolved,
      error: exception.name,
      message:
        resolved === PAYLOAD_TOO_LARGE
          ? 'Request body is too large'
          : exception.message,
      requestId,
    };
  }

  /**
   * Maps the Prisma error codes we actually rely on. Notably P2002 - the
   * unique-constraint violation that enforces ingestion idempotency - must
   * surface as a 409, not a 500, because callers branch on it.
   */
  private fromPrisma(
    exception: unknown,
    requestId?: string,
  ): ErrorEnvelope | null {
    if (!(exception instanceof Prisma.PrismaClientKnownRequestError)) {
      return null;
    }

    switch (exception.code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: 'A record with these values already exists',
          requestId,
          details: exception.meta?.target,
        };
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          error: 'NotFound',
          message: 'The requested record does not exist',
          requestId,
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'BadRequest',
          message: 'Referenced record does not exist',
          requestId,
          details: exception.meta?.field_name,
        };
      default:
        return null;
    }
  }
}
