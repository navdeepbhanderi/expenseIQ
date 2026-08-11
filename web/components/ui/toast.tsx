"use client";

import * as RadixToast from "@radix-ui/react-toast";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Tone } from "./feedback";

/**
 * Toasts - design 6e, and the undo affordance in 5h ("Added ₹300 to
 * Groceries · Undo").
 *
 * The undo case is why the action is a first-class field rather than arbitrary
 * children: the backend issues an undo token valid for ten seconds, so the
 * toast's lifetime and the token's have to agree. A toast that outlives its
 * token offers an Undo button that fails.
 */

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: Tone;
  /** Milliseconds. Defaults to 5s; the undo toast passes the token's window. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastEntry extends ToastOptions {
  id: number;
}

interface ToastApi {
  toast: (options: ToastOptions) => void;
  /** Convenience for the confirm→undo flow. */
  undoToast: (
    title: string,
    onUndo: () => void,
    windowSeconds?: number,
  ) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<ToastEntry[]>([]);

  const toast = useCallback((options: ToastOptions) => {
    const id = nextId++;
    setEntries((current) => [...current, { ...options, id }]);
  }, []);

  const undoToast = useCallback(
    (title: string, onUndo: () => void, windowSeconds = 10) => {
      toast({
        title,
        tone: "success",
        // Matches the server's undo window exactly. Outliving it would show a
        // button that 404s; expiring early would take the option away from a
        // user who still has it.
        duration: windowSeconds * 1000,
        action: { label: "Undo", onClick: onUndo },
      });
    },
    [toast],
  );

  const dismiss = useCallback((id: number) => {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const api = useMemo(() => ({ toast, undoToast }), [toast, undoToast]);

  const tones: Record<Tone, string> = {
    info: "border-line bg-paper",
    success: "border-income/30 bg-paper",
    warning: "border-attention-line bg-attention-soft",
    attention: "border-attention-line bg-attention-soft",
    error: "border-spend/30 bg-paper",
  };

  return (
    <ToastContext value={api}>
      <RadixToast.Provider swipeDirection="right">
        {children}

        {entries.map((entry) => (
          <RadixToast.Root
            key={entry.id}
            duration={entry.duration ?? 5000}
            onOpenChange={(open) => {
              if (!open) dismiss(entry.id);
            }}
            className={cn(
              "flex items-center gap-3 rounded-[var(--radius-control)] border px-4 py-3",
              "shadow-[var(--shadow-popover)] data-[state=open]:animate-slide-up",
              tones[entry.tone ?? "info"],
            )}
          >
            <div className="flex-1">
              <RadixToast.Title className="text-sm font-semibold text-ink">
                {entry.title}
              </RadixToast.Title>
              {entry.description && (
                <RadixToast.Description className="mt-0.5 text-xs text-ink-muted">
                  {entry.description}
                </RadixToast.Description>
              )}
            </div>

            {entry.action && (
              <RadixToast.Action
                altText={entry.action.label}
                onClick={entry.action.onClick}
                className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-green transition-colors hover:bg-green-soft"
              >
                {entry.action.label}
              </RadixToast.Action>
            )}

            <RadixToast.Close
              aria-label="Dismiss"
              className="rounded p-0.5 text-ink-faint transition-colors hover:text-ink"
            >
              <X className="size-4" aria-hidden="true" />
            </RadixToast.Close>
          </RadixToast.Root>
        ))}

        <RadixToast.Viewport
          className={cn(
            "fixed z-[60] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 outline-none",
            // Above the mobile tab bar, bottom-right on desktop. A toast that
            // covers the tab bar hides the app's main navigation.
            "bottom-[calc(72px+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2",
            "lg:bottom-6 lg:left-auto lg:right-6 lg:translate-x-0",
          )}
        />
      </RadixToast.Provider>
    </ToastContext>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }

  return context;
}
