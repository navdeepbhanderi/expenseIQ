"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { AmountInput } from "@/components/ui/input";
import { Eyebrow } from "@/components/ui/display";
import { CategoryMark } from "@/components/ui/display";
import { useToast } from "@/components/ui/toast";
import { useProfile } from "@/components/providers/profile-provider";
import { useCategories } from "@/lib/api/hooks";
import { useSetSpendLimits, type SpendLimitOverview } from "@/lib/api/family";
import { ApiError } from "@/lib/api/client";

/**
 * Chooses the monthly limits - the half of the feature that was missing.
 *
 * The Family page has shown limits since it was built, but nothing anywhere
 * could set one, so the section was hidden behind `limits.data?.overall` and
 * never appeared for anybody.
 *
 * Owner-only, matching the server's `spendLimit:set`. The button is not
 * rendered for anyone else rather than shown and rejected - an affordance that
 * always fails is worse than no affordance.
 */
export function SpendLimitsModal({
  open,
  onOpenChange,
  current,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current?: SpendLimitOverview;
}) {
  const { activeId } = useProfile();
  const { data: categories = [] } = useCategories(activeId);
  const save = useSetSpendLimits(activeId);
  const { toast } = useToast();

  const [overall, setOverall] = useState<number | null>(
    current?.overall?.status.budget.amountMinor ?? null,
  );

  // Seeded from whatever is already set, keyed by category.
  const [perCategory, setPerCategory] = useState<Record<string, number | null>>(
    () =>
      Object.fromEntries(
        (current?.categories ?? [])
          .filter((line) => line.categoryId !== null)
          .map((line) => [
            line.categoryId as string,
            line.status.budget.amountMinor,
          ]),
      ),
  );

  // Spending categories only - a limit on income means nothing.
  const spendCategories = categories.filter((c) => !c.isIncome);

  async function submit() {
    try {
      await save.mutateAsync({
        // Zero is how the API removes a limit, so clearing the field has to
        // send 0 rather than omitting the key.
        overallMinor: overall ?? 0,
        categories: spendCategories.map((c) => ({
          categoryId: c.id,
          amountMinor: perCategory[c.id] ?? 0,
        })),
      });

      toast({ title: "Limits saved", tone: "success" });
      onOpenChange(false);
    } catch (caught) {
      toast({
        title: "Couldn't save those limits",
        description:
          caught instanceof ApiError ? caught.displayMessage : undefined,
        tone: "error",
      });
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Monthly spend limits"
      description="A nudge, never a block - going over is recorded and flagged, never refused."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button isLoading={save.isPending} onClick={() => void submit()}>
            Save limits
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <AmountInput
          label="Everything, per month"
          valueMinor={overall}
          onValueChange={setOverall}
          hint="Leave it empty for no overall limit"
        />

        <div>
          <Eyebrow>Per category</Eyebrow>
          <p className="mt-1 text-[13px] text-ink-muted">
            Optional. Empty means no limit on that category.
          </p>

          <div className="mt-3 flex flex-col gap-3">
            {spendCategories.map((category) => (
              <div key={category.id} className="flex items-center gap-3">
                <CategoryMark
                  monogram={category.monogram}
                  tint={category.tint}
                  size="sm"
                />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {category.name}
                </span>
                <AmountInput
                  className="w-36"
                  aria-label={`${category.name} limit`}
                  valueMinor={perCategory[category.id] ?? null}
                  onValueChange={(value) =>
                    setPerCategory((prev) => ({
                      ...prev,
                      [category.id]: value,
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
