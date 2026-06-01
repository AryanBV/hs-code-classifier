import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";

import { cn } from "@/lib/utils";

/**
 * Shared ledger-field chrome for Input + Textarea. A recessed sheet you write
 * into: rule-strong border (a load-bearing control edge, WCAG 1.4.11), full
 * ink-muted placeholder (≥4.5:1, not a faint ghost), a cool focus ring (system
 * event, not the brand). An error state is driven entirely by `aria-invalid`
 * so no prop signature changes: set `aria-invalid` on the field and it adopts
 * the rust band edge.
 */
const fieldBase = cn(
  "w-full rounded-md border border-rule-strong bg-surface font-sans text-ink",
  "placeholder:text-ink-muted",
  "transition-[border-color,box-shadow] duration-150 ease-[var(--ease-ledger)]",
  "hover:border-[color-mix(in_oklab,var(--accent)_30%,var(--rule-strong))]",
  "focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
  "aria-[invalid=true]:border-band-low aria-[invalid=true]:focus-visible:border-band-low",
  "aria-[invalid=true]:focus-visible:outline-band-low",
  "disabled:cursor-not-allowed disabled:opacity-55",
);

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = "text", ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(fieldBase, "h-11 px-3.5 py-2.5 text-body", className)}
    {...props}
  />
));
Input.displayName = "Input";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      fieldBase,
      "min-h-[7rem] resize-y px-3.5 py-3 text-body leading-relaxed",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      "font-sans text-meta font-semibold text-ink",
      "peer-disabled:cursor-not-allowed peer-disabled:opacity-55",
      className,
    )}
    {...props}
  />
));
Label.displayName = "Label";

/**
 * FieldError — a quiet rust-toned message tied to a field via id/aria-describedby.
 * Renders nothing when there is no message. Additive helper for the new error
 * state; existing consumers are unaffected.
 */
const FieldError = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
  if (!children) return null;
  return (
    <p
      ref={ref}
      className={cn("font-sans text-meta text-band-low", className)}
      {...props}
    >
      {children}
    </p>
  );
});
FieldError.displayName = "FieldError";

export { Input, Textarea, Label, FieldError };
