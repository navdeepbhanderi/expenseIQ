import { describe, expect, it } from "vitest";
import { describeCycle, previewCycle } from "./billing-cycle";

// A day early enough in the month that the 15th is still ahead.
const AUG_11 = new Date(2026, 7, 11);

const on = (s: number, d: number, today = AUG_11) => previewCycle(s, d, today);

describe("previewCycle", () => {
  it("rolls the due date into the next month when it is earlier than the statement", () => {
    /*
     * The case from the bug report. Statement on the 15th, due on the 5th, is
     * the 5th of the *following* month — twenty-one days of grace. Typed into
     * the form it reads as though the bill falls due ten days before it is
     * generated, which is what made this look broken.
     */
    const preview = on(15, 5)!;
    expect(preview.statementDate.toISOString().slice(0, 10)).toBe("2026-08-15");
    expect(preview.dueDate.toISOString().slice(0, 10)).toBe("2026-09-05");
    expect(preview.graceDays).toBe(21);
  });

  it("keeps the due date in the same month when it is later", () => {
    const preview = on(5, 25)!;
    expect(preview.dueDate.toISOString().slice(0, 10)).toBe("2026-09-25");
    expect(preview.graceDays).toBe(20);
  });

  it("rolls forward when the two days are equal", () => {
    // A balance cannot fall due the instant the statement creating it exists.
    const preview = on(15, 15)!;
    expect(preview.dueDate.toISOString().slice(0, 10)).toBe("2026-09-15");
    expect(preview.graceDays).toBe(31);
  });

  it("clamps a day the month does not have", () => {
    // Statement on the 31st, due on the 30th → February has neither.
    const preview = previewCycle(31, 30, new Date(2026, 0, 5))!;
    expect(preview.statementDate.toISOString().slice(0, 10)).toBe("2026-01-31");
    expect(preview.dueDate.toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("moves to next month's statement once this month's has passed", () => {
    const preview = on(5, 25, new Date(2026, 7, 20))!;
    expect(preview.statementDate.toISOString().slice(0, 10)).toBe("2026-09-05");
  });

  it("returns nothing rather than something wrong", () => {
    // The caller renders no preview at all, instead of a misleading one.
    expect(previewCycle(Number.NaN, 5)).toBeNull();
    expect(previewCycle(0, 5)).toBeNull();
    expect(previewCycle(15, 32)).toBeNull();
  });
});

describe("describeCycle", () => {
  it("says the whole thing in one line", () => {
    expect(describeCycle(on(15, 5)!)).toBe(
      "Statement 15 Aug → due 5 Sept · 21 days to pay",
    );
  });
});
