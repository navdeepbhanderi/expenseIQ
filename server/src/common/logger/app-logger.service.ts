import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { redact } from './redact';

export interface LogContext {
  requestId?: string;
  userId?: string;
  profileId?: string;
  [key: string]: unknown;
}

/**
 * Structured JSON logging — one object per line, never `console.log`.
 *
 * In development it prints a readable single line instead, because reading raw
 * JSON in a terminal while building is miserable and nobody ships their dev
 * terminal to a log aggregator.
 *
 * Nest's own internals call this through the LoggerService interface, whose
 * convention is a trailing *string* context (`log('Started', 'NestFactory')`)
 * and, for errors, a stack trace before it. Our application code passes a
 * structured object instead. Both have to be understood — spreading a string
 * into the entry turns "NestFactory" into {"0":"N","1":"e",…}.
 */
@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger implements LoggerService {
  private context?: string;
  private readonly pretty = process.env.NODE_ENV !== 'production';

  setContext(context: string): this {
    this.context = context;
    return this;
  }

  log(message: unknown, ...optional: unknown[]): void {
    this.write('info', message, optional);
  }

  error(message: unknown, ...optional: unknown[]): void {
    this.write('error', message, optional);
  }

  warn(message: unknown, ...optional: unknown[]): void {
    this.write('warn', message, optional);
  }

  debug(message: unknown, ...optional: unknown[]): void {
    this.write('debug', message, optional);
  }

  verbose(message: unknown, ...optional: unknown[]): void {
    this.write('verbose', message, optional);
  }

  private write(level: string, message: unknown, optional: unknown[]): void {
    const { context, trace, meta } = parseParams(optional, this.context);

    const entry: LogEntry = {
      level,
      time: new Date().toISOString(),
      context,
      message: typeof message === 'string' ? message : redact(message),
      ...(trace ? { trace } : {}),
      meta: redact(meta) as Record<string, unknown>,
    };

    const line = this.pretty ? formatPretty(entry) : serialise(entry);
    const stream = level === 'error' ? process.stderr : process.stdout;
    stream.write(line + '\n');
  }
}

/**
 * Typed rather than a bare Record, so the pretty formatter can read `context`
 * and `trace` as strings instead of stringifying `unknown` — which is how a
 * log line ends up reading "[object Object]".
 */
interface LogEntry {
  level: string;
  time: string;
  context?: string;
  message: unknown;
  trace?: string;
  meta: Record<string, unknown>;
}

/** Flattens meta to the top level for the JSON form. */
function serialise(entry: LogEntry): string {
  const { meta, ...rest } = entry;
  return JSON.stringify({ ...rest, ...meta });
}

/** A stack trace, as opposed to a context label, has frame lines in it. */
function looksLikeStack(value: string): boolean {
  return value.includes('\n') && /\n\s*at\s/.test(value);
}

function parseParams(
  params: unknown[],
  fallbackContext: string | undefined,
): { context?: string; trace?: string; meta: LogContext } {
  let context = fallbackContext;
  let trace: string | undefined;
  const meta: LogContext = {};

  for (const param of params) {
    if (param === undefined || param === null) continue;

    if (typeof param === 'string') {
      if (looksLikeStack(param)) {
        trace = param;
      } else {
        // Nest's convention: the trailing string names the emitting class.
        context = param;
      }
      continue;
    }

    if (param instanceof Error) {
      trace = param.stack;
      continue;
    }

    if (typeof param === 'object') {
      Object.assign(meta, param);
    }
  }

  return { context, trace, meta };
}

function formatPretty(entry: LogEntry): string {
  const { level, time, context, message, trace, meta } = entry;
  const stamp = time.slice(11, 23);
  const tag = context ? ` [${context}]` : '';
  const extras = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const stack = trace ? `\n${trace}` : '';
  const body = typeof message === 'string' ? message : JSON.stringify(message);

  return `${stamp} ${level.toUpperCase().padEnd(5)}${tag} ${body}${extras}${stack}`;
}
