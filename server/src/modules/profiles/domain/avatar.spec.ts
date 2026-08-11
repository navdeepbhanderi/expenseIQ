import { AVATAR_PALETTE, deriveInitials, pickAvatarColor } from './avatar';

describe('deriveInitials', () => {
  it('matches the design`s own examples', () => {
    expect(deriveInitials('Personal')).toBe('PE');
    expect(deriveInitials('Ishaan')).toBe('IS');
    expect(deriveInitials('Aarav')).toBe('AR');
    expect(deriveInitials('Meera')).toBe('ME');
  });

  it('takes two letters from the first word, not one per word', () => {
    // The design shows SH for "Sharma family" and EA for "Eating out".
    // One-letter-per-word would give SF and EO, which is wrong.
    expect(deriveInitials('Sharma family')).toBe('SH');
    expect(deriveInitials('Eating out')).toBe('EA');
    expect(deriveInitials('EMI & loans')).toBe('EM');
  });

  it('skips a repeated leading letter', () => {
    // "Aarav" is AR in the design, not AA - the only one of the 19 monograms
    // that plain first-two-letters gets wrong.
    expect(deriveInitials('Aarav')).toBe('AR');
    expect(deriveInitials('Aaron')).toBe('AR');
  });

  it('reproduces every category monogram in the design', () => {
    const fromDesign: Record<string, string> = {
      Groceries: 'GR',
      'Eating out': 'EA',
      Travel: 'TR',
      Utilities: 'UT',
      Health: 'HE',
      'EMI & loans': 'EM',
      Fuel: 'FU',
      Shopping: 'SH',
      Entertainment: 'EN',
      Rent: 'RE',
      Education: 'ED',
      Other: 'OT',
      Income: 'IN',
    };

    for (const [name, monogram] of Object.entries(fromDesign)) {
      expect(deriveInitials(name)).toBe(monogram);
    }
  });

  it('borrows from the next word when the first has no distinct letter', () => {
    expect(deriveInitials('A Sharma')).toBe('AS');
    expect(deriveInitials('Aaa')).toBe('AA');
  });

  it('handles non-Latin names', () => {
    // A Hindi-first product cannot produce "??" for a Hindi profile name.
    expect(deriveInitials('आरव')).toBe('आर');
    expect(deriveInitials('શર્મા કુટુંબ')).toBe('શર');
  });

  it('survives degenerate input rather than throwing', () => {
    expect(deriveInitials('')).toBe('??');
    expect(deriveInitials('   ')).toBe('??');
    expect(deriveInitials('!!!')).toBe('??');
  });

  it('pads a single-character name', () => {
    expect(deriveInitials('A')).toHaveLength(2);
  });

  it('always returns exactly two characters', () => {
    for (const name of ['A', 'Ab', 'Personal', 'Sharma family', '', '7']) {
      expect([...deriveInitials(name)]).toHaveLength(2);
    }
  });
});

describe('pickAvatarColor', () => {
  it('is deterministic for the same seed', () => {
    expect(pickAvatarColor('profile-1')).toBe(pickAvatarColor('profile-1'));
  });

  it('only ever returns a palette colour', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(AVATAR_PALETTE).toContain(pickAvatarColor(`seed-${i}`));
    }
  });

  it('avoids colours already used by the user`s other profiles', () => {
    const taken = AVATAR_PALETTE.slice(0, 7);
    const picked = pickAvatarColor('anything', taken);
    expect(picked).toBe(AVATAR_PALETTE[7]);
  });

  it('falls back to the full palette once every colour is taken', () => {
    const picked = pickAvatarColor('anything', [...AVATAR_PALETTE]);
    expect(AVATAR_PALETTE).toContain(picked);
  });

  it('never returns a semantic colour', () => {
    // Marigold means "needs your eye" and red means spend; an avatar in
    // either would read as an alert.
    expect(AVATAR_PALETTE).not.toContain('#E39B2E');
    expect(AVATAR_PALETTE).not.toContain('#B5442F');
  });
});
