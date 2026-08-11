"use client";

import { useState } from "react";
import { Plus, Mic } from "lucide-react";
import { Button, IconButton, SplitButton } from "@/components/ui/button";
import {
  AmountInput,
  Input,
  PasswordInput,
  Textarea,
} from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Checkbox,
  Chip,
  RadioCards,
  Segmented,
  Slider,
  Toggle,
} from "@/components/ui/controls";
import {
  Banner,
  ConfidenceDots,
  EmptyState,
  Pill,
  Progress,
  Skeleton,
  Tooltip,
  TooltipProvider,
} from "@/components/ui/feedback";
import {
  Amount,
  Avatar,
  Card,
  CategoryMark,
  Delta,
  Eyebrow,
  Legend,
  StatCard,
} from "@/components/ui/display";
import {
  ConfirmDialog,
  Modal,
  Sheet,
  SidePanel,
} from "@/components/ui/overlay";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { DateField } from "@/components/ui/date-field";
import { AmountKeypad } from "@/components/ui/amount-keypad";
import { useTheme } from "@/lib/theme";
import { toLocalISODate } from "@/lib/today";

/**
 * Every primitive from design 6a–6i on one page, in both themes.
 *
 * This is the visual diff surface: open the design file at the matching
 * anchor and compare. It also catches the failure the component library is
 * most prone to - a component that looks right in light and breaks in dark,
 * which no product screen would reveal until much later.
 */
