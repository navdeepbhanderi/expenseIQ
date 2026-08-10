import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Button } from "./button";
import { AmountInput } from "./input";
import { AmountKeypad } from "./amount-keypad";
import { Checkbox, Chip, Segmented } from "./controls";
import { Amount, Delta } from "./display";
import { ConfidenceDots, Progress } from "./feedback";
import { Modal } from "./overlay";

describe("Button", () => {
  it("cannot be clicked while loading", async () => {
    // A second click on a saving button is a duplicate transaction, not a
    // faster save.
    const onClick = vi.fn();
    render(
      <Button isLoading onClick={onClick}>
        Save
      </Button>,
    );

    await userEvent.click(screen.getByRole("button")).catch(() => {});

    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
  });

  it("renders as its child when asChild, without a stray spinner node", () => {
    // Regression: Slot accepts exactly one element child, and the
    // `{isLoading && ...}` short-circuit counted as a second one — which
    // only surfaced as a prerender crash at build time, not in dev.
    render(
      <Button asChild>
        <a href="/signup">Start tracking free</a>
      </Button>,
    );

    const link = screen.getByRole("link", { name: "Start tracking free" });
    expect(link).toHaveAttribute("href", "/signup");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("AmountInput", () => {
  function Harness() {
    const [minor, setMinor] = useState<number | null>(null);
    return (
      <>
        <AmountInput valueMinor={minor} onValueChange={setMinor} />
        <output data-testid="minor">{String(minor)}</output>
      </>
    );
  }

  it("reports paise, not rupees", async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText("Amount"), "300");

    expect(screen.getByTestId("minor")).toHaveTextContent("30000");
  });

  it("survives a decimal point mid-typing", async () => {
    // The bug that motivates holding text rather than a number: a numeric
    // controlled value round-trips "10." to 10 and eats the point as you type.
    render(<Harness />);
    const input = screen.getByLabelText("Amount");

    await userEvent.type(input, "10.");
    expect(input).toHaveValue("10.");

    await userEvent.type(input, "5");
    expect(screen.getByTestId("minor")).toHaveTextContent("1050");
  });

  it("accepts spoken magnitudes and echoes what it understood", async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText("Amount"), "3 lakh");

    expect(screen.getByTestId("minor")).toHaveTextContent("30000000");
    // The hint confirms the interpretation before the user commits to it.
    expect(screen.getByText("₹3,00,000")).toBeInTheDocument();
  });

  it("flags unparseable input only after blur", async () => {
    // Complaining mid-keystroke means "3" is an error on the way to "300".
    render(<Harness />);
    const input = screen.getByLabelText("Amount");

    await userEvent.type(input, "abc");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await userEvent.tab();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

describe("AmountKeypad", () => {
  function Harness() {
    const [minor, setMinor] = useState(0);
    return (
      <>
        <AmountKeypad valueMinor={minor} onChange={setMinor} />
        <output data-testid="minor">{String(minor)}</output>
      </>
    );
  }

  it("accumulates digits as paise, like a card terminal", async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole("button", { name: "3" }));
    await userEvent.click(screen.getByRole("button", { name: "0" }));
    await userEvent.click(screen.getByRole("button", { name: "0" }));

    // 3, 0, 0 makes ₹3.00 — there is no decimal point to mis-place.
    expect(screen.getByTestId("minor")).toHaveTextContent("300");
    expect(screen.getByText("₹3.00")).toBeInTheDocument();
  });

  it("deletes the last digit", async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole("button", { name: "1" }));
    await userEvent.click(screen.getByRole("button", { name: "2" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Delete last digit" }),
    );

    expect(screen.getByTestId("minor")).toHaveTextContent("1");
  });

  it("refuses to build a number past the display's limit", async () => {
    const onChange = vi.fn();
    render(<AmountKeypad valueMinor={99_99_99_999_99} onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: "9" }));

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Amount", () => {
  it("colours by direction and nothing else", () => {
    const { rerender } = render(
      <Amount
        value={{ amountMinor: 300_00, currency: "INR" }}
        direction="DEBIT"
      />,
    );
    expect(screen.getByText("₹300")).toHaveClass("text-spend");

    rerender(
      <Amount
        value={{ amountMinor: 300_00, currency: "INR" }}
        direction="CREDIT"
      />,
    );
    expect(screen.getByText("₹300")).toHaveClass("text-income");

    // A balance is neither a debit nor a credit; red/green would be decoration.
    rerender(<Amount value={{ amountMinor: 300_00, currency: "INR" }} />);
    expect(screen.getByText("₹300")).toHaveClass("text-ink");
  });
});

describe("Delta", () => {
  it("treats falling spend as good", () => {
    // Wiring green to "up" out of habit would congratulate overspending.
    render(
      <Delta
        periodLabel="July"
        comparison={{
          current: { amountMinor: 100, currency: "INR" },
          previous: { amountMinor: 200, currency: "INR" },
          delta: { amountMinor: -100, currency: "INR" },
          deltaPercent: -8,
          direction: "down",
        }}
      />,
    );

    expect(screen.getByText(/8% vs July/)).toHaveClass("text-income");
  });

  it("says so plainly when there is nothing to compare", () => {
    render(
      <Delta
        comparison={{
          current: { amountMinor: 100, currency: "INR" },
          previous: { amountMinor: 0, currency: "INR" },
          delta: { amountMinor: 100, currency: "INR" },
          deltaPercent: null,
          direction: "flat",
        }}
      />,
    );

    expect(screen.getByText(/No change/)).toBeInTheDocument();
  });
});

describe("Progress", () => {
  it("escalates colour with the value, because the colour is the warning", () => {
    const { container, rerender } = render(<Progress value={40} />);
    expect(container.querySelector(".bg-green")).toBeTruthy();

    rerender(<Progress value={91} />);
    expect(container.querySelector(".bg-attention")).toBeTruthy();

    rerender(<Progress value={120} />);
    expect(container.querySelector(".bg-spend")).toBeTruthy();
  });
});

describe("ConfidenceDots", () => {
  it("names the band in words, not a decimal", () => {
    // "0.82" is false precision on a model's self-report.
    render(<ConfidenceDots band="FAIRLY_SURE" />);
    expect(screen.getByText("Fairly sure")).toBeInTheDocument();
    expect(screen.queryByText(/0\./)).not.toBeInTheDocument();
  });
});

describe("Checkbox", () => {
  it("shows the facet count so the filter says what it will find", async () => {
    const onChange = vi.fn();
    render(
      <Checkbox
        label="Groceries"
        count={18}
        checked={false}
        onCheckedChange={onChange}
      />,
    );

    expect(screen.getByText("18")).toBeInTheDocument();

    // The label is wired to the control, so clicking the text toggles it.
    await userEvent.click(screen.getByText("Groceries"));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("Segmented", () => {
  it("exposes itself as a radiogroup", async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        aria-label="Period"
        value="month"
        onValueChange={onChange}
        options={[
          { value: "month", label: "Month" },
          { value: "year", label: "Year" },
        ]}
      />,
    );

    expect(screen.getByRole("radiogroup", { name: "Period" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Month" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await userEvent.click(screen.getByRole("radio", { name: "Year" }));
    expect(onChange).toHaveBeenCalledWith("year");
  });
});

describe("Chip", () => {
  it("is a button only when it does something", () => {
    const { rerender } = render(<Chip>₹300</Chip>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    rerender(<Chip onClick={() => {}}>₹300</Chip>);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});

describe("Modal", () => {
  it("is a dialog with an accessible name, and Escape closes it", async () => {
    const onOpenChange = vi.fn();
    render(
      <Modal open onOpenChange={onOpenChange} title="Add account">
        <p>Body</p>
      </Modal>,
    );

    expect(screen.getByRole("dialog", { name: "Add account" })).toBeTruthy();

    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the title for screen readers when hidden visually", () => {
    render(
      <Modal open onOpenChange={() => {}} title="Confirm expense" hideTitle>
        <p>Body</p>
      </Modal>,
    );

    // Still named, just not shown — a dialog without a name is unnavigable.
    expect(screen.getByRole("dialog", { name: "Confirm expense" })).toBeTruthy();
  });
});
