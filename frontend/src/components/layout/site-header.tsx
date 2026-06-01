import * as React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/page-shell";
import { Wordmark } from "@/components/layout/wordmark";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export interface SiteHeaderProps {
  className?: string;
}

/**
 * SiteHeader — a slim ruled masthead, sticky and themed. The full-width
 * <header> carries the load-bearing underline edge-to-edge; the content runs
 * through PageShell so the wordmark sits on the same left rail as every page
 * body and the footer. A persistent "New classification" control keeps the
 * primary loop one tap away from anywhere. Only the theme toggle is a client
 * island; the rest stays a server component.
 */
function SiteHeader({ className }: SiteHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-rule-strong",
        // The ledger is paper, not frosted glass: an OPAQUE surface so content
        // scrolls cleanly beneath the rule with no backdrop-blur chrome idiom.
        "bg-bg",
        className,
      )}
    >
      <PageShell as="div" className="flex items-center justify-between gap-4 py-3">
        <Link
          href="/"
          aria-label="Prevyl, home"
          className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Wordmark subtitle="ITC-HS classification" />
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href="/">
              <Plus aria-hidden="true" />
              <span className="hidden sm:inline">New classification</span>
              <span className="sm:hidden">New</span>
            </Link>
          </Button>
          <Link
            href="/history"
            className={cn(
              "rounded-md px-3 py-2 font-sans text-sm font-medium text-ink-muted",
              "transition-colors hover:text-ink",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
            )}
          >
            History
          </Link>
          <ThemeToggle />
        </nav>
      </PageShell>
    </header>
  );
}

export { SiteHeader };
