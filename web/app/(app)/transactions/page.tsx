"use client";

import { useMemo, useState } from "react";
import { Download, Filter, Search, X } from "lucide-react";
import { useProfile } from "@/components/providers/profile-provider";
import { useCategories, useDashboard } from "@/lib/api/hooks";
import {
  downloadExport,
  useBulkDelete,
  useTransactions,
  type TransactionFilters,
} from "@/lib/api/transactions";
import { Amount, CategoryMark, Eyebrow } from "@/components/ui/display";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox, Segmented } from "@/components/ui/controls";
import { EmptyState, Pill, Skeleton } from "@/components/ui/feedback";
import { ConfirmDialog, Sheet } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { formatMinor } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { Facet, Transaction } from "@/lib/api/types";

/**
 * Transactions — design 2e (desktop) and 4g (mobile).
 *
 * Filters are a persistent sidebar on desktop and a sheet on mobile, which is
 * the design's split and the right one: a filter panel that eats half a phone
 * screen is a panel nobody opens.
 */
export default function TransactionsPage() {
  const { activeId } = useProfile();
  const { data: categories = [] } = useCategories(activeId);
  const { data: dashboard } = useDashboard(activeId);
  const { toast } = useToast();

  const [filters, setFilters] = useState<TransactionFilters>({});
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [filterSheet, setFilterSheet] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const query = useTransactions(activeId, filters);
  const bulkDelete = useBulkDelete(activeId);

  // Derived from query.data directly: `?? []` creates a new array identity on
  // every render, which would defeat the memo it feeds.
  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  const first = query.data?.pages[0];

  const toggleFilter = (key: "categoryIds" | "accountIds", id: string) => {
    setFilters((current) => {
      const list = current[key] ?? [];
      const next = list.includes(id)
        ? list.filter((v) => v !== id)
        : [...list, id];

      return { ...current, [key]: next.length > 0 ? next : undefined };
    });
    // Selection is by id, and a filter change can hide a selected row — a
    // bulk delete must never act on something no longer on screen.
    setSelected([]);
  };

  const activeFilterCount =
    (filters.categoryIds?.length ?? 0) +
    (filters.accountIds?.length ?? 0) +
    (filters.direction ? 1 : 0) +
    (filters.q ? 1 : 0);

  const FilterPanel = (
    <div className="flex flex-col gap-5">
      <div>
        <Eyebrow>Direction</Eyebrow>
        <Segmented
          aria-label="Direction"
          className="mt-2 w-full"
          value={filters.direction ?? "all"}
          onValueChange={(value) =>
            setFilters((c) => ({
              ...c,
              direction:
                value === "all" ? undefined : (value as "DEBIT" | "CREDIT"),
            }))
          }
          options={[
            { value: "all", label: "All" },
            { value: "DEBIT", label: "Spent" },
            { value: "CREDIT", label: "Received" },
          ]}
        />
      </div>

      <FacetGroup
        title="Categories"
        facets={first?.facets.categories ?? []}
        selected={filters.categoryIds ?? []}
        onToggle={(id) => toggleFilter("categoryIds", id)}
      />

      <FacetGroup
        title="Accounts"
        facets={first?.facets.accounts ?? []}
        selected={filters.accountIds ?? []}
        onToggle={(id) => toggleFilter("accountIds", id)}
      />

      {activeFilterCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setFilters({});
            setSearch("");
          }}
        >
          Clear all filters
        </Button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink sm:text-[27px]">
            Transactions
          </h1>
          {first && (
            <p className="mt-0.5 text-sm text-ink-muted">
              Showing {items.length} of {first.page.total} ·{" "}
              <span className="text-spend">
                {formatMinor(first.totals.spendMinor)} spent
              </span>
              {first.totals.incomeMinor > 0 && (
                <>
                  {" · "}
                  <span className="text-income">
                    {formatMinor(first.totals.incomeMinor)} in
                  </span>
                </>
              )}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setFilterSheet(true)}
            className="lg:hidden"
          >
            <Filter className="size-4" aria-hidden="true" />
            Filters
            {activeFilterCount > 0 && (
              <Pill tone="green">{activeFilterCount}</Pill>
            )}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (!activeId) return;
              void downloadExport(activeId, filters).catch(() =>
                toast({ title: "Export failed", tone: "error" }),
              );
            }}
          >
            <Download className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </div>

      {/* search */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setFilters((c) => ({ ...c, q: search.trim() || undefined }));
        }}
        className="flex items-center gap-2 rounded-[var(--radius-control)] border border-line bg-field px-3.5"
      >
        <Search className="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search merchant or note"
          aria-label="Search transactions"
          className="h-10 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
        />
        {search && (
          <IconButton
            aria-label="Clear search"
            size="sm"
            onClick={() => {
              setSearch("");
              setFilters((c) => ({ ...c, q: undefined }));
            }}
          >
            <X className="size-3.5" aria-hidden="true" />
          </IconButton>
        )}
      </form>

      <div className="flex gap-6">
        <aside className="hidden w-56 shrink-0 lg:block">{FilterPanel}</aside>

        <div className="min-w-0 flex-1">
          {selected.length > 0 && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-line bg-paper-raised px-4 py-2.5">
              <span className="text-sm text-ink">
                {selected.length} selected
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelected([])}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </Button>
              </div>
            </div>
          )}

          {query.isPending ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState title="Nothing matches">
              {activeFilterCount > 0
                ? "Try widening the filters."
                : "Say or type an expense and it will appear here."}
            </EmptyState>
          ) : (
            <>
              <ul className="overflow-hidden rounded-[var(--radius-card)] border border-line-strong bg-paper">
                {items.map((transaction) => (
                  <Row
                    key={transaction.id}
                    transaction={transaction}
                    selected={selected.includes(transaction.id)}
                    onToggle={() =>
                      setSelected((current) =>
                        current.includes(transaction.id)
                          ? current.filter((id) => id !== transaction.id)
                          : [...current, transaction.id],
                      )
                    }
                  />
                ))}
              </ul>

              {query.hasNextPage && (
                <div className="mt-3 flex justify-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void query.fetchNextPage()}
                    isLoading={query.isFetchingNextPage}
                  >
                    Load more
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Sheet
        open={filterSheet}
        onOpenChange={setFilterSheet}
        title="Filters"
        footer={
          <Button size="mobile" onClick={() => setFilterSheet(false)}>
            Show {first?.page.total ?? 0} results
          </Button>
        }
      >
        {FilterPanel}
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${selected.length} transaction${selected.length === 1 ? "" : "s"}?`}
        description="They leave your ledger and the month's totals change. This cannot be undone from here."
        confirmLabel={`Delete ${selected.length}`}
        isLoading={bulkDelete.isPending}
        onConfirm={() => {
          void bulkDelete.mutateAsync(selected).then(() => {
            setSelected([]);
            setConfirmDelete(false);
          });
        }}
      />

      {/* Categories are loaded for the row labels even when facets are empty. */}
      <span className="sr-only">{categories.length} categories loaded</span>
      <span className="sr-only">
        {dashboard?.accounts.length ?? 0} accounts loaded
      </span>
    </div>
  );
}

function FacetGroup({
  title,
  facets,
  selected,
  onToggle,
}: {
  title: string;
  facets: Facet[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (facets.length === 0) return null;

  return (
    <div>
      <Eyebrow>{title}</Eyebrow>
      <div className="mt-2 flex flex-col gap-2.5">
        {facets.slice(0, 8).map((facet) => (
          <Checkbox
            key={facet.id ?? facet.label}
            label={facet.label}
            // The count is why this is a checkbox list and not a chip row:
            // the filter says how much it will find before you apply it.
            count={facet.count}
            checked={facet.id ? selected.includes(facet.id) : false}
            onCheckedChange={() => facet.id && onToggle(facet.id)}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  transaction,
  selected,
  onToggle,
}: {
  transaction: Transaction;
  selected: boolean;
  onToggle: () => void;
}) {
  const title =
    transaction.merchant?.normalizedName ??
    transaction.category?.name ??
    transaction.note ??
    "Expense";

  return (
    <li
      className={cn(
        "flex items-center gap-3 border-b border-line-soft px-3 py-3 last:border-0 sm:px-4",
        selected && "bg-green-soft",
      )}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        label={<span className="sr-only">Select {title}</span>}
        className="shrink-0"
      />

      {transaction.category ? (
        <CategoryMark
          monogram={transaction.category.monogram}
          tint={transaction.category.tint}
        />
      ) : (
        <span className="size-[26px] shrink-0 rounded-lg bg-paper-raised" />
      )}

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-sm text-ink">
          {title}
          {transaction.recurringRule && <Pill tone="attention">Recurring</Pill>}
        </p>
        <p className="truncate text-xs text-ink-faint">
          {new Date(transaction.date).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          })}
          {transaction.category ? ` · ${transaction.category.name}` : ""}
          {transaction.account ? ` · ${transaction.account.name}` : ""}
        </p>
      </div>

      <Amount
        value={{
          amountMinor: transaction.amountMinor,
          currency: transaction.currency,
        }}
        direction={transaction.direction}
        size="sm"
      />
    </li>
  );
}
