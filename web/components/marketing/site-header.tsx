"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, Moon, Sun, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
];

export function SiteHeader() {
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-line-soft bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-green font-display text-base font-semibold text-paper">
            E
          </span>
          <span className="font-display text-lg font-medium text-ink">
            ExpenseIQ
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
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

          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Get started</Link>
          </Button>

          <IconButton
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            size="sm"
            onClick={() => setOpen((v) => !v)}
            className="md:hidden"
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
          "overflow-hidden border-t border-line-soft transition-[max-height] md:hidden",
          open ? "max-h-40" : "max-h-0 border-t-0",
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
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-2.5 text-sm text-ink-soft hover:bg-paper-raised sm:hidden"
          >
            Log in
          </Link>
        </nav>
      </div>
    </header>
  );
}
