"use client";

import * as React from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export interface ExpanderProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  /** Small-caps tease on the right of the summary row. */
  meta?: string;
  className?: string;
}

/**
 * Expander — a flat, ruled disclosure on Radix Collapsible. Demoted to FLAT
 * (no shadow, rule-strong control border) so elevation stays reserved for the
 * one lifted document sheet. A ruled summary row with a quiet chevron that
 * rotates on open; the open state sinks slightly into the page. The chevron and
 * height transitions respect reduced-motion via the global CSS guard.
 */
function Expander({
  title,
  children,
  defaultOpen = false,
  meta,
  className,
}: ExpanderProps) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <Collapsible.Root
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "overflow-hidden rounded-md border border-rule-strong bg-transparent",
        open && "sunk",
        className,
      )}
    >
      <Collapsible.Trigger
        className={cn(
          "flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left",
          "font-sans text-body font-semibold text-ink",
          "transition-colors duration-150 ease-[var(--ease-ledger)]",
          "hover:text-accent-ink",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
        )}
      >
        <ChevronRight
          aria-hidden="true"
          strokeWidth={2}
          className={cn(
            "size-[18px] shrink-0 text-accent-quiet transition-transform duration-200 ease-[var(--ease-ledger)]",
            open && "rotate-90",
          )}
        />
        <span className="flex-1">{title}</span>
        {meta && (
          <span className="font-sans text-eyebrow font-medium uppercase tracking-[0.08em] text-ink-muted">
            {meta}
          </span>
        )}
      </Collapsible.Trigger>
      <Collapsible.Content forceMount className="overflow-hidden">
        {/* grid-rows 0fr→1fr gives a calm height transition with no keyframes,
            and collapses to 0 height when closed (hidden via data-state). */}
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-[var(--ease-ledger)]",
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="border-t border-rule px-4 pb-4 pl-[46px] pt-3.5 text-body leading-relaxed text-ink-muted">
              {children}
            </div>
          </div>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

export { Expander };
