"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { ProfileProvider } from "@/components/providers/profile-provider";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/feedback";
import { Sidebar } from "./sidebar";
import { TabBar } from "./tab-bar";
import { Topbar } from "./topbar";
import { Logo } from "@/components/brand/logo";
import { CaptureDock } from "@/components/capture/capture-dock";
import { CaptureSheet } from "@/components/capture/capture-sheet";
import { ManualEntry } from "@/components/capture/manual-entry";
import { useDashboard } from "@/lib/api/hooks";
import { useProfile } from "@/components/providers/profile-provider";
import { useEffect } from "react";

/**
 * The authenticated frame - sidebar at lg, tab bar below it.
 *
 * Capture is owned here rather than by each page, because the mic is reachable
 * from every screen: the tab bar's FAB, the topbar button, and eventually the
 * space-bar shortcut all have to open the same thing.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading } = useAuth();


  // Waits for the session to be restored before deciding. Treating "no user
  // yet" as logged out would bounce every reload to the login page while the
  // refresh cookie was still being redeemed.
  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-4">
          <Logo size={34} />
          <p className="text-sm text-ink-faint">Opening your ledger…</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <ToastProvider>
        <ProfileProvider>
          <Frame>{children}</Frame>
        </ProfileProvider>
      </ToastProvider>
    </TooltipProvider>
  );
}

/**
 * Inside ProfileProvider, so capture can reach the active profile's accounts.
 *
 * Capture is owned by the shell rather than by each page because the mic is
 * reachable from every screen - the tab bar FAB, the topbar button and the
 * space-bar shortcut all have to open the same thing.
 */
function Frame({ children }: { children: React.ReactNode }) {
  const [captureOpen, setCaptureOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const { activeId } = useProfile();
  const { data: dashboard } = useDashboard(activeId);
  const accounts = dashboard?.accounts ?? [];

  return (
    <div className="flex min-h-dvh bg-canvas">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onCapture={() => setCaptureOpen(true)}
          onManualEntry={() => setManualOpen(true)}
        />

        {/*
         * Bottom padding clears the fixed tab bar and the FAB that overhangs
         * it, so the last row of any list stays tappable.
         */}
        <main className="flex-1 pb-[calc(88px+env(safe-area-inset-bottom))] lg:pb-0">
          {children}
        </main>

        <CaptureDock
          accounts={accounts}
          onManualEntry={() => setManualOpen(true)}
        />
      </div>

      <TabBar onCapture={() => setCaptureOpen(true)} />

      <CaptureSheet
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        accounts={accounts}
        onManualEntry={() => {
          setCaptureOpen(false);
          setManualOpen(true);
        }}
      />

      {/* Always mounted, never gated on the voice preference - switching
          voice off must not leave anyone unable to record an expense. */}
      <ManualEntry open={manualOpen} onOpenChange={setManualOpen} />
    </div>
  );
}
