import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Logo, LogoMark } from "./logo";

describe("LogoMark", () => {
  it("derives every dimension from size, so 16px and 104px are one mark", () => {
    const { container, rerender } = render(<LogoMark size={104} />);
    const big = container.firstElementChild as HTMLElement;

    // 25% radius, 21% horizontal padding - the ratios the design's two
    // specimens agree on.
    expect(big.style.borderRadius).toBe("26px");
    expect(big.style.padding).toBe("0px 21.84px");

    rerender(<LogoMark size={16} />);
    const small = container.firstElementChild as HTMLElement;
    expect(small.style.borderRadius).toBe("4px");
  });

  it("never lets a rule round away to nothing at favicon size", () => {
    // 9% of 16px is 1.44 - without the floor this rounds to 1 and at smaller
    // sizes to 0, and the mark disappears exactly where it must still read.
    const { container } = render(<LogoMark size={12} />);
    const rules = container.querySelectorAll("span > span");

    for (const rule of rules) {
      const height = Number.parseFloat((rule as HTMLElement).style.height);
      expect(height).toBeGreaterThanOrEqual(1);
    }
  });

  it("keeps the third rule short and marigold - the waiting entry", () => {
    // This is the design's whole idea in one glyph, so it is worth pinning.
    const { container } = render(<LogoMark size={104} />);
    const rules = Array.from(container.querySelectorAll("span > span"));

    expect(rules).toHaveLength(3);
    expect((rules[2] as HTMLElement).style.width).toBe("58%");
    expect((rules[2] as HTMLElement).style.background).toContain("227, 155, 46");
  });

  it("survives a one-colour knockout", () => {
    // The design requires the mark to work in a single ink.
    const { container } = render(<LogoMark size={32} variant="mono" />);
    const rules = Array.from(container.querySelectorAll("span > span"));
    const colours = new Set(rules.map((r) => (r as HTMLElement).style.background));

    expect(colours.size).toBe(1);
  });

  it("is hidden from assistive tech - the wordmark does the naming", () => {
    const { container } = render(<LogoMark size={32} />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});

describe("Logo", () => {
  it("announces the name exactly once", () => {
    // The wordmark is real text; an extra sr-only label would make a screen
    // reader say "ExpenseIQ ExpenseIQ".
    render(<Logo size={30} />);
    expect(screen.getAllByText(/Expense/)).toHaveLength(1);
  });

  it("carries the tagline only when asked", () => {
    const { rerender } = render(<Logo size={30} />);
    expect(screen.queryByText(/your money, in your words/)).toBeNull();

    rerender(<Logo size={30} tagline />);
    expect(screen.getByText(/your money, in your words/)).toBeInTheDocument();
  });
});
