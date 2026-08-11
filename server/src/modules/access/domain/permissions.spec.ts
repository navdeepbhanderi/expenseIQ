import { ProfileRole } from '@prisma/client';
import { actionsFor, can, type Action } from './permissions';

describe('permission matrix', () => {
  describe('OWNER', () => {
    it('can do everything an ADULT can, and more', () => {
      for (const action of actionsFor(ProfileRole.ADULT)) {
        expect(can(ProfileRole.OWNER, action)).toBe(true);
      }
      expect(actionsFor(ProfileRole.OWNER).length).toBeGreaterThan(
        actionsFor(ProfileRole.ADULT).length,
      );
    });

    it('alone may invite members and set spend limits', () => {
      expect(can(ProfileRole.OWNER, 'member:invite')).toBe(true);
      expect(can(ProfileRole.ADULT, 'member:invite')).toBe(false);
      expect(can(ProfileRole.CHILD, 'member:invite')).toBe(false);

      expect(can(ProfileRole.OWNER, 'spendLimit:set')).toBe(true);
      expect(can(ProfileRole.ADULT, 'spendLimit:set')).toBe(false);
      expect(can(ProfileRole.CHILD, 'spendLimit:set')).toBe(false);
    });
  });

  describe('CHILD restrictions', () => {
    // The feature spec is explicit that these are server-side rules, because
    // a hidden button is not a restriction.
    it('cannot link a credit card or loan', () => {
      // The spec restricts "card and loan linking" specifically, not accounts
      // as a concept - a kid tracking cash is exactly the manual entry it does
      // allow. So account:create is granted and account:linkCredit is not;
      // AccountsService gates the credit types on the latter.
      expect(can(ProfileRole.CHILD, 'account:linkCredit')).toBe(false);
      expect(can(ProfileRole.CHILD, 'account:create')).toBe(true);
    });

    it('cannot enable Gmail or SMS parsing', () => {
      expect(can(ProfileRole.CHILD, 'integration:enable')).toBe(false);
      expect(can(ProfileRole.CHILD, 'integration:disable')).toBe(false);
    });

    it('cannot change its own spend limits', () => {
      expect(can(ProfileRole.CHILD, 'spendLimit:view')).toBe(true);
      expect(can(ProfileRole.CHILD, 'spendLimit:set')).toBe(false);
    });

    it('cannot delete or edit the profile', () => {
      expect(can(ProfileRole.CHILD, 'profile:edit')).toBe(false);
      expect(can(ProfileRole.CHILD, 'profile:delete')).toBe(false);
    });

    it('CAN still log expenses, including by voice', () => {
      // Nudge over lockout: a kid who can't log spending just stops logging,
      // which defeats the point of the product.
      expect(can(ProfileRole.CHILD, 'transaction:create')).toBe(true);
      expect(can(ProfileRole.CHILD, 'nlu:parse')).toBe(true);
      expect(can(ProfileRole.CHILD, 'goal:manage')).toBe(true);
    });
  });

  describe('ADULT', () => {
    it('manages their own money fully but holds no authority over others', () => {
      expect(can(ProfileRole.ADULT, 'account:linkCredit')).toBe(true);
      expect(can(ProfileRole.ADULT, 'integration:enable')).toBe(true);
      expect(can(ProfileRole.ADULT, 'member:changeRole')).toBe(false);
      expect(can(ProfileRole.ADULT, 'profile:delete')).toBe(false);
      expect(can(ProfileRole.ADULT, 'allowance:set')).toBe(false);
    });
  });

  describe('completeness', () => {
    it('every role can view the profile it belongs to', () => {
      for (const role of Object.values(ProfileRole)) {
        expect(can(role, 'profile:view')).toBe(true);
      }
    });

    it('no role is accidentally empty', () => {
      for (const role of Object.values(ProfileRole)) {
        expect(actionsFor(role).length).toBeGreaterThan(0);
      }
    });

    it('rejects an unknown action for every role', () => {
      for (const role of Object.values(ProfileRole)) {
        expect(can(role, 'nonsense:action' as Action)).toBe(false);
      }
    });
  });
});
