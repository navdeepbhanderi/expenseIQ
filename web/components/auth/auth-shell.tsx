import Link from "next/link";
import { Logo } from "@/components/brand/logo";

/**
 * The frame every auth screen sits in — design 7b/7c/7f.
 *
 * One column, centred, capped narrow. The design does not put marketing
 * alongside the form: someone who has reached signup is already convinced, and
 * a second column of persuasion at that point is noise.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col bg-paper-sunken">
      <div className="px-5 py-6 sm:px-8">
        <Link href="/" aria-label="ExpenseIQ home">
          <Logo size={30} />
        </Link>
      </div>

      <div className="flex flex-1 items-start justify-center px-5 pb-16 pt-4 sm:items-center sm:pb-24 sm:pt-0">
        <div className="w-full max-w-[420px]">
          <div className="rounded-[20px] border border-line-strong bg-paper p-6 shadow-[0_20px_50px_-34px_rgba(60,45,25,0.6)] sm:p-8">
            <h1 className="font-display text-[30px] font-normal leading-tight text-ink">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
                {subtitle}
              </p>
            )}

            <div className="mt-6">{children}</div>
          </div>

          {footer && (
            <p className="mt-5 text-center text-sm text-ink-muted">{footer}</p>
          )}
        </div>
      </div>
    </main>
  );
}

/** The "or" rule between a form and the Google button — design 7b. */
export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-line-soft" />
      <span className="text-xs text-ink-faint">or</span>
      <span className="h-px flex-1 bg-line-soft" />
    </div>
  );
}

/**
 * Google sign-in.
 *
 * A plain link, not a fetch: OAuth is a full-page redirect to Google, and
 * doing it through XHR would be blocked by their frame and CORS rules.
 */
export function GoogleButton({ label }: { label: string }) {
  const base =
    process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3100/api/v1";

  return (
    <a
      href={`${base}/auth/google`}
      className="flex h-11 w-full items-center justify-center gap-2.5 rounded-[--radius-control] border border-line bg-paper text-sm font-medium text-ink-soft transition-colors hover:bg-paper-raised"
    >
      <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
        />
        <path
          fill="#EA4335"
          d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
        />
      </svg>
      {label}
    </a>
  );
}
