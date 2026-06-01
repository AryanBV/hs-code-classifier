"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/field";
import { EXAMPLES } from "@/lib/examples";

/** A trimmed description with at least 2 visible characters. */
const landingSchema = z.object({
  query: z
    .string()
    .trim()
    .min(2, "Add a few more words so we can find the right code."),
});

type LandingValues = z.infer<typeof landingSchema>;

const FIELD_ID = "product-description";
const META_ID = "product-description-meta";

/**
 * LandingForm — the interactive hero. A single ledger field that takes a product
 * description and files it. Example chips pre-fill the field; the primary action
 * routes to /classify?q=… On submit we trim and hand off to the wizard route.
 */
export function LandingForm() {
  const router = useRouter();
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const { register, handleSubmit, setValue, control } = useForm<LandingValues>({
    resolver: zodResolver(landingSchema),
    defaultValues: { query: "" },
    mode: "onSubmit",
  });

  // The RHF ref is merged with our own so chips can focus the field.
  const { ref: rhfRef, ...queryField } = register("query");

  // useWatch is the compiler-friendly subscription (avoids watch() bail-out).
  const queryValue = useWatch({ control, name: "query" });
  const canSubmit = queryValue.trim().length >= 2;

  const onSubmit = React.useCallback(
    (values: LandingValues) => {
      const q = values.query.trim();
      if (q.length < 2) return;
      router.push(`/classify?q=${encodeURIComponent(q)}`);
    },
    [router],
  );

  const fillExample = React.useCallback(
    (example: string) => {
      setValue("query", example, {
        shouldValidate: true,
        shouldDirty: true,
        shouldTouch: true,
      });
      const el = textareaRef.current;
      if (el) {
        el.focus();
        // Drop the caret at the end of the inserted text.
        const end = example.length;
        try {
          el.setSelectionRange(end, end);
        } catch {
          /* setSelectionRange is unsupported on some inputs; safe to ignore. */
        }
      }
    },
    [setValue],
  );

  // Enter (or Cmd/Ctrl+Enter) submits; Shift+Enter keeps the newline.
  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const isEnter = event.key === "Enter";
      const wantsNewline = event.shiftKey;
      if (isEnter && !wantsNewline) {
        event.preventDefault();
        void handleSubmit(onSubmit)();
      }
    },
    [handleSubmit, onSubmit],
  );

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      autoComplete="off"
      aria-label="Classify a product"
      className="w-full"
    >
      {/* ---- The ledger field ---- */}
      <div
        className={cn(
          "group relative rounded-lg border border-rule bg-surface text-left",
          "shadow-[0_1px_0_rgba(35,33,28,0.03),0_18px_44px_-28px_rgba(35,33,28,0.34)]",
          "transition-[border-color,box-shadow] duration-200 ease-[var(--ease-ledger)]",
          "focus-within:border-[color-mix(in_srgb,var(--accent)_42%,var(--rule))]",
          "focus-within:shadow-[0_18px_44px_-28px_rgba(35,33,28,0.4),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]",
        )}
      >
        {/* field head: label · hairline · entry ref */}
        <div className="flex items-center gap-2.5 px-4 pt-3.5 sm:px-5">
          <span className="font-sans text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-ink-muted">
            Description to file
          </span>
          <span aria-hidden="true" className="h-px flex-1 bg-rule" />
          <span
            aria-hidden="true"
            className="font-mono text-[0.66rem] tracking-[0.02em] text-ink-muted"
          >
            Entry 01
          </span>
        </div>

        {/* field body: the description input, styled as a ledger line */}
        <div className="px-4 pb-1 pt-1 sm:px-5">
          <Label htmlFor={FIELD_ID} className="sr-only">
            Product description
          </Label>
          <Textarea
            id={FIELD_ID}
            rows={2}
            placeholder="e.g. stainless steel hex bolts M10, grade A2-70"
            aria-describedby={META_ID}
            spellCheck={false}
            {...queryField}
            ref={(node) => {
              rhfRef(node);
              textareaRef.current = node;
            }}
            onKeyDown={onKeyDown}
            className={cn(
              // Strip the primitive's chrome — the card owns the border + focus ring.
              "min-h-[3.4rem] resize-none border-0 bg-transparent px-0.5 py-2.5",
              "font-display text-[clamp(1.12rem,2vw,1.42rem)] font-normal leading-snug text-ink",
              "placeholder:italic placeholder:text-ink-muted/70",
              "hover:border-0 focus-visible:border-0 focus-visible:outline-none",
            )}
          />
        </div>

        {/* field foot: hint · primary action */}
        <div
          className={cn(
            "flex flex-col gap-3.5 px-4 pb-4 sm:px-5",
            "lg:flex-row lg:flex-wrap lg:items-center",
          )}
        >
          <span
            id={META_ID}
            className="order-2 inline-flex min-w-[10rem] flex-1 items-center gap-2 text-[0.78rem] text-ink-muted lg:order-1"
          >
            <InfoIcon className="size-[0.95rem] shrink-0 text-accent opacity-85" />
            <span>
              Material, form and use sharpen the match. e.g.{" "}
              <span className="font-mono text-[0.74rem] text-accent-ink">
                grade A2-70
              </span>
              .
            </span>
          </span>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={!canSubmit}
            className="order-1 w-full justify-center gap-3 lg:order-2 lg:w-auto"
          >
            <SearchIcon className="size-[1.05rem]" />
            <span>Classify</span>
            <kbd
              aria-hidden="true"
              className="ml-0.5 hidden rounded-[6px] bg-white/15 px-1.5 py-0.5 font-mono text-[0.66rem] font-medium tracking-[0.04em] sm:inline-block"
            >
              ↵
            </kbd>
          </Button>
        </div>
      </div>

      {/* ---- Example chips ---- */}
      <div className="mt-6 text-left sm:mt-7">
        <p className="mb-3 flex items-center gap-2.5">
          <span className="font-sans text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            Try one
          </span>
          <span aria-hidden="true" className="h-px flex-1 bg-rule" />
        </p>
        <div
          role="group"
          aria-label="Example product descriptions"
          className="flex flex-wrap gap-2.5"
        >
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => fillExample(example)}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-full border border-rule bg-surface px-4 py-2.5",
                "font-sans text-[0.86rem] font-medium text-ink text-left",
                "shadow-[0_1px_0_rgba(35,33,28,0.02),0_10px_28px_-22px_rgba(35,33,28,0.28)]",
                "transition-[background-color,border-color,transform] duration-150 ease-[var(--ease-ledger)]",
                "hover:border-[color-mix(in_srgb,var(--accent)_30%,var(--rule))] hover:bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface))]",
                "active:translate-y-px",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              )}
            >
              <PlusIcon className="size-[0.95rem] shrink-0 text-accent opacity-80" />
              {example}
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}

/* ---- Inline icons (hairline, currentColor) ---- */

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v4h1" />
    </svg>
  );
}
