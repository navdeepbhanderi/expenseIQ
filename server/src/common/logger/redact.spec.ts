import { redact, REDACTED } from './redact';

describe('redact', () => {
  it('strips secrets regardless of casing or nesting', () => {
    const input = {
      email: 'aarav@example.com',
      password: 'hunter2',
      auth: { refreshToken: 'abc', Authorization: 'Bearer xyz' },
      config: { GEMINI_API_KEY: 'sk-live-123' },
    };

    expect(redact(input)).toEqual({
      email: 'aarav@example.com',
      password: REDACTED,
      auth: { refreshToken: REDACTED, Authorization: REDACTED },
      config: { GEMINI_API_KEY: REDACTED },
    });
  });

  it('masks account identifiers instead of dropping them', () => {
    // "····4021" still has to be renderable, and the tail is what identifies
    // the account to a human reading logs.
    expect(redact({ accountNumber: '123456784021' })).toEqual({
      accountNumber: '********4021',
    });
  });

  it('survives circular references', () => {
    const node: Record<string, unknown> = { name: 'root' };
    node.self = node;
    expect(() => redact(node)).not.toThrow();
    expect(redact(node)).toEqual({ name: 'root', self: '[circular]' });
  });

  it('stringifies BigInt so a log write never throws', () => {
    // JSON.stringify(1n) throws TypeError. Every money column is a BigInt,
    // so an unguarded log of a transaction would crash the request.
    expect(redact({ amountMinor: 30_000n })).toEqual({ amountMinor: '30000' });
  });

  it('preserves error shape for stack traces', () => {
    const result = redact({ err: new Error('boom') }) as {
      err: { name: string; message: string };
    };
    expect(result.err.name).toBe('Error');
    expect(result.err.message).toBe('boom');
  });

  it('leaves primitives alone', () => {
    expect(redact('plain')).toBe('plain');
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBeNull();
  });
});
