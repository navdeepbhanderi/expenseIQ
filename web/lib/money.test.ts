import { describe, expect, it } from "vitest";
import {
  formatCompact,
  formatMinor,
  formatMoney,
  parseAmountToMinor,
  percentOf,
} from "./money";

describe("formatMinor", () => {
  it("groups the Indian way, not by thousands", () => {
    // The whole reason this module defers to en-IN. A reader parses
    // "1,24,860" instantly; "124,860" makes them count digits.
    expect(formatMinor(1_24_860_00)).toBe("₹1,24,860");
    expect(formatMinor(64_210_00)).toBe("₹64,210");
    expect(formatMinor(1_00_00_000_00)).toBe("₹1,00,00,000");
  });

  it("hides paise by default and shows them on request", () => {
    expect(formatMinor(30_050)).toBe("₹301");
    expect(formatMinor(30_050, "INR", { paise: true })).toBe("₹300.50");
  });

  it("renders negatives with a proper minus sign", () => {
    expect(formatMinor(-34_20_000_00)).toContain("−");
  });

  it("prefixes a plus only when the caller asks for a signed value", () => {
    expect(formatMinor(500_00, "INR", { signed: true })).toBe("+₹500");
    expect(formatMinor(500_00)).toBe("₹500");
  });

  it("does not sign zero", () => {
    expect(formatMinor(0, "INR", { signed: true })).toBe("₹0");
  });
});

describe("formatMoney", () => {
  it("renders the API's money shape", () => {
    expect(formatMoney({ amountMinor: 23_480_00, currency: "INR" })).toBe(
      "₹23,480",
    );
  });

  it("renders an em dash for absent money rather than ₹0", () => {
    // A missing budget and a zero budget are different facts, and the design
    // shows them differently. Collapsing null to ₹0 invents data.
    expect(formatMoney(null)).toBe("-");
    expect(formatMoney(undefined)).toBe("-");
    expect(formatMoney({ amountMinor: 0, currency: "INR" })).toBe("₹0");
  });
});

describe("formatCompact", () => {
  it("uses lakh and crore, as the number would be said aloud", () => {
    expect(formatCompact(34_20_000_00)).toBe("₹34.2L");
    expect(formatCompact(1_20_00_000_00)).toBe("₹1.2Cr");
    expect(formatCompact(5_000_00)).toBe("₹5K");
  });

  it("drops a trailing .0", () => {
    expect(formatCompact(5_00_000_00)).toBe("₹5L");
  });

  it("keeps the sign - design 2a shows net worth as ₹−34.2L", () => {
    expect(formatCompact(-34_20_000_00)).toBe("−₹34.2L");
  });

  it("leaves small amounts alone", () => {
    expect(formatCompact(300_00)).toBe("₹300");
  });
});

describe("parseAmountToMinor", () => {
  it("parses what people actually type", () => {
    expect(parseAmountToMinor("300")).toBe(30_000);
    expect(parseAmountToMinor("₹300")).toBe(30_000);
    expect(parseAmountToMinor("1,24,860")).toBe(1_24_860_00);
    expect(parseAmountToMinor(" 300.50 ")).toBe(30_050);
  });

  it("understands spoken magnitudes", () => {
    // Rejecting "2 lakh" would be the app being pedantic at the user's
    // expense - it is how the amount would be said out loud.
    expect(parseAmountToMinor("3 lakh")).toBe(3_00_000_00);
    expect(parseAmountToMinor("1.5cr")).toBe(1_50_00_000_00);
    expect(parseAmountToMinor("5k")).toBe(5_000_00);
    expect(parseAmountToMinor("2 LAC")).toBe(2_00_000_00);
  });

  it("does not lose a paisa to binary float", () => {
    // 0.1 * 100 is 10.000000000000002; truncating drops a paisa silently.
    expect(parseAmountToMinor("0.1")).toBe(10);
    expect(parseAmountToMinor("1234.56")).toBe(1_23_456);
  });

  it("returns null for unparseable input, never 0", () => {
    // 0 is a legitimate amount and must not be how failure is spelled.
    expect(parseAmountToMinor("")).toBeNull();
    expect(parseAmountToMinor("abc")).toBeNull();
    expect(parseAmountToMinor("12.3.4")).toBeNull();
    expect(parseAmountToMinor("300rs")).toBeNull();
    expect(parseAmountToMinor("0")).toBe(0);
  });

  it("round-trips through formatting", () => {
    const minor = parseAmountToMinor("1,24,860")!;
    expect(formatMinor(minor)).toBe("₹1,24,860");
  });
});

describe("percentOf", () => {
  it("computes a share", () => {
    expect(percentOf(64_210, 80_000)).toBeCloseTo(80.26, 1);
  });

  it("returns null instead of dividing by zero", () => {
    // A profile with no budget must render "-", not "Infinity%" or "NaN%".
    expect(percentOf(100, 0)).toBeNull();
  });
});
