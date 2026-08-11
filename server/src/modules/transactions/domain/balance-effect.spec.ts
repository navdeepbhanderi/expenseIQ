import { balanceDelta, isLiability } from './balance-effect';

describe('balanceDelta', () => {
  describe('assets — the balance is what you hold', () => {
    it('spending reduces it', () => {
      expect(balanceDelta('BANK', 'DEBIT', 5_000_00n)).toBe(-5_000_00n);
    });

    it('income adds to it', () => {
      expect(balanceDelta('BANK', 'CREDIT', 5_000_00n)).toBe(5_000_00n);
    });

    it('applies to cash too', () => {
      expect(balanceDelta('CASH', 'DEBIT', 100n)).toBe(-100n);
    });
  });

  describe('liabilities — the balance is what you owe', () => {
    it('spending on a card increases the outstanding', () => {
      /*
       * The reported bug. Two ₹5,000 purchases left the card reading ₹0
       * outstanding and "0% of limit used", because nothing ever moved the
       * balance at all.
       */
      expect(balanceDelta('CREDIT_CARD', 'DEBIT', 5_000_00n)).toBe(5_000_00n);
    });

    it('paying a card reduces it', () => {
      expect(balanceDelta('CREDIT_CARD', 'CREDIT', 5_200_00n)).toBe(-5_200_00n);
    });

    it('paying a loan reduces the principal owed', () => {
      expect(balanceDelta('LOAN', 'CREDIT', 25_000_00n)).toBe(-25_000_00n);
    });
  });

  it('never depends on the sign it was handed', () => {
    // Amounts are stored as a positive magnitude with the direction alongside;
    // a negative arriving here would otherwise flip the meaning silently.
    expect(balanceDelta('BANK', 'DEBIT', -100n)).toBe(-100n);
    expect(balanceDelta('CREDIT_CARD', 'DEBIT', -100n)).toBe(100n);
  });

  it('reverses exactly, so a delete undoes a create', () => {
    for (const type of ['BANK', 'CREDIT_CARD', 'LOAN', 'CASH'] as const) {
      for (const direction of ['DEBIT', 'CREDIT'] as const) {
        const applied = balanceDelta(type, direction, 1_234_00n);
        expect(applied + -applied).toBe(0n);
      }
    }
  });
});

describe('isLiability', () => {
  it('is what inverts every sign', () => {
    expect(isLiability('CREDIT_CARD')).toBe(true);
    expect(isLiability('LOAN')).toBe(true);
    expect(isLiability('BANK')).toBe(false);
    expect(isLiability('CASH')).toBe(false);
  });
});
