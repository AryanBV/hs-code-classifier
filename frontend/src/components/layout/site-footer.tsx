import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { PageShell } from "@/components/layout/page-shell";
import { ADVISORY, BRAND } from "@/lib/content";

export interface SiteFooterProps {
  className?: string;
}

/**
 * SiteFooter: the global disclaimer plus the accountable-entity line, so the
 * tool reads as something a real operator stands behind. The full-width <footer>
 * carries the overline edge-to-edge; content runs through PageShell to share the
 * one rail with the masthead and page bodies. Server component.
 *
 * The persistent advisory here is the GLOBAL disclaimer. The graduated, per-band
 * "verify" line on a result lives at the decision point (owned by the result
 * view); this footer line is the always-on backstop.
 */
function SiteFooter({ className }: SiteFooterProps) {
  return (
    <footer className={cn("mt-section border-t border-rule-strong", className)}>
      <PageShell as="div" className="py-block">
        <div className="flex flex-col gap-4 text-meta text-ink-muted sm:flex-row sm:items-start sm:justify-between">
          {/* Disclaimer + accountable entity */}
          <div className="flex flex-col gap-1.5">
            <p className="m-0 font-medium text-ink">{ADVISORY}</p>
            <p className="m-0">
              {BRAND} gives AI-generated, indicative ITC-HS export codes. It is
              not official customs or legal advice. Verify with a licensed
              customs broker before filing. Built in India.
            </p>
            <p className="m-0">
              Questions or a code that looks wrong?{" "}
              <a
                href="mailto:aryan@prevyl.com"
                className={cn(
                  "rounded-sm font-medium text-accent-ink underline-offset-4 hover:underline",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                )}
              >
                aryan@prevyl.com
              </a>
            </p>
          </div>

          {/* Links */}
          <nav
            aria-label="Footer"
            className="flex items-center gap-5 sm:shrink-0"
          >
            <Link
              href="/about"
              className="rounded-sm font-medium transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              About
            </Link>
            <Link
              href="/privacy"
              className="rounded-sm font-medium transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="rounded-sm font-medium transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Terms
            </Link>
          </nav>
        </div>
      </PageShell>
    </footer>
  );
}

export { SiteFooter };
