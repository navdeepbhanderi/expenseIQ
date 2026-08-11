import {
  DEFAULT_CHAINS,
  isThinkingConfigRejection,
  isWorthAnotherModel,
  resolveChain,
  statusOf,
} from '../model-fallback';

/** The shapes @google/genai has actually been observed to throw. */
const quota429 = new Error(
  '{"error":{"code":429,"message":"You exceeded your current quota, ' +
    'please check your plan and billing details.","status":"RESOURCE_EXHAUSTED"}}',
);
const unknownModel404 = new Error(
  '{"error":{"code":404,"message":"models/gemini-9-pro is not found for API ' +
    'version v1beta","status":"NOT_FOUND"}}',
);
const thinkingRejected400 = new Error(
  '{"error":{"code":400,"message":"Unable to submit request because ' +
    'thinking_config is not supported by this model.","status":"INVALID_ARGUMENT"}}',
);
const genericBad400 = new Error(
  '{"error":{"code":400,"message":"Request contains an invalid argument.",' +
    '"status":"INVALID_ARGUMENT"}}',
);
const badKey403 = new Error(
  '{"error":{"code":403,"message":"Method doesn\'t allow unregistered ' +
    'callers.","status":"PERMISSION_DENIED"}}',
);

describe('statusOf', () => {
  it('reads a numeric status off the error object', () => {
    expect(statusOf({ status: 429 })).toBe(429);
    expect(statusOf({ code: 503 })).toBe(503);
  });

  it('digs the status out of an embedded JSON body', () => {
    expect(statusOf(quota429)).toBe(429);
    expect(statusOf(unknownModel404)).toBe(404);
  });

  it('reads "status: 500" phrasing', () => {
    expect(statusOf(new Error('got status: 500 Internal Server Error'))).toBe(
      500,
    );
  });

  it('does not mistake an echoed amount for a status', () => {
    // The regression this regex was tightened for. Gemini echoes the failing
    // request in some errors, and "300 रुपये" must not read as HTTP 300 -
    // that would classify an unrelated failure as retryable and burn the
    // whole chain on it.
    expect(statusOf(new Error('failed to parse: 300 रुपये किराने पे'))).toBe(
      null,
    );
    expect(statusOf(new Error('candidate amount 482 was rejected'))).toBe(null);
  });

  it('returns null for errors with no status at all', () => {
    expect(statusOf(new Error('socket hang up'))).toBe(null);
    expect(statusOf('a bare string')).toBe(null);
    expect(statusOf(null)).toBe(null);
  });
});

describe('isWorthAnotherModel', () => {
  it('retries quota exhaustion - the case the chain exists for', () => {
    expect(isWorthAnotherModel(quota429)).toBe(true);
  });

  it('retries an unknown model and a rejected parameter', () => {
    expect(isWorthAnotherModel(unknownModel404)).toBe(true);
    expect(isWorthAnotherModel(thinkingRejected400)).toBe(true);
  });

  it('retries 5xx, since capacity differs per model', () => {
    expect(isWorthAnotherModel({ status: 503 })).toBe(true);
  });

  it('does not retry an auth failure - every model would reject it', () => {
    expect(isWorthAnotherModel(badKey403)).toBe(false);
    expect(isWorthAnotherModel({ status: 401 })).toBe(false);
  });

  it('does not retry an unclassifiable error', () => {
    expect(isWorthAnotherModel(new Error('socket hang up'))).toBe(false);
  });
});

describe('isThinkingConfigRejection', () => {
  it('recognises the gemini-3.6-flash rejection', () => {
    expect(isThinkingConfigRejection(thinkingRejected400)).toBe(true);
  });

  it('treats a generic 400 as a suspected rejection', () => {
    // The real gemini-3.6-flash error says only "Request contains an invalid
    // argument." - no mention of thinking. Matching on the word made this
    // never fire against the live API.
    expect(isThinkingConfigRejection(genericBad400)).toBe(true);
  });

  it('ignores a 429 that happens to mention thinking', () => {
    expect(
      isThinkingConfigRejection(
        new Error('{"code":429,"message":"thinking quota exceeded"}'),
      ),
    ).toBe(false);
  });
});

describe('resolveChain', () => {
  it('splits and trims a configured chain', () => {
    expect(resolveChain(' a , b ,c ', 'pro')).toEqual(['a', 'b', 'c']);
  });

  it('treats a single model as a chain of one', () => {
    expect(resolveChain('gemini-3.5-flash', 'pro')).toEqual([
      'gemini-3.5-flash',
    ]);
  });

  it('falls back to the built-in chain when unset or empty', () => {
    expect(resolveChain(undefined, 'pro')).toEqual([...DEFAULT_CHAINS.pro]);
    expect(resolveChain('  ,, ', 'flash')).toEqual([...DEFAULT_CHAINS.flash]);
  });

  it('never returns a chain containing a Pro model by default', () => {
    // Every Pro model has a free-tier quota of zero - verified against a real
    // key for 2.5-pro, 3-pro-preview and 3.1-pro-preview. Defaulting to one
    // would make the whole chain fail for anyone without billing.
    for (const tier of ['pro', 'flash'] as const) {
      expect(DEFAULT_CHAINS[tier].some((m) => m.includes('-pro'))).toBe(false);
    }
  });
});
