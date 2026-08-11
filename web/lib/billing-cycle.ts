/**
 * Explains what a statement day and a due day actually mean together.
 *
 * The form asks for two days of the month and says nothing about how they
 * combine, which makes the commonest real setup look wrong. A card that
 * statements on the 15th and falls due on the 5th is due on the 5th of the
 * *next* month — twenty-one days of grace — but typing "5" next to "15" reads
 * as though the bill will fall due ten days before it is generated.
 *
 * The server has always resolved this correctly (`billing-cycle.ts`:
 * `monthsAhead = dueDay > statementDay ? 0 : 1`). Nothing was wrong except
 * that the user could not see it, so they had to either trust it or work it
 * out. This mirrors that one rule so the form can state the answer.
 *
 * Deliberately a mirror rather than a second source of truth: it drives a
 * preview line, never a stored value. The dates the product acts on all come
 * from the server.
 */

export interface CyclePreview {
  /** The upcoming statement date. */
  statementDate: Date;
  /** When that statement falls due. */
  dueDate: Date;
  /** Days between the two — the grace period, which is what people know. */
  graceDays: number;
}

/** Clamps a day into a month that may be shorter than it. */
function clampToMonth(year: number, month: number, day: number): Date {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, last)));
}

/**
 * Works out the next statement and its due date from the two days entered.
 *
 * Returns null when either day is missing or out of range, so the caller can
 * simply not render a preview rather than show a wrong one.
 */
export function previewCycle(
  statementDay: number,
  dueDay: number,
  today: Date = new Date(),
): CyclePreview | null {
  if (
    !Number.isInteger(statementDay) ||
    !Number.isInteger(dueDay) ||
    statementDay < 1 ||
    statementDay > 31 ||
    dueDay < 1 ||
    dueDay > 31
  ) {
    return null;
  }

  const year = today.getFullYear();
  const month = today.getMonth();

  // The next statement on or after today.
  let statementDate = clampToMonth(year, month, statementDay);
  if (statementDate.getTime() < Date.UTC(year, month, today.getDate())) {
    statementDate = clampToMonth(year, month + 1, statementDay);
  }

  /*
   * The same rule the server uses.
   *
   * Equal days roll forward too: a balance cannot fall due the same instant
   * the statement that created it is generated.
   */
  const monthsAhead = dueDay > statementDay ? 0 : 1;
  const dueDate = clampToMonth(
    statementDate.getUTCFullYear(),
    statementDate.getUTCMonth() + monthsAhead,
    dueDay,
  );

  return {
    statementDate,
    dueDate,
    graceDays: Math.round(
      (dueDate.getTime() - statementDate.getTime()) / 86_400_000,
    ),
  };
}

/** "Statement 15 Aug → due 5 Sep · 21 days to pay" */
export function describeCycle(preview: CyclePreview): string {
  const on = (date: Date) =>
    date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });

  return `Statement ${on(preview.statementDate)} → due ${on(preview.dueDate)} · ${preview.graceDays} days to pay`;
}
