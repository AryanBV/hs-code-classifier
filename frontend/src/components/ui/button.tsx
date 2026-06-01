import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Customs-Ledger button. Warm accent fills, hairline outlines, calm press.
 * primary  = accent fill (the inked stamp action — the one saturated object)
 * secondary= ruled outline on surface (a quiet ledger control)
 * ghost    = transparent until hovered (tertiary, in-flow)
 * link     = underlined accent (inline navigation)
 *
 * Focus reads as a SYSTEM event, not the brand: a cool two-tone ring (a light
 * inner halo + the cool --focus outline) so it stays visible on the oxblood
 * accent fill as well as on paper.
 */
const buttonVariants = cva(
  cn(
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-sans font-semibold",
    "transition-[transform,background-color,box-shadow,border-color,color] duration-150 ease-[var(--ease-ledger)]",
    "active:translate-y-px disabled:pointer-events-none disabled:opacity-55",
    "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    "focus-visible:ring-2 focus-visible:ring-[var(--highlight)]",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ),
  {
    variants: {
      variant: {
        primary: cn(
          "border border-transparent bg-accent text-accent-contrast elev-1",
          "hover:bg-accent-ink",
        ),
        secondary: cn(
          "border border-rule-strong bg-surface text-ink",
          "hover:border-accent hover:bg-[color-mix(in_oklab,var(--accent)_9%,var(--surface))]",
        ),
        ghost: cn(
          "border border-transparent bg-transparent text-ink",
          "hover:bg-[color-mix(in_oklab,var(--accent)_9%,var(--surface))] hover:text-accent-ink",
        ),
        link: cn(
          "border-transparent bg-transparent text-accent-ink underline-offset-4 hover:underline",
          "decoration-[color-mix(in_oklab,var(--accent)_45%,var(--rule))]",
        ),
      },
      size: {
        sm: "h-9 min-h-9 px-3 text-meta [&_svg]:size-4",
        md: "h-11 min-h-11 px-4 text-body [&_svg]:size-[1.05rem]",
        lg: "h-13 min-h-13 px-5 text-body [&_svg]:size-5",
        icon: "size-11 min-h-11 min-w-11 p-0 [&_svg]:size-5",
      },
      layout: {
        inline: "",
        // a full-row ledger control: stretch to the column, anchor label left,
        // push any trailing glyph to the right edge.
        row: "w-full justify-between text-left",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      layout: "inline",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * Busy state: swaps in a calm spinner, sets aria-busy, and blocks the click
   * (guards double-submit on the ~40s classify action). Ignored when asChild.
   */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      layout,
      asChild = false,
      loading = false,
      type,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    // Slot must receive exactly one child element; never inject the spinner there.
    const content =
      loading && !asChild ? (
        <>
          <Loader2
            aria-hidden="true"
            className="animate-spin motion-reduce:animate-none"
          />
          {children}
        </>
      ) : (
        children
      );
    return (
      <Comp
        ref={ref}
        // Only a real <button> gets a default type; Slot forwards to its child.
        type={asChild ? undefined : (type ?? "button")}
        className={cn(buttonVariants({ variant, size, layout }), className)}
        disabled={asChild ? disabled : (disabled ?? loading)}
        aria-busy={loading || undefined}
        {...props}
      >
        {content}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
