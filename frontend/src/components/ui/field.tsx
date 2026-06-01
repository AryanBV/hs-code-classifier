import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";

import { cn } from "@/lib/utils";

/** Shared ledger-field chrome for Input + Textarea. */
const fieldBase = cn(
  "w-full rounded-md border border-rule bg-surface font-sans text-ink",
  "placeholder:text-ink-muted/70",
  "transition-[border-color,box-shadow] duration-150 ease-[var(--ease-ledger)]",
  "hover:border-[color-mix(in_srgb,var(--accent)_24%,var(--rule))]",
  "focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
  "disabled:cursor-not-allowed disabled:opacity-55",
);

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = "text", ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(fieldBase, "h-11 px-3.5 py-2.5 text-base", className)}
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
      "min-h-[7rem] resize-y px-3.5 py-3 text-base leading-relaxed",
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
      "font-sans text-sm font-semibold text-ink",
      "peer-disabled:cursor-not-allowed peer-disabled:opacity-55",
      className,
    )}
    {...props}
  />
));
Label.displayName = "Label";

export { Input, Textarea, Label };
