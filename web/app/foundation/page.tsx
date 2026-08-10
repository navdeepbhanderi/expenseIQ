"use client";

import { useQuery } from "@tanstack/react-query";
import { AppProviders } from "@/components/providers/app-providers";
import { api, API_BASE } from "@/lib/api/client";
import { formatCompact, formatMinor } from "@/lib/money";
import { useTheme } from "@/lib/theme";

interface Health {
  status: string;
  uptimeSeconds: number;
}

/**
 * Phase 0 smoke test.
 *
 * Exists to prove the foundation end to end — tokens, both themes, all four
 * fonts, money formatting and a real typed call to the running API — before
 * any product screen depends on them. Replaced by nothing; it stays as the
 * place to check the plumbing when something looks off.
 */
export default function FoundationPage() {
  return (
    <AppProviders>
      <Foundation />
    </AppProviders>
  );
}

function Foundation() {
  const { theme, toggle } = useTheme();

  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => api.get<Health>("/health"),
  });

  return (
    <main className="min-h-dvh bg-canvas px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
              ExpenseIQ · Phase 0
            </p>
            <h1 className="mt-2 font-display text-4xl font-medium text-ink">
              Foundation
            </h1>
          </div>
          <button
            onClick={toggle}
            className="rounded-[var(--radius-control)] border border-line bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper-raised"
          >
            {theme === "dark" ? "Switch to light" : "Switch to dark"}
          </button>
        </header>

        {/* API — a real typed call against the running backend */}
        <section className="rounded-[var(--radius-card)] border border-line bg-paper p-5">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
            API
          </h2>
          <p className="mt-1 text-xs text-ink-faint">{API_BASE}</p>
          <div className="mt-3 text-sm text-ink">
            {health.isPending && <span className="text-ink-muted">Checking…</span>}
            {health.isError && (
              <span className="text-spend">
                Unreachable — is the server running?
              </span>
            )}
            {health.data && (
              <span className="text-income">
                {health.data.status} · up {health.data.uptimeSeconds}s
              </span>
            )}
          </div>
        </section>

        {/* Type — all four families the design specifies */}
        <section className="rounded-[var(--radius-card)] border border-line bg-paper p-5">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
            Type
          </h2>
          <p className="mt-3 font-display text-4xl font-medium text-ink">
            Newsreader ₹64,210
          </p>
          <p className="mt-2 text-base text-ink">
            IBM Plex Sans — the interface voice
          </p>
          <p className="mt-2 font-mono text-sm text-ink-muted">
            IBM Plex Mono · 1,24,860.00
          </p>
          <p className="mt-2 text-base text-ink">
            किराने पर ₹300 खर्च किए · આજે પેટ્રોલ ૧૨૦૦
          </p>
        </section>

        {/* Money — the formatter every screen depends on */}
        <section className="rounded-[var(--radius-card)] border border-line bg-paper p-5">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
            Money
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            {[
              ["Indian grouping", formatMinor(1_24_860_00)],
              ["With paise", formatMinor(30_050, "INR", { paise: true })],
              ["Compact", formatCompact(34_20_000_00)],
              ["Negative net worth", formatCompact(-34_20_000_00)],
              ["Signed", formatMinor(1_42_000_00, "INR", { signed: true })],
              ["Crore", formatCompact(1_20_00_000_00)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-ink-faint">{label}</dt>
                <dd className="tabular mt-0.5 font-mono text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Palette — semantic names only; no component hardcodes a hex */}
        <section className="rounded-[var(--radius-card)] border border-line bg-paper p-5">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
            Palette
          </h2>
          <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
            {[
              ["paper", "bg-paper"],
              ["raised", "bg-paper-raised"],
              ["green", "bg-green"],
              ["attention", "bg-attention"],
              ["spend", "bg-spend"],
              ["income", "bg-income"],
            ].map(([name, cls]) => (
              <div key={name}>
                <div
                  className={`h-11 rounded-lg border border-line ${cls}`}
                />
                <p className="mt-1.5 font-mono text-[10px] text-ink-muted">
                  {name}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-ink-muted">
            Marigold is reserved for &ldquo;needs your eye&rdquo; only — the
            review queue and dues. It must never compete with spend red.
          </p>
        </section>
      </div>
    </main>
  );
}
