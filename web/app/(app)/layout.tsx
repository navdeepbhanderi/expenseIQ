import { AppProviders } from "@/components/providers/app-providers";
import { AppShell } from "@/components/app-shell/app-shell";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AppProviders>
      <AppShell>{children}</AppShell>
    </AppProviders>
  );
}
