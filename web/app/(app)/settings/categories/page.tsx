"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { useProfile } from "@/components/providers/profile-provider";
import { useCategories } from "@/lib/api/hooks";
import {
  useCategoryUsage,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from "@/lib/api/settings";
import { CategoryMark, Eyebrow } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/controls";
import { Pill } from "@/components/ui/feedback";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { ListSkeleton } from "@/components/ui/skeletons";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/client";
import type { Category } from "@/lib/api/types";

/** The tints the design uses for category marks (2f). */
const TINTS = [
  "#E7F0EA",
  "#F6E5E1",
  "#FBEEDA",
  "#E4ECF6",
  "#F0E7F6",
  "#E9F1DC",
  "#F6E9E4",
  "#DFEDEF",
];

export default function CategoriesPage() {
  const { activeId } = useProfile();
  const { data: categories = [], isPending } = useCategories(activeId);
  const [editing, setEditing] = useState<Category | null>(null);
  const [adding, setAdding] = useState(false);

  if (isPending) return <ListSkeleton rows={6} />;

  const mine = categories.filter((c) => c.profileId !== null);
  const system = categories.filter((c) => c.profileId === null);

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Settings
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl text-ink sm:text-[27px]">
            Categories
          </h1>
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden="true" />
            New category
          </Button>
        </div>
      </div>

      {mine.length > 0 && (
        <section className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
          <Eyebrow>Yours</Eyebrow>
          <ul className="mt-3 flex flex-col gap-3">
            {mine.map((category) => (
              <Row
                key={category.id}
                category={category}
                onEdit={() => setEditing(category)}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
        <Eyebrow>Built in</Eyebrow>
        <p className="mt-1 text-xs text-ink-faint">
          Shared by every profile. They can be renamed but not removed.
        </p>
        <ul className="mt-3 flex flex-col gap-3">
          {system.map((category) => (
            <Row
              key={category.id}
              category={category}
              onEdit={() => setEditing(category)}
            />
          ))}
        </ul>
      </section>

      <CategoryModal open={adding} onOpenChange={setAdding} />
      {editing && (
        <CategoryModal
          key={editing.id}
          open
          onOpenChange={(next) => !next && setEditing(null)}
          category={editing}
        />
      )}
    </div>
  );
}

function Row({
  category,
  onEdit,
}: {
  category: Category;
  onEdit: () => void;
}) {
  const { activeId } = useProfile();
  const remove = useDeleteCategory(activeId);
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);

  // Only fetched once the user is actually considering deletion - the count
  // exists to inform that decision, not to be prefetched for every row.
  const usage = useCategoryUsage(activeId, confirming ? category.id : null);
  const count = usage.data ?? 0;

  return (
    <li className="flex items-center gap-3">
      <CategoryMark monogram={category.monogram} tint={category.tint} />
      <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-sm text-ink">
        {category.name}
        {category.isIncome && <Pill tone="income">Income</Pill>}
      </span>

      <Button variant="ghost" size="sm" onClick={onEdit}>
        Edit
      </Button>

      {!category.isSystem && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="text-spend hover:bg-spend/10"
            onClick={() => setConfirming(true)}
          >
            Delete
          </Button>

          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title={`Delete ${category.name}?`}
            description={
              count > 0
                ? `${count} transaction${count === 1 ? "" : "s"} use this category. They are kept, but become uncategorised.`
                : "Nothing uses this category yet."
            }
            confirmLabel="Delete category"
            isLoading={remove.isPending}
            onConfirm={() => {
              void remove
                .mutateAsync(category.id)
                .then(() => {
                  toast({ title: `${category.name} deleted`, tone: "info" });
                  setConfirming(false);
                })
                .catch((error: unknown) =>
                  toast({
                    title: "Couldn't delete that",
                    description:
                      error instanceof ApiError
                        ? error.displayMessage
                        : undefined,
                    tone: "error",
                  }),
                );
            }}
          />
        </>
      )}
    </li>
  );
}

export function CategoryModal({
  open,
  onOpenChange,
  category,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category;
  onCreated?: (category: Category) => void;
}) {
  const { activeId } = useProfile();
  const create = useCreateCategory(activeId);
  const update = useUpdateCategory(activeId);
  const { toast } = useToast();

  const [name, setName] = useState(category?.name ?? "");
  const [monogram, setMonogram] = useState(category?.monogram ?? "");
  const [tint, setTint] = useState(category?.tint ?? TINTS[0]!);
  const [isIncome, setIsIncome] = useState(category?.isIncome ?? false);

  const editing = Boolean(category);

  // Derived from the name unless the user overrides it - two letters is a
  // detail nobody wants to think about for every category they add.
  const effectiveMonogram =
    monogram.trim() || name.trim().slice(0, 2).toUpperCase();

  async function submit() {
    try {
      if (category) {
        await update.mutateAsync({
          id: category.id,
          patch: {
            name: name.trim(),
            monogram: effectiveMonogram,
            tint,
          },
        });
        toast({ title: "Category updated", tone: "success" });
      } else {
        const created = await create.mutateAsync({
          name: name.trim(),
          monogram: effectiveMonogram,
          tint,
          isIncome,
        });
        toast({ title: `${name.trim()} added`, tone: "success" });
        onCreated?.(created);
      }
      onOpenChange(false);
    } catch (caught) {
      toast({
        title: "Couldn't save that category",
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
      title={editing ? `Edit ${category!.name}` : "New category"}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            isLoading={create.isPending || update.isPending}
            disabled={!name.trim()}
            onClick={() => void submit()}
          >
            {editing ? "Save changes" : "Create category"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-3">
          <CategoryMark
            monogram={effectiveMonogram || "??"}
            tint={tint}
            size="lg"
          />
          <Input
            label="Name"
            placeholder="Tuition"
            className="flex-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <Input
          label="Monogram"
          placeholder={name.trim().slice(0, 2).toUpperCase() || "TU"}
          maxLength={2}
          hint="Two letters. Taken from the name unless you set one."
          value={monogram}
          onChange={(e) => setMonogram(e.target.value.toUpperCase())}
        />

        <div>
          <Eyebrow>Tint</Eyebrow>
          <div className="mt-2 flex flex-wrap gap-2">
            {TINTS.map((option) => (
              <button
                key={option}
                type="button"
                aria-label={`Tint ${option}`}
                aria-pressed={tint === option}
                onClick={() => setTint(option)}
                style={{ backgroundColor: option }}
                className={
                  tint === option
                    ? "size-9 rounded-lg ring-2 ring-green ring-offset-2 ring-offset-[var(--paper)]"
                    : "size-9 rounded-lg border border-line"
                }
              />
            ))}
          </div>
        </div>

        {!editing && (
          <Toggle
            label="This is income"
            description="Salary, refunds, anything that adds to your balance"
            checked={isIncome}
            onCheckedChange={setIsIncome}
          />
        )}
      </div>
    </Modal>
  );
}
