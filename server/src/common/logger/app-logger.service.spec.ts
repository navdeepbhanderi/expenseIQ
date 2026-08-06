import { AppLogger } from './app-logger.service';
import { REDACTED } from './redact';

/** Captures what the logger actually writes to the stream. */
function capture(fn: (logger: AppLogger) => void): string {
  const written: string[] = [];
  const spyOut = jest
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
  const spyErr = jest
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });

  try {
    fn(new AppLogger().setContext('TestContext'));
  } finally {
    spyOut.mockRestore();
    spyErr.mockRestore();
  }

  return written.join('');
}

describe('AppLogger', () => {
  it('treats a trailing string as the context, not as spreadable data', () => {
    // Nest calls log('Starting…', 'NestFactory'). Spreading that string
    // produces {"0":"N","1":"e",…} in every framework boot line.
    const output = capture((logger) => logger.log('Started', 'NestFactory'));

    expect(output).toContain('[NestFactory]');
    expect(output).not.toContain('"0":"N"');
  });

  it('falls back to the instance context when none is passed', () => {
    const output = capture((logger) => logger.log('hello'));
    expect(output).toContain('[TestContext]');
  });

  it('separates a stack trace from a context label', () => {
    const stack = 'Error: boom\n    at somewhere (file.ts:1:1)';
    const output = capture((logger) =>
      logger.error('failed', stack, 'MyService'),
    );

    expect(output).toContain('[MyService]');
    expect(output).toContain('at somewhere');
  });

  it('merges structured metadata', () => {
    const output = capture((logger) =>
      logger.log('GET /api/health', { requestId: 'req-1', status: 200 }),
    );

    expect(output).toContain('req-1');
    expect(output).toContain('200');
  });

  it('redacts secrets passed as metadata', () => {
    const output = capture((logger) =>
      logger.log('login', { email: 'a@b.com', password: 'hunter2' }),
    );

    expect(output).toContain('a@b.com');
    expect(output).not.toContain('hunter2');
    expect(output).toContain(REDACTED);
  });

  it('does not throw on BigInt metadata', () => {
    // Every money column is a BigInt; an unguarded log would crash the request.
    expect(() =>
      capture((logger) => logger.log('tx', { amountMinor: 30_000n })),
    ).not.toThrow();
  });
});
