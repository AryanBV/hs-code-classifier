import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/layout/wordmark";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export interface SiteHeaderProps {
  className?: string;
}

/**
 * SiteHeader — a slim ruled masthead: the Wordmark links home, a History link,
 * and the theme toggle. Stays a server component; only the toggle is a client
 * island.
 */
function SiteHeader({ className }: SiteHeaderProps) {
  return (
    <header
      className={cn(
        "flex items-center justify-between gap-4 border-b border-rule py-4",
        className,
      )}
    >
      <Link
        href="/"
        aria-label="Prevyl — home"
        className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <Wordmark subtitle="ITC-HS classification" />
      </Link>

      <nav className="flex items-center gap-1">
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
    </header>
  );
}

export { SiteHeader };
