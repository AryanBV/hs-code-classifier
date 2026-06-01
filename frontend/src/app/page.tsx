import type { Metadata } from "next";

import { PageShell } from "@/components/layout/page-shell";
import { LandingForm } from "@/components/landing/landing-form";
import { TAGLINE, VALUE_PROP, VALUE_SUB, TRUST_POINTS } from "@/lib/content";

export const metadata: Metadata = {
  title: "The right ITC-HS export code, with a rationale you can verify",
  description:
    "Describe your product and Prevyl finds the correct 8-digit Indian ITC-HS export code, with the chapter, heading and legal basis cited so you can verify it before filing. Free to use.",
  alternates: { canonical: "/" },
};

/**
 * Landing / input screen — the first impression and the brand moment.
 * A single-purpose instrument, idle and inviting: the brand line, the value
 * proposition, the ledger field with real example chips, and an honest trust
 * strip. Renders its OWN focus-width PageShell (the layout no longer wraps
 * children, so every page owns the one shared rail). Server component; the
 * interactive field lives in <LandingForm/>. Entrance motion uses the shared
 * reveal-rise utility (entrance-only, reduced-motion settles instantly).
 */
export default function Home() {
  return (
    <PageShell
      as="section"
      width="focus"
      aria-label="Classify a product"
      className="flex flex-1 flex-col justify-center py-section"
    >
      {/* ---- Hero copy ---- */}
      <div className="flex flex-col gap-4 text-left">
        <p className="reveal-rise text-eyebrow font-semibold uppercase text-accent-ink">
          {TAGLINE}
        </p>

        <h1 className="reveal-rise max-w-[16ch] text-balance font-display text-title font-medium leading-[var(--leading-tight)] tracking-[var(--tracking-title)] text-ink">
          {VALUE_PROP}
        </h1>

        <p className="reveal-rise max-w-[46ch] text-balance font-sans text-body leading-relaxed text-ink-muted">
          {VALUE_SUB}
        </p>
      </div>

      {/* ---- The ledger field + examples ---- */}
      <div className="reveal-rise mt-block">
        <LandingForm />
      </div>

      {/* ---- Trust strip: quiet, honest, no hype ---- */}
      <div className="reveal-rise mt-section border-t border-rule pt-6">
        <ul className="flex flex-col gap-2.5">
          {TRUST_POINTS.map((point) => (
            <li
              key={point}
              className="flex items-center gap-2.5 font-sans text-meta text-ink-muted"
            >
              <TickIcon className="size-[0.95rem] shrink-0 text-accent-quiet" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 font-sans text-meta leading-relaxed text-ink-muted">
          <span className="font-semibold text-accent-ink">
            Built for Indian exporters and customs brokers.
          </span>{" "}
          Every code comes with the chapter, heading and legal basis behind it.
        </p>
      </div>
    </PageShell>
  );
}

/** A hairline tick. Decorative, currentColor; never a "verified" claim. */
function TickIcon({ className }: { className?: string }) {
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
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
