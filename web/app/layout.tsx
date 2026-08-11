import type { Metadata, Viewport } from "next";
import {
  Newsreader,
  IBM_Plex_Sans,
  IBM_Plex_Mono,
  IBM_Plex_Sans_Devanagari,
} from "next/font/google";
import "./globals.css";
import { ThemeScript } from "@/components/theme-script";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

/*
 * Loaded for the same reason the design specifies it: entries arrive as
 * "300 रुपये किराने पे खर्च किए" and the Latin fallback mangles Devanagari
 * matras. This is a correctness requirement, not a typographic flourish.
 */
const plexDevanagari = IBM_Plex_Sans_Devanagari({
  variable: "--font-plex-devanagari",
  subsets: ["devanagari"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ExpenseIQ - Say it, and it's tracked",
    template: "%s · ExpenseIQ",
  },
  description:
    "Speak an expense in Hindi, Gujarati or Hinglish and ExpenseIQ files it correctly. Budgets, cards, loans and family spending, without the data entry.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf6ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0d0c" },
  ],
  width: "device-width",
  initialScale: 1,
  // The mic composer sits at the bottom on mobile; the keyboard must not
  // shove it off-screen, and zooming out to escape it is not a fix.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable} ${plexDevanagari.variable} h-full`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
