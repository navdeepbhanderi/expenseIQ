import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-paper-sunken px-5 text-center">
      <Logo size={34} />
      <div>
        <h1 className="font-display text-3xl text-ink">
          That page isn&rsquo;t here
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          The link may be old, or the page may have moved.
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/dashboard">Go to your ledger</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </main>
  );
}
