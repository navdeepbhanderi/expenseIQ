import Link from "next/link";
import { SiteHeader } from "@/components/marketing/site-header";

/**
 * Marketing shell.
 *
 * Deliberately without AppProviders: no query cache, no auth bootstrap. A
 * visitor who has never signed in should not trigger a token refresh or pull
 * the app bundle to read a landing page.
 */
export default function MarketingLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>

      <footer className="border-t border-line-soft bg-paper">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-green font-display text-sm font-semibold text-paper">
                E
              </span>
              <span className="font-display text-base font-medium text-ink">
                ExpenseIQ
              </span>
            </div>
            <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-ink-muted">
              Expense tracking that starts from the sentence you would have said
              out loud anyway.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
            <Link href="#features" className="text-ink-muted hover:text-ink">
              Features
            </Link>
            <Link href="#how" className="text-ink-muted hover:text-ink">
              How it works
            </Link>
            <Link href="/login" className="text-ink-muted hover:text-ink">
              Log in
            </Link>
            <Link href="/signup" className="text-ink-muted hover:text-ink">
              Get started
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
