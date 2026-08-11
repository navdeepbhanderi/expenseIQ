import { matchAccount, matchCategory, matchName } from './matching';

const CATEGORIES = [
  { id: 'c1', name: 'Groceries' },
  { id: 'c2', name: 'Eating out' },
  { id: 'c3', name: 'Fuel' },
  { id: 'c4', name: 'Transport' },
  { id: 'c5', name: 'Utilities' },
  { id: 'c6', name: 'Salary' },
];

const ACCOUNTS = [
  { id: 'a1', name: 'HDFC Millennia' },
  { id: 'a2', name: 'SBI Savings' },
  { id: 'a3', name: 'Flipkart Axis Bank' },
  { id: 'a4', name: 'Paytm Wallet' },
];

const cat = (spoken: string) => matchCategory(CATEGORIES, spoken)?.row.name;
const acc = (spoken: string) => matchAccount(ACCOUNTS, spoken)?.row.name;

describe('matchCategory', () => {
  it('matches exactly, ignoring case', () => {
    expect(cat('groceries')).toBe('Groceries');
    expect(cat('GROCERIES')).toBe('Groceries');
  });

  it('matches the singular and near-misses', () => {
    // What a model actually returns, and what exact equality rejected.
    expect(cat('grocery')).toBe('Groceries');
    expect(cat('grocerys')).toBe('Groceries');
  });

  it('matches English synonyms', () => {
    expect(cat('food')).toBe('Eating out');
    expect(cat('restaurant')).toBe('Eating out');
    expect(cat('petrol')).toBe('Fuel');
    expect(cat('diesel')).toBe('Fuel');
  });

  it('matches merchant names people use as categories', () => {
    expect(cat('swiggy')).toBe('Eating out');
    expect(cat('zomato')).toBe('Eating out');
  });

  it('matches Hinglish', () => {
    expect(cat('kirana')).toBe('Groceries');
    expect(cat('khana')).toBe('Eating out');
  });

  it('matches Hindi', () => {
    expect(cat('किराना')).toBe('Groceries');
    expect(cat('पेट्रोल')).toBe('Fuel');
    expect(cat('खाना')).toBe('Eating out');
  });

  it('matches Gujarati', () => {
    expect(cat('કરિયાણું')).toBe('Groceries');
    expect(cat('પેટ્રોલ')).toBe('Fuel');
    expect(cat('જમવાનું')).toBe('Eating out');
  });

  it('refuses a word that means none of them', () => {
    // Filing an expense to a category the user did not mean is worse than
    // asking, because it is silent and it skews every total.
    expect(cat('xylophone')).toBeUndefined();
    expect(cat('haircut')).toBeUndefined();
  });

  it('returns nothing for an empty or null name', () => {
    expect(matchCategory(CATEGORIES, null)).toBeNull();
    expect(matchCategory(CATEGORIES, '   ')).toBeNull();
  });
});

describe('matchAccount', () => {
  it('matches a bank name against the full account name', () => {
    // The single most common real case, and the one exact matching broke.
    expect(acc('HDFC')).toBe('HDFC Millennia');
    expect(acc('hdfc')).toBe('HDFC Millennia');
    expect(acc('sbi')).toBe('SBI Savings');
  });

  it('matches on a distinctive word inside a longer name', () => {
    expect(acc('axis')).toBe('Flipkart Axis Bank');
    expect(acc('flipkart')).toBe('Flipkart Axis Bank');
    expect(acc('paytm')).toBe('Paytm Wallet');
  });

  it('ignores the words every account shares', () => {
    /*
     * "bank" and "card" appear in half the names. Without the noise list,
     * "axis bank" scores against "Flipkart Axis Bank" and "SBI Savings"
     * alike, and the winner is whichever happens to be first.
     */
    expect(acc('axis bank')).toBe('Flipkart Axis Bank');
    expect(acc('hdfc card')).toBe('HDFC Millennia');
  });

  it('tolerates a transposed typo', () => {
    expect(acc('hdcf')).toBe('HDFC Millennia');
  });

  it('refuses a bank the user does not have', () => {
    expect(acc('ICICI')).toBeUndefined();
    expect(acc('Kotak')).toBeUndefined();
  });

  it('does not match on a shared noise word alone', () => {
    // "savings" is in the noise list; "my savings account" carries nothing
    // that identifies which account is meant.
    expect(acc('my savings account')).toBeUndefined();
  });
});

describe('matchName scoring', () => {
  it('reports how the match was made', () => {
    expect(matchName(CATEGORIES, 'Groceries')?.how).toBe('exact');
    expect(matchCategory(CATEGORIES, 'kirana')?.how).toBe('alias');
    expect(matchAccount(ACCOUNTS, 'hdfc')?.how).toBe('contains');
  });

  it('scores an exact match above an inferred one', () => {
    const exact = matchCategory(CATEGORIES, 'Fuel')!;
    const alias = matchCategory(CATEGORIES, 'petrol')!;
    const partial = matchAccount(ACCOUNTS, 'hdfc')!;

    expect(exact.score).toBe(1);
    expect(alias.score).toBeLessThan(exact.score);
    expect(partial.score).toBeLessThan(alias.score);
  });

  it('prefers the better of two plausible rows', () => {
    const rows = [
      { id: 'x', name: 'HDFC Millennia' },
      { id: 'y', name: 'HDFC Millennia Credit Card' },
    ];
    // The shorter name is the closer fit for the shorter utterance.
    expect(matchAccount(rows, 'HDFC Millennia')?.row.id).toBe('x');
  });

  it('is unaffected by punctuation and extra spacing', () => {
    expect(acc('  h.d.f.c.  ')).toBe('HDFC Millennia');
  });
});
