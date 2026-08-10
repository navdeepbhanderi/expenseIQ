"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, Moon, Sun, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { useTheme } from "@/lib/theme";
import { useHasSession } from "@/lib/session-hint";
import { cn } from "@/lib/cn";

/** Design 8a's nav. */
const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#families", label: "Families" },
  { href: "#security", label: "Security" },
  { href: "#pricing", label: "Pricing" },
];

export function SiteHeader() {
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const signedIn = useHasSession();

  return (
    <header className="sticky top-0 z-30 border-b border-line-soft bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" aria-label="ExpenseIQ home">
          <Logo size={30} />
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-paper-raised hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <IconButton
            aria-label={
              theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
            }
            size="sm"
            onClick={toggle}
          >
            {theme === "dark" ? (
              <Sun className="size-4" aria-hidden="true" />
            ) : (
              <Moon className="size-4" aria-hidden="true" />
            )}
          </IconButton>

          {/* Offering "Log in" to someone already signed in is the app not
              knowing who it is talking to. */}
          {signedIn ? (
            <Button asChild size="sm">
              <Link href="/dashboard">Go to your ledger</Link>
            </Button>
          ) : (
            <>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex"
              >
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/signup">Start free</Link>
              </Button>
            </>
          )}

          <IconButton
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            size="sm"
            onClick={() => setOpen((v) => !v)}
            className="lg:hidden"
          >
            {open ? (
              <X className="size-4" aria-hidden="true" />
            ) : (
              <Menu className="size-4" aria-hidden="true" />
            )}
          </IconButton>
        </div>
      </div>

      <div
        className={cn(
          "overflow-hidden border-t border-line-soft transition-[max-height] lg:hidden",
          open ? "max-h-80" : "max-h-0 border-t-0",
        )}
      >
        <nav className="flex flex-col p-3">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm text-ink-soft hover:bg-paper-raised"
            >
              {link.label}
            </Link>
          ))}
          {!signedIn && (
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm text-ink-soft hover:bg-paper-raised sm:hidden"
            >
              Log in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
