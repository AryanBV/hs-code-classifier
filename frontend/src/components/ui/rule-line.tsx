import * as React from "react";

import { cn } from "@/lib/utils";

export interface RuleLineProps {
  /** When present, renders a ruled section header; otherwise a plain hairline. */
  label?: string;
  className?: string;
}

/**
 * RuleLine — a Customs-Ledger hairline. With a `label`, it's a section header:
 * a Fraunces title followed by a hairline rule that fills the row (hero-B's
 * `.section-head`). Without one, a plain semantic `<hr>`.
 */
function RuleLine({ label, className }: RuleLineProps) {
  if (!label) {
    return <hr className={cn("h-px border-0 border-t border-rule", className)} />;
  }

  return (
    <div className={cn("flex items-baseline gap-3", className)}>
      <h2 className="m-0 font-display text-[1.12rem] font-medium tracking-[0.005em] text-ink">
        {label}
      </h2>
      <span
        aria-hidden="true"
        className="h-px flex-1 -translate-y-[0.18em] bg-rule"
      />
    </div>
  );
}

export { RuleLine };
