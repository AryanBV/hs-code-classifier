import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export interface SiteFooterProps {
  className?: string;
}

/**
 * SiteFooter — a ruled footer carrying the honest advisory line and small
 * placeholder links. Stays a server component.
 */
function SiteFooter({ className }: SiteFooterProps) {
  return (
    <footer
      className={cn(
        "flex flex-col gap-3 border-t border-rule py-6 text-sm text-ink-muted",
        "sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p className="m-0">
        Indicative classification · verify before filing.
      </p>
      <nav className="flex items-center gap-4">
        <Link
          href="/about"
          className="rounded-md font-medium transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          About
        </Link>
        <Link
          href="/privacy"
          className="rounded-md font-medium transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Privacy
        </Link>
      </nav>
    </footer>
  );
}

export { SiteFooter };
