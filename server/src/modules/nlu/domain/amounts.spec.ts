import { resolveAmount } from './amounts';

const at = (utterance: string) => resolveAmount(utterance)?.amountMinor;

describe('resolveAmount - scale words', () => {
  it('reads lakh', () => {
    // The failure that motivated this: the model returns 3.
    expect(at('teen lakh nahi, 3 lakh ka transfer')).toBe(3_00_000_00);
    expect(at('spent 2 lakh on the wedding')).toBe(2_00_000_00);
  });

  it('reads crore', () => {
    expect(at('1.5 crore property')).toBe(1_50_00_000_00);
    expect(at('2 cr')).toBe(2_00_00_000_00);
  });

  it('reads thousands', () => {
    expect(at('5k on rent')).toBe(5_000_00);
    expect(at('paid 12 thousand')).toBe(12_000_00);
    expect(at('20 hazaar diye')).toBe(20_000_00);
  });

  it('reads Devanagari and Gujarati spellings', () => {
    expect(at('5 लाख का transfer')).toBe(5_00_000_00);
    expect(at('૩ લાખ')).toBe(3_00_000_00);
    expect(at('10 हजार')).toBe(10_000_00);
  });

  it('parses Indic digits', () => {
    expect(at('२ लाख')).toBe(2_00_000_00);
  });
});

describe('resolveAmount - fractions people actually say', () => {
  it.each([
    ['sava lakh', 1_25_000_00],
    ['dedh lakh', 1_50_000_00],
    ['dhai lakh', 2_50_000_00],
    ['adha lakh', 50_000_00],
    ['paune lakh', 75_000_00],
    ['डेढ़ लाख', 1_50_000_00],
  ])('%s', (phrase, expected) => {
    expect(at(`${phrase} ka kaam`)).toBe(expected);
  });

  it('keeps paise exact despite the float multiply', () => {
    // 1.25 * 100000 * 100 must be an integer, not 12499999.999…
    expect(Number.isInteger(at('sava lakh'))).toBe(true);
  });
});

describe('resolveAmount - what it must leave alone', () => {
  it('ignores a bare number', () => {
    /*
     * The model reads these correctly and has the context to know which of
     * several numbers is the amount. Overriding would trade a rare failure
     * for a common one.
     */
    expect(resolveAmount('kal swiggy se 482 ka order kiya')).toBeNull();
    expect(resolveAmount('300 रुपये किराने पे')).toBeNull();
  });

  it('ignores a scale word with no quantity', () => {
    // A turn of phrase, not an amount.
    expect(resolveAmount('lakhon log the wahan')).toBeNull();
  });

  it('does not fire on a k inside another word', () => {
    expect(resolveAmount('kirana ka saman')).toBeNull();
    expect(resolveAmount('bought a bike')).toBeNull();
  });

  it('ignores zero and negatives', () => {
    expect(resolveAmount('0 lakh')).toBeNull();
  });
});
