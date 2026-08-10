import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & privacy",
  description:
    "How ExpenseIQ handles your data, and what you agree to by using it.",
};

/*
 * Signup asks the user to agree to this, so it cannot 404.
 *
 * Written plainly and kept short on purpose: a page nobody reads because it
 * is ten screens of boilerplate is not meaningful consent. It states what the
 * product actually does today — not what a template says a fintech does.
 */
export default function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl px-5 py-14 sm:px-8 sm:py-20">
      <h1 className="font-display text-[34px] font-normal leading-tight text-ink sm:text-[42px]">
        Terms &amp; privacy
      </h1>
      <p className="mt-3 text-sm text-ink-faint">
        Plain English. Last updated when this page was written.
      </p>

      <div className="mt-10 flex flex-col gap-8">
        {[
          [
            "We never ask for bank credentials",
            "ExpenseIQ has no net-banking login and no ability to move money. Everything here is a record you created, by speaking, typing, or photographing a bill.",
          ],
          [
            "Your ledger is yours",
            "You can export it as CSV at any time, and deleting a profile deletes its transactions, accounts and budgets. We show you exactly what goes before you confirm.",
          ],
          [
            "What the AI sees",
            "The sentence you speak or type is sent to a language model to be turned into a transaction. It is not used to train anyone's model. Nothing it produces is saved to your ledger until you confirm it.",
          ],
          [
            "Integrations are opt-in",
            "Gmail and Calendar connections are off by default, read-only, and revocable with one toggle. Raw email is never stored — only the transaction extracted from it.",
          ],
          [
            "Sharing is explicit",
            "A profile is shared only with people you invite by email, and an invite works only for the address it was sent to. Child profiles see their own allowance and goals, not the household's cards.",
          ],
          [
            "This is early software",
            "ExpenseIQ is in active development. Features marked “Soon” do not exist yet, paid plans are not live, and nothing on this site takes payment.",
          ],
        ].map(([title, body]) => (
          <section key={title}>
            <h2 className="font-display text-xl font-medium text-ink">
              {title}
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
              {body}
            </p>
          </section>
        ))}
      </div>
    </article>
  );
}
