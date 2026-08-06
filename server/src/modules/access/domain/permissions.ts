import { ProfileRole } from '@prisma/client';

/**
 * The permission matrix from the architecture doc (§3.2), as data.
 *
 * Keeping this a table rather than scattered `if (role === 'OWNER')` checks is
 * the whole point: the rules are readable in one place, testable without a
 * database, and a new action can't be added without consciously deciding what
 * each role may do with it.
 *
 * The feature spec is emphatic that CHILD restrictions are enforced
 * server-side, not merely hidden in the UI — "a determined user could
 * otherwise hit the API directly". This table is that enforcement.
 */
export type Action =
  // Profile
  | 'profile:view'
  | 'profile:edit'
  | 'profile:delete'
  | 'profile:viewMembers'
  // Membership
  | 'member:invite'
  | 'member:remove'
  | 'member:changeRole'
  // Accounts — a CHILD may not link a card or a loan
  | 'account:view'
  | 'account:create'
  | 'account:edit'
  | 'account:delete'
  | 'account:linkCredit'
  // Transactions — a CHILD may log manually but nothing automated
  | 'transaction:view'
  | 'transaction:create'
  | 'transaction:edit'
  | 'transaction:delete'
  // Categories & budgets
  | 'category:manage'
  | 'budget:manage'
  // AI entry
  | 'nlu:parse'
  | 'reviewQueue:manage'
  // Integrations — off-limits to CHILD regardless of family settings
  | 'integration:enable'
  | 'integration:disable'
  // Parental controls
  | 'spendLimit:view'
  | 'spendLimit:set'
  | 'allowance:set'
  | 'goal:manage';

const OWNER_ACTIONS: readonly Action[] = [
  'profile:view',
  'profile:edit',
  'profile:delete',
  'profile:viewMembers',
  'member:invite',
  'member:remove',
  'member:changeRole',
  'account:view',
  'account:create',
  'account:edit',
  'account:delete',
  'account:linkCredit',
  'transaction:view',
  'transaction:create',
  'transaction:edit',
  'transaction:delete',
  'category:manage',
  'budget:manage',
  'nlu:parse',
  'reviewQueue:manage',
  'integration:enable',
  'integration:disable',
  'spendLimit:view',
  'spendLimit:set',
  'allowance:set',
  'goal:manage',
];

/**
 * An ADULT manages their own money fully but holds no authority over anyone
 * else: no invites, no role changes, no setting limits on a child.
 */
const ADULT_ACTIONS: readonly Action[] = [
  'profile:view',
  'profile:edit',
  'profile:viewMembers',
  'account:view',
  'account:create',
  'account:edit',
  'account:delete',
  'account:linkCredit',
  'transaction:view',
  'transaction:create',
  'transaction:edit',
  'transaction:delete',
  'category:manage',
  'budget:manage',
  'nlu:parse',
  'reviewQueue:manage',
  'integration:enable',
  'integration:disable',
  'spendLimit:view',
  'goal:manage',
];

/**
 * A CHILD can see their own money and log it by hand or by voice, and nothing
 * else. No credit products, no integrations, no control over their own limits.
 *
 * `nlu:parse` is deliberately allowed: the spec's design rationale is nudging
 * over blocking, and voice entry is the feature most likely to get a kid
 * logging expenses at all. What's blocked is *automated ingestion* — Gmail and
 * SMS parsing — which is `integration:enable`.
 */
const CHILD_ACTIONS: readonly Action[] = [
  'profile:view',
  'account:view',
  'transaction:view',
  'transaction:create',
  'transaction:edit',
  'transaction:delete',
  'nlu:parse',
  'reviewQueue:manage',
  'spendLimit:view',
  'goal:manage',
];

const MATRIX: Readonly<Record<ProfileRole, ReadonlySet<Action>>> = {
  [ProfileRole.OWNER]: new Set(OWNER_ACTIONS),
  [ProfileRole.ADULT]: new Set(ADULT_ACTIONS),
  [ProfileRole.CHILD]: new Set(CHILD_ACTIONS),
};

export function can(role: ProfileRole, action: Action): boolean {
  return MATRIX[role].has(action);
}

export function actionsFor(role: ProfileRole): Action[] {
  return [...MATRIX[role]].sort();
}
