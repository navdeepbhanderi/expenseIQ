/**
 * Profile identity: the two-letter monogram and the tint behind it.
 *
 * Design 2c makes the avatar colour load-bearing - it "tints the greeting row
 * so you always know whose money you're looking at". So it's derived once at
 * creation and stored, never recomputed on read: renaming "Personal" to
 * "Household" must not silently change the user's colour.
 *
 * Palette is drawn from the Ledger Warm direction, deliberately avoiding the
 * two semantic colours: marigold #E39B2E means "needs your eye" and red
 * #B5442F means spend. An avatar that happened to be marigold would read as
 * an alert.
 */

export const AVATAR_PALETTE = [
  '#1F6F5C', // ledger green
  '#3E8E5A', // income green
  '#3B6C89', // health blue
  '#5A5A80', // travel indigo
  '#8A6A1E', // dark gold
  '#7A4A3A', // clay
  '#2F8570', // teal
  '#5A7A3E', // olive
] as const;

/**
 * Two letters from the *first word*: the first letter, then the next letter
 * that differs from it.
 *
 * Reverse-engineered from all 19 monograms in the design, because two obvious
 * rules both get it wrong:
 *
 *   one letter per word  →  "Sharma family" = SF, but the design shows SH
 *   first two letters    →  "Aarav"         = AA, but the design shows AR
 *
 * Skipping the repeat satisfies every example - Groceries GR, Eating out EA,
 * EMI & loans EM, Utilities UT, Ishaan IS, Sharma family SH, Aarav AR - and
 * has an independent justification: a monogram of two identical letters
 * carries less information and reads worse.
 *
 * Note this takes whatever string the caller hands it. The design's personal
 * profile shows AR for a profile *named* "Personal", because the monogram
 * comes from the user's name in that case - deciding which string to feed in
 * is the caller's job, not this function's.
 */
export function deriveInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .map((word) => [...word].filter((char) => /\p{L}|\p{N}/u.test(char)))
    .filter((letters) => letters.length > 0);

  if (words.length === 0) {
    return '??';
  }

  const first = words[0] ?? [];
  const lead = first[0] ?? '?';

  const distinct = first
    .slice(1)
    .find((char) => char.toLowerCase() !== lead.toLowerCase());

  if (distinct) {
    return `${lead}${distinct}`.toUpperCase();
  }

  // No distinct letter in the first word ("A", "Aaa"). Borrow from the next
  // word if there is one, so "A Sharma" reads as AS; otherwise accept the
  // repeat rather than emitting a placeholder.
  const fallback = words[1]?.[0] ?? first[1] ?? lead;
  return `${lead}${fallback}`.toUpperCase();
}

/**
 * Picks a stable colour from the palette.
 *
 * Deterministic on the seed rather than random, so the same profile gets the
 * same colour if it is ever recreated - and so tests don't have to stub a
 * random source. `existing` lets the caller spread colours across a user's
 * profiles instead of handing two profiles the same tint.
 */
export function pickAvatarColor(
  seed: string,
  existing: readonly string[] = [],
): string {
  const available = AVATAR_PALETTE.filter((color) => !existing.includes(color));
  const pool = available.length > 0 ? available : AVATAR_PALETTE;

  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }

  const index = Math.abs(hash) % pool.length;
  return pool[index] ?? AVATAR_PALETTE[0];
}
