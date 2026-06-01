"use client";

import * as React from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export interface ExpanderProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  /** Small-caps tease on the right of the summary row, hero-B style. */
  meta?: string;
  className?: string;
}

/**
 * Expander — the hero-B `<details>` idiom on Radix Collapsible. A ruled summary
 * row with a chevron that rotates on open and a calm open/close. The chevron
 * transition respects reduced-motion via the global CSS guard.
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
        "overflow-hidden rounded-md border border-rule bg-surface",
        open && "bg-[color-mix(in_srgb,var(--surface)_70%,var(--surface-sunk))]",
        className,
      )}
    >
      <Collapsible.Trigger
        className={cn(
          "flex min-h-11 w-full items-center gap-3 px-4 py-3.5 text-left",
          "font-sans text-[0.92rem] font-semibold text-ink",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
        )}
      >
        <ChevronRight
          aria-hidden="true"
          strokeWidth={2.2}
          className={cn(
            "size-[18px] shrink-0 text-accent transition-transform duration-200 ease-[var(--ease-ledger)]",
            open && "rotate-90",
          )}
        />
        <span className="flex-1">{title}</span>
        {meta && (
          <span className="font-sans text-[0.7rem] font-medium uppercase tracking-[0.08em] text-ink-muted">
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
            <div className="border-t border-rule px-4 pb-4.5 pl-[46px] pt-3.5 text-[0.92rem] leading-relaxed text-ink-muted">
              {children}
            </div>
          </div>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

export { Expander };
