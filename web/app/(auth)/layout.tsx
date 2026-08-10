import { AppProviders } from "@/components/providers/app-providers";

/**
 * Auth routes need the API client and the auth context, but not the app
 * shell — there is no sidebar or tab bar until someone is signed in.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return <AppProviders>{children}</AppProviders>;
}
