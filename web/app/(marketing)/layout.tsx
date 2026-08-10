import Link from "next/link";
import { SiteHeader } from "@/components/marketing/site-header";
import { Logo } from "@/components/brand/logo";

/**
 * Marketing shell.
 *
 * Deliberately without AppProviders: no query cache, no auth bootstrap. A
 * visitor who has never signed in should not trigger a token refresh or pull
 * the app bundle to read a landing page.
 */
export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>

      <footer className="border-t border-line-soft bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <div>
              <Logo size={30} tagline />
              <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-ink-muted">
                Expense tracking that starts from the sentence you would have
                said out loud anyway.
              </p>
            </div>

            <nav className="grid grid-cols-2 gap-x-10 gap-y-4 text-[13px] sm:grid-cols-4">
              {[
                ["Product", [["Features", "#features"], ["How it works", "#how"], ["Pricing", "#pricing"]]],
                ["Company", [["Security", "#security"], ["Families", "#families"]]],
                ["Account", [["Log in", "/login"], ["Start free", "/signup"]]],
                ["Legal", [["Terms & privacy", "/terms"]]],
              ].map(([heading, links]) => (
                <div key={heading as string}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                    {heading as string}
                  </p>
                  <ul className="mt-2.5 flex flex-col gap-1.5">
                    {(links as string[][]).map(([label, href]) => (
                      <li key={label}>
                        <Link
                          href={href!}
                          className="text-ink-muted transition-colors hover:text-ink"
                        >
                          {label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>

          <div className="mt-10 flex flex-col gap-2 border-t border-line-soft pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[11px] text-ink-faint">
              Made in India · ₹ in lakhs where it matters
            </p>
            <p className="text-[11px] text-ink-faint">
              © {new Date().getFullYear()} ExpenseIQ
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
