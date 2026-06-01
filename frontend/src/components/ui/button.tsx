import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Customs-Ledger button. Warm accent fills, hairline outlines, calm press.
 * primary  = accent fill (the inked stamp action)
 * secondary= ruled outline on surface (a quiet ledger control)
 * ghost    = transparent until hovered (tertiary, in-flow)
 * link     = underlined accent (inline navigation)
 */
const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-sans font-semibold",
    "transition-[transform,background-color,box-shadow,border-color] duration-150 ease-[var(--ease-ledger)]",
    "active:translate-y-px disabled:pointer-events-none disabled:opacity-55",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ),
  {
    variants: {
      variant: {
        primary: cn(
          "border border-transparent bg-accent text-accent-contrast",
          "shadow-[0_10px_22px_-14px_rgba(92,55,32,0.7),inset_0_1px_0_rgba(255,255,255,0.16)]",
          "hover:bg-accent-ink",
        ),
        secondary: cn(
          "border border-rule bg-surface text-ink",
          "shadow-[0_1px_0_rgba(35,33,28,0.02)]",
          "hover:border-accent/40 hover:bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface))]",
        ),
        ghost: cn(
          "border border-transparent bg-transparent text-ink",
          "hover:bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface))] hover:text-accent-ink",
        ),
        link: cn(
          "border-transparent bg-transparent text-accent underline-offset-4 hover:underline",
          "decoration-[color-mix(in_srgb,var(--accent)_45%,var(--rule))]",
        ),
      },
      size: {
        sm: "h-9 min-h-9 px-3 text-sm [&_svg]:size-4",
        md: "h-11 min-h-11 px-4 text-[0.96rem] [&_svg]:size-[1.05rem]",
        lg: "h-13 min-h-13 px-5 text-base [&_svg]:size-5",
        icon: "size-11 min-h-11 min-w-11 p-0 [&_svg]:size-5",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        // Only a real <button> gets a default type; Slot forwards to its child.
        type={asChild ? undefined : (type ?? "button")}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
