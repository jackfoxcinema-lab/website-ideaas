import "./globals.css";

import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Outfit } from "next/font/google";

import { Grain } from "@/components/common/grain";
import { ThemeProvider } from "@/components/common/theme-provider";
import { PlayerProvider } from "@/components/music/player-provider";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

// One geometric family across the site — the wordmark is just the heaviest
// cut of the body text, which is what keeps the whole thing feeling of a piece.
const fontSans = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const fontDisplay = Outfit({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s — ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: [...siteConfig.keywords],
  authors: [{ name: siteConfig.authorName, url: siteConfig.url }],
  creator: siteConfig.authorName,
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2ede0" },
    { media: "(prefers-color-scheme: dark)", color: "#121f19" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen font-sans",
          fontSans.variable,
          fontDisplay.variable,
          fontMono.variable
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          themes={["light", "dark"]}
          enableSystem={false}
          disableTransitionOnChange
        >
          <PlayerProvider>{children}</PlayerProvider>
          <Grain />
        </ThemeProvider>
      </body>
    </html>
  );
}