export default function KitchenSinkPage() {
  return (
    <TooltipProvider>
      <ToastProvider>
        <KitchenSink />
      </ToastProvider>
    </TooltipProvider>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2.5">
        <span className="rounded bg-green px-1.5 py-0.5 font-mono text-[11px] font-semibold text-paper">
          {id}
        </span>
        <h2 className="font-display text-xl font-medium text-ink">{title}</h2>
      </div>
      <Card className="flex flex-col gap-5 p-5">{children}</Card>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Eyebrow>{label}</Eyebrow>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function KitchenSink() {
  const { theme, toggle } = useTheme();
  const { toast, undoToast } = useToast();

  const [modal, setModal] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [panel, setPanel] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const [amount, setAmount] = useState<number | null>(30_000);
  const [keypad, setKeypad] = useState(30_000);
  const [date, setDate] = useState(() => toLocalISODate(new Date()));
  const [account, setAccount] = useState("sbi");
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("month");
  const [limit, setLimit] = useState(25_000_00);
  const [autoDebit, setAutoDebit] = useState(true);
  const [checked, setChecked] = useState(["groceries"]);
  const [chips, setChips] = useState<string[]>(["groceries"]);

  const toggleIn = (list: string[], value: string) =>
    list.includes(value)
      ? list.filter((v) => v !== value)
      : [...list, value];

  return (
    <main className="min-h-dvh bg-canvas px-4 py-8 sm:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Eyebrow>ExpenseIQ · Phase 1</Eyebrow>
            <h1 className="mt-2 font-display text-4xl font-medium text-ink">
              Component library
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Design 6a–6i. Toggle the theme to check Night Ledger.
            </p>
          </div>
          <Button variant="secondary" onClick={toggle}>
            {theme === "dark" ? "Light" : "Dark"}
          </Button>
        </header>

        <Section id="6a" title="Buttons & actions">
          <Row label="Variants">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="tinted">Tinted</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="attention">Confirm</Button>
            <Button variant="destructive">Delete</Button>
            <Button variant="link">Link</Button>
          </Row>
          <Row label="States">
            <Button isLoading>Saving</Button>
            <Button disabled>Disabled</Button>
            <Button variant="secondary" disabled>
              Disabled
            </Button>
          </Row>
          <Row label="Icon & split">
            <Button>
              <Plus className="size-4" aria-hidden="true" />
              Add expense
            </Button>
            <IconButton aria-label="Start voice entry" variant="primary">
              <Mic className="size-4" aria-hidden="true" />
            </IconButton>
            <SplitButton menuLabel="More confirm options">Confirm</SplitButton>
          </Row>
          <Row label="Mobile · 58px">
            <div className="w-full max-w-xs space-y-2">
              <Button size="mobile">Looks right</Button>
              <Button size="mobile" variant="secondary">
                Edit
              </Button>
            </div>
          </Row>
        </Section>

        <Section id="6b" title="Text, amount & specialised inputs">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Merchant" placeholder="Swiggy" />
            <Input
              label="Note"
              placeholder="Optional"
              hint="Shown on the transaction row"
            />
            <AmountInput valueMinor={amount} onValueChange={setAmount} />
            <PasswordInput placeholder="••••••••" />
            <Input
              label="Last 4 digits"
              placeholder="8842"
              inputMode="numeric"
              maxLength={4}
            />
            <Input
              label="Email"
              defaultValue="not-an-email"
              error="Enter a valid email address"
            />
          </div>
          <Textarea label="Description" placeholder="Anything worth noting" />
        </Section>

        <Section id="6c" title="Selection controls">
          <div className="grid gap-5 sm:grid-cols-2">
            <Select
              label="Category"
              value="groceries"
              options={[
                { value: "groceries", label: "Groceries" },
                { value: "eating-out", label: "Eating out" },
                { value: "fuel", label: "Fuel" },
                { value: "utilities", label: "Utilities" },
              ]}
            />
            <Select
              label="Account"
              placeholder="Choose an account"
              options={[
                { value: "sbi", label: "SBI Savings", meta: "₹3,84,200" },
                { value: "hdfc", label: "HDFC Millennia", meta: "₹23,480" },
                { value: "cash", label: "Cash", meta: "₹2,400" },
              ]}
            />
          </div>

          <Row label="Radio cards · account">
            <RadioCards
              aria-label="Pay from"
              value={account}
              onValueChange={setAccount}
              className="w-full max-w-sm"
              options={[
                {
                  value: "sbi",
                  label: "SBI Savings",
                  description: "Bank · ****4410",
                  meta: "₹3,84,200",
                },
                {
                  value: "hdfc",
                  label: "HDFC Millennia",
                  description: "Credit card · ****8842",
                  meta: "₹23,480",
                },
              ]}
            />
          </Row>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2.5">
              <Eyebrow>Checkbox · filter list</Eyebrow>
              {[
                ["groceries", "Groceries", 18],
                ["eating-out", "Eating out", 12],
                ["fuel", "Fuel", 6],
              ].map(([value, label, count]) => (
                <Checkbox
                  key={value as string}
                  label={label as string}
                  count={count as number}
                  checked={checked.includes(value as string)}
                  onCheckedChange={() =>
                    setChecked((c) => toggleIn(c, value as string))
                  }
                />
              ))}
            </div>

            <div className="flex flex-col gap-4">
              <Toggle
                label="Auto-debit"
                description="Paid automatically on the due date"
                checked={autoDebit}
                onCheckedChange={setAutoDebit}
              />
              <div className="flex flex-col gap-2">
                <Eyebrow>Segmented</Eyebrow>
                <Segmented
                  aria-label="Period"
                  value={period}
                  onValueChange={setPeriod}
                  options={[
                    { value: "month", label: "This month" },
                    { value: "quarter", label: "Quarter" },
                    { value: "year", label: "Year" },
                  ]}
                />
              </div>
            </div>
          </div>

          <Row label="Chips · multi-select">
            {["Groceries", "Eating out", "Fuel", "Travel"].map((label) => {
              const value = label.toLowerCase().replace(" ", "-");
              return (
                <Chip
                  key={value}
                  selected={chips.includes(value)}
                  onClick={() => setChips((c) => toggleIn(c, value))}
                >
                  {label}
                </Chip>
              );
            })}
            <Chip tone="mono">₹300</Chip>
            <Chip tone="attention">Account? →</Chip>
          </Row>

          <Slider
            label="Monthly limit"
            valueMinor={limit}
            onValueChange={setLimit}
            maxMinor={1_00_000_00}
          />
        </Section>

        <Section id="6d" title="Date, profile & account pickers">
          <div className="grid gap-5 sm:grid-cols-2">
            <DateField label="Date" value={date} onChange={setDate} />
            <div className="flex flex-col gap-3">
              <Eyebrow>Profile chips & avatars</Eyebrow>
              <div className="flex items-center gap-3">
                <Avatar initials="AS" color="#1F6F5C" />
                <Avatar initials="MS" color="#B5442F" />
                <Avatar initials="RS" color="#E39B2E" size="sm" />
                <div className="flex items-center gap-2 rounded-full border border-line bg-paper py-1 pl-1 pr-3">
                  <Avatar initials="AS" color="#1F6F5C" size="sm" />
                  <span className="text-sm text-ink">Aarav · Personal</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CategoryMark monogram="GR" tint="#E7F0EA" />
                <CategoryMark monogram="EA" tint="#F6E5E1" />
                <CategoryMark monogram="EM" tint="#FBEEDA" />
                <CategoryMark monogram="TR" tint="#E4ECF6" size="lg" />
              </div>
            </div>
          </div>
        </Section>

        <Section id="6e" title="Feedback, status & progress">
          <div className="flex flex-col gap-2.5">
            <Banner tone="attention" title="3 entries waiting">
              Confirm them to add ₹4,180 to August.
            </Banner>
            <Banner tone="success">Added ₹300 to Groceries.</Banner>
            <Banner tone="error" title="Could not save">
              The server rejected the amount. Try again.
            </Banner>
          </div>

          <Row label="Status pills">
            <Pill>Manual</Pill>
            <Pill tone="green">Confirmed</Pill>
            <Pill tone="attention">Recurring</Pill>
            <Pill tone="attention">Auto-debit</Pill>
            <Pill tone="spend">Over budget</Pill>
            <Pill tone="income">Income</Pill>
          </Row>

          <Row label="Confidence">
            <ConfidenceDots band="CLEAR" />
            <ConfidenceDots band="FAIRLY_SURE" />
            <ConfidenceDots band="NEEDS_FIELD" />
          </Row>

          <div className="flex flex-col gap-3">
            <Eyebrow>Progress</Eyebrow>
            <Progress value={42} label="42% of budget" />
            <Progress value={91} label="91% of budget" />
            <Progress value={104} label="Over budget" />
          </div>

          <Row label="Toast & tooltip">
            <Button
              variant="secondary"
              onClick={() =>
                toast({ title: "Saved", description: "Transaction updated." })
              }
            >
              Show toast
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                undoToast("Added ₹300 to Groceries", () =>
                  toast({ title: "Reverted", tone: "info" }),
                )
              }
            >
              Undo toast (10s)
            </Button>
            <Tooltip content="Assets minus what you owe, including card and loan balances.">
              <span className="cursor-help border-b border-dotted border-ink-faint text-sm text-ink-muted">
                What is net worth?
              </span>
            </Tooltip>
          </Row>

          <div className="flex flex-col gap-2">
            <Eyebrow>Skeleton</Eyebrow>
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </Section>

        <Section id="6f" title="Navigation & data display">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Spent in August"
              value={
                <Amount
                  value={{ amountMinor: 64_210_00, currency: "INR" }}
                  size="lg"
                />
              }
              detail="of ₹80,000 budget · 18 days left"
            />
            <StatCard
              label="Net worth"
              value={
                <Amount
                  value={{ amountMinor: -34_20_000_00, currency: "INR" }}
                  compact
                  size="lg"
                />
              }
              detail="Assets minus liabilities"
            />
            <StatCard
              tone="attention"
              label="Needs your eye"
              value="3 entries"
              detail="Waiting to be confirmed"
            />
          </div>

          <Row label="Amounts & delta">
            <Amount
              value={{ amountMinor: 18_420_00, currency: "INR" }}
              direction="DEBIT"
            />
            <Amount
              value={{ amountMinor: 1_42_000_00, currency: "INR" }}
              direction="CREDIT"
            />
            <Amount
              value={{ amountMinor: 3_84_200_00, currency: "INR" }}
            />
            <Delta
              periodLabel="July"
              comparison={{
                current: { amountMinor: 64_210_00, currency: "INR" },
                previous: { amountMinor: 69_800_00, currency: "INR" },
                delta: { amountMinor: -5_590_00, currency: "INR" },
                deltaPercent: -8,
                direction: "down",
              }}
            />
          </Row>

          <Legend
            items={[
              { label: "Groceries", color: "#1F6F5C", value: "₹18,420" },
              { label: "EMI & loans", color: "#2F8570", value: "₹15,600" },
              { label: "Eating out", color: "#5AA391", value: "₹9,180" },
            ]}
          />
        </Section>

        <Section id="6g" title="Overlays & forms">
          <Row label="Triggers">
            <Button variant="secondary" onClick={() => setModal(true)}>
              Modal
            </Button>
            <Button variant="secondary" onClick={() => setPanel(true)}>
              Side panel
            </Button>
            <Button variant="secondary" onClick={() => setSheet(true)}>
              Bottom sheet
            </Button>
            <Button variant="destructive" onClick={() => setConfirm(true)}>
              Destructive confirm
            </Button>
          </Row>
          <EmptyState
            title="No transactions yet"
            action={<Button size="sm">Add your first</Button>}
          >
            Say &ldquo;300 रुपये किराने पे खर्च किए&rdquo; and it lands here.
          </EmptyState>
        </Section>

        <Section id="6i" title="Mobile picker sheet & amount keypad">
          <div className="max-w-xs">
            <AmountKeypad valueMinor={keypad} onChange={setKeypad} />
          </div>
        </Section>
      </div>

      <Modal
        open={modal}
        onOpenChange={setModal}
        title="Add account"
        description="Cards and loans unlock due dates and EMI tracking."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(false)}>
              Cancel
            </Button>
            <Button onClick={() => setModal(false)}>Add account</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Name" placeholder="HDFC Millennia" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Issuer" placeholder="HDFC" />
            <Input label="Last 4 digits" placeholder="8842" maxLength={4} />
          </div>
        </div>
      </Modal>

      <SidePanel
        open={panel}
        onOpenChange={setPanel}
        title="Swiggy"
        description="5 August · Eating out"
      >
        <div className="flex flex-col gap-4">
          <Amount
            value={{ amountMinor: 482_00, currency: "INR" }}
            direction="DEBIT"
            size="lg"
          />
          <Input label="Note" defaultValue="Dinner" />
        </div>
      </SidePanel>

      <Sheet
        open={sheet}
        onOpenChange={setSheet}
        title="Confirm expense"
        footer={
          <>
            <Button size="mobile" onClick={() => setSheet(false)}>
              Looks right
            </Button>
            <Button
              size="mobile"
              variant="secondary"
              onClick={() => setSheet(false)}
            >
              Edit
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          <Chip tone="mono">₹300</Chip>
          <Chip>Groceries</Chip>
          <Chip>Today</Chip>
          <Chip tone="attention">Account? →</Chip>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete 3 transactions?"
        description="This removes them from August. You can undo for 10 seconds."
        confirmLabel="Delete 3 transactions"
        onConfirm={() => setConfirm(false)}
      />
    </main>
  );
}
