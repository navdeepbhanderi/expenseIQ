"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

/**
 * Overlays — design 6g (modal, confirm dialog, side panel) and 6i (mobile
 * sheet).
 *
 * All four are the same Radix Dialog with different geometry, which is not
 * laziness: they share the behaviour that actually matters and is tedious to
 * get right — focus trapped inside, focus returned to the trigger on close,
 * Escape closing, the rest of the page inert to screen readers.
 */

interface BaseOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Hide the title visually but keep it for assistive tech. */
  hideTitle?: boolean;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

function Overlay() {
  return (
    <RadixDialog.Overlay className="fixed inset-0 z-40 bg-[#1B1815]/35 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
  );
}

function Title({ title, hideTitle }: { title: string; hideTitle?: boolean }) {
  if (hideTitle) {
    return (
      <VisuallyHidden>
        <RadixDialog.Title>{title}</RadixDialog.Title>
      </VisuallyHidden>
    );
  }

  return (
    <RadixDialog.Title className="font-display text-xl font-medium text-ink">
      {title}
    </RadixDialog.Title>
  );
}

/** Centred modal — design 6g's "Modal — add account". */
export function Modal({
  open,
  onOpenChange,
  title,
  hideTitle,
  description,
  children,
  footer,
  className,
}: BaseOverlayProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <Overlay />
        <RadixDialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg",
            "-translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden",
            "rounded-[var(--radius-panel)] border border-line bg-paper shadow-[var(--shadow-popover)]",
            "data-[state=open]:animate-scale-in",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line-soft px-6 py-5">
            <div>
              <Title title={title} hideTitle={hideTitle} />
              {description && (
                <RadixDialog.Description className="mt-1 text-sm text-ink-muted">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close
              aria-label="Close"
              className="-mr-1 -mt-1 rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-paper-raised hover:text-ink"
            >
              <X className="size-4" aria-hidden="true" />
            </RadixDialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

          {footer && (
            <div className="flex justify-end gap-2 border-t border-line-soft px-6 py-4">
              {footer}
            </div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/**
 * Bottom sheet — design 6i and 5g.
 *
 * Mobile's answer to the modal, and deliberately a separate component rather
 * than a responsive modal: design 5g has the confirm sheet cover the tab bar,
 * and it is sized for thumb reach with the actions at the bottom.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  hideTitle,
  description,
  children,
  footer,
  className,
}: BaseOverlayProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <Overlay />
        <RadixDialog.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col overflow-hidden",
            "rounded-t-[var(--radius-panel)] border-t border-line bg-paper",
            "shadow-[var(--shadow-popover)]",
            // Respects the home indicator on notched phones.
            "pb-[env(safe-area-inset-bottom)]",
            "data-[state=open]:animate-slide-in-bottom",
            className,
          )}
        >
          {/* Grab handle — signals "this drags/dismisses" without a label. */}
          <div className="flex justify-center pt-3" aria-hidden="true">
            <div className="h-1 w-9 rounded-full bg-line" />
          </div>

          <div className="px-5 pb-3 pt-3">
            <Title title={title} hideTitle={hideTitle} />
            {description && (
              <RadixDialog.Description className="mt-1 text-sm text-ink-muted">
                {description}
              </RadixDialog.Description>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-4">{children}</div>

          {footer && (
            <div className="flex flex-col gap-2 border-t border-line-soft px-5 py-4">
              {footer}
            </div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** Right-hand side panel — design 6g's "Side panel · transaction detail". */
export function SidePanel({
  open,
  onOpenChange,
  title,
  hideTitle,
  description,
  children,
  footer,
  className,
}: BaseOverlayProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <Overlay />
        <RadixDialog.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-hidden",
            "border-l border-line bg-paper shadow-[var(--shadow-popover)]",
            "data-[state=open]:animate-slide-in-right",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-4">
            <div>
              <Title title={title} hideTitle={hideTitle} />
              {description && (
                <RadixDialog.Description className="mt-1 text-sm text-ink-muted">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close
              aria-label="Close"
              className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-paper-raised hover:text-ink"
            >
              <X className="size-4" aria-hidden="true" />
            </RadixDialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>

          {footer && (
            <div className="flex gap-2 border-t border-line-soft px-5 py-4">
              {footer}
            </div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/**
 * Destructive confirm — design 6g.
 *
 * Names what will happen in the button ("Delete 3 transactions") rather than
 * saying "OK". A confirm dialog whose button says OK is one the user clicks
 * without reading.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  isLoading,
  destructive = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  isLoading?: boolean;
  destructive?: boolean;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      className="max-w-sm"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "primary"}
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <></>
    </Modal>
  );
}
