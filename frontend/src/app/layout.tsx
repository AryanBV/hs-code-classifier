import type { Metadata, Viewport } from "next";
import { fraunces, hanken, commit } from "@/lib/fonts";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import "./globals.css";

const SITE = "https://hscode.prevyl.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "Prevyl — the right ITC-HS export code, with a rationale you can verify",
    template: "%s · Prevyl",
  },
  description:
    "Describe your product and Prevyl finds the correct 8-digit Indian ITC-HS export code, with the legal basis cited so you can verify it before filing.",
  applicationName: "Prevyl",
  keywords: [
    "ITC-HS code",
    "HS code",
    "Indian customs",
    "export classification",
    "tariff code",
    "customs broker",
  ],
  authors: [{ name: "Prevyl" }],
  openGraph: {
    type: "website",
    siteName: "Prevyl",
    title: "Prevyl — ITC-HS export classification you can verify",
    description:
      "The correct 8-digit Indian ITC-HS export code for any product, with a cited rationale.",
    url: SITE,
  },
  twitter: {
    card: "summary_large_image",
    title: "Prevyl — ITC-HS export classification you can verify",
    description:
      "The correct 8-digit Indian ITC-HS export code for any product, with a cited rationale.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4efe6" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1814" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${hanken.variable} ${commit.variable} h-full`}
    >
      <body className="flex min-h-dvh flex-col antialiased">
        <a
          href="#main"
          className="sr-only rounded-md focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-surface focus:px-4 focus:py-2 focus:text-ink focus:shadow-lg focus:outline-2 focus:outline-focus"
        >
          Skip to content
        </a>
        <Providers>
          <SiteHeader />
          {/*
            <main> is the focus target for skip-link + per-view focus handoff:
            tabindex=-1 lets JS move focus here on async transitions without
            making it a tab stop. Each page owns its OWN PageShell (the one
            shared rail), so the layout no longer wraps children — this is what
            stops the doubled gutter / conflicting max-width. The header and
            footer keep their own PageShell, so all three share one rail.
          */}
          <main
            id="main"
            tabIndex={-1}
            className="workspace-surface flex flex-1 flex-col focus:outline-none"
          >
            {children}
          </main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
