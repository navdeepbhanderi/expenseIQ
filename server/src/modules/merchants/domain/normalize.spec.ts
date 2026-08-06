import { normalizeMerchant } from './normalize';

describe('normalizeMerchant', () => {
  it('handles the roadmap`s own example', () => {
    expect(normalizeMerchant('SWIGGY*BLR9284')).toBe('Swiggy');
  });

  it('strips payment-rail prefixes', () => {
    expect(normalizeMerchant('UPI/DMART/9284718')).toBe('Dmart');
    expect(normalizeMerchant('POS 1234 AMAZON')).toBe('Amazon');
    expect(normalizeMerchant('NEFT ADANI ELECTRICITY')).toBe(
      'Adani Electricity',
    );
  });

  it('picks the meaningful half of an aggregator descriptor', () => {
    // "PAYU" is the gateway; "BOOKMYSHOW" is who was actually paid.
    expect(normalizeMerchant('PAYU*BOOKMYSHOW')).toBe('Bookmyshow');
  });

  it('removes reference numbers', () => {
    expect(normalizeMerchant('UBER TRIP 8829471')).toBe('Uber Trip');
    expect(normalizeMerchant('ZOMATO ORD9284718')).toBe('Zomato');
  });

  it('drops corporate and city suffixes', () => {
    expect(normalizeMerchant('RELIANCE RETAIL PVT LTD')).toBe(
      'Reliance Retail',
    );
    expect(normalizeMerchant('BIG BAZAAR MUMBAI')).toBe('Big Bazaar');
  });

  it('preserves short acronyms rather than title-casing them', () => {
    // "HDFC" must not become "Hdfc".
    expect(normalizeMerchant('HDFC BANK')).toBe('HDFC Bank');
    expect(normalizeMerchant('BSNL')).toBe('BSNL');
  });

  it('maps different branches of one merchant to the same name', () => {
    // This is what makes the table work as a cache: both forms collapse to a
    // single row, so the second one never needs an LLM call.
    expect(normalizeMerchant('SWIGGY*BLR9284')).toBe(
      normalizeMerchant('SWIGGY*MUM1122'),
    );
  });

  it('is idempotent', () => {
    // Normalising an already-normalised name must not degrade it, or a
    // re-import would slowly erode every merchant in the table.
    for (const raw of [
      'SWIGGY*BLR9284',
      'UPI/DMART/9284718',
      'HDFC BANK',
      'Reliance Retail Pvt Ltd',
    ]) {
      const once = normalizeMerchant(raw);
      expect(normalizeMerchant(once)).toBe(once);
    }
  });

  it('leaves an already-clean name alone', () => {
    expect(normalizeMerchant('Uber')).toBe('Uber');
    expect(normalizeMerchant('Adani Electricity')).toBe('Adani Electricity');
  });

  it('keeps non-Latin names intact', () => {
    // A Hindi-first product cannot mangle a Devanagari merchant name.
    expect(normalizeMerchant('किराना स्टोर')).toBe('किराना स्टोर');
  });

  it('never returns empty for a non-empty input', () => {
    // Falling back to the raw string is better than losing the merchant
    // entirely when the input is all noise.
    for (const raw of ['1234567', '***', '///', 'UPI/']) {
      expect(normalizeMerchant(raw).length).toBeGreaterThan(0);
    }
  });

  it('returns empty for genuinely empty input', () => {
    expect(normalizeMerchant('')).toBe('');
    expect(normalizeMerchant('   ')).toBe('');
  });
});
