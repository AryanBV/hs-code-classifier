import type { Metadata } from "next";

import { PageShell } from "@/components/layout/page-shell";
import { LandingForm } from "@/components/landing/landing-form";
import { FirstRunIntro, ExampleTrigger } from "@/components/landing/first-run-intro";
import { HOW_IT_WORKS, VALUE_PROP, VALUE_SUB } from "@/lib/content";

export const metadata: Metadata = {
  title: "The right ITC-HS export code, with a rationale you can verify",
  description:
    "Describe your product and Prevyl finds the correct 8-digit Indian ITC-HS export code, with the chapter, heading and legal basis cited so you can verify it before filing. Free to use.",
  alternates: { canonical: "/" },
};

interface HomeProps {
  // Next 16: searchParams is a Promise and must be awaited.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Landing / input screen — the first impression.
 *
 * Rebuilt for the 5-second test: ONE outcome headline, ONE supporting line, and
 * the ledger field as the hero action, centered in a focused column. The
 * specimen card, the trust strip and the eyebrow tagline that used to crowd the
 * fold are gone (Hick's Law: every extra hero element slows the decision). What
 * the tool produces is now SHOWN by the first-run replay and recalled in a quiet
 * "how it works" below the fold, not asserted above it.
 *
 * Server component; it reads `?q=` server-side (awaits searchParams) and hands it
 * to <LandingForm/> as `initialQuery` so every recovery exit returns PREFILLED.
 * Entrance motion uses the shared reveal-rise utility (reduced-motion settles
 * instantly).
 */
export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const raw = params.q;
  const initialQuery = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";

  return (
    <PageShell
      as="section"
      width="wide"
      aria-label="Classify a product"
      className="flex flex-1 flex-col"
    >
      {/* First-run replay — once only, skippable; never shown to returning users.
          Suppressed when arriving with a carried query (a recovery round-trip). */}
      <FirstRunIntro suppressed={initialQuery.length > 0} />

      {/* ---- Hero: input-first, centered, fills the first view ---- */}
      <div className="flex flex-1 flex-col items-center justify-center py-section">
        <div className="flex w-full max-w-[42rem] flex-col items-center gap-5 text-center">
          {/* The ONE display-register typographic event (opsz 144, lighter cut). */}
          <h1 className="reveal-rise text-balance font-display opsz-display text-title font-[number:var(--weight-display)] leading-[var(--leading-tight)] tracking-[var(--tracking-title)] text-ink sm:text-display">
            {VALUE_PROP}
          </h1>

          <p className="reveal-rise max-w-[48ch] text-balance font-sans text-body leading-relaxed text-ink-muted">
            {VALUE_SUB}
          </p>
        </div>

        {/* The ledger field — the hero action. Centered container, left-aligned
            data inside (you type left-aligned text into the well). */}
        <div className="reveal-rise mt-block w-full max-w-focus text-left">
          <LandingForm initialQuery={initialQuery} />
        </div>

        {/* Quiet re-entry to the example, for anyone who skipped the first-run
            preview or came straight here. The auto-once preview stays primary. */}
        <div className="reveal-rise mt-5">
          <ExampleTrigger />
        </div>
      </div>

      {/* ---- How it works (below the fold; quiet, on-theme) ---- */}
      <HowItWorks />
    </PageShell>
  );
}

/**
 * HowItWorks — a quiet, ledger-idiom three-step strip below the fold. It carries
 * the substance the hero deliberately sheds, in the marginal-note voice: line
 * numbers, a hairline, a Fraunces step title, a plain caption. No icons-as-
 * decoration, no fabricated stats.
 */
function HowItWorks() {
  return (
    <section aria-label="How it works" className="border-t border-rule py-section">
      <p className="mb-7 font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
        How it works
      </p>
      <ol className="grid grid-cols-1 gap-x-[clamp(32px,4vw,64px)] gap-y-8 sm:grid-cols-3">
        {HOW_IT_WORKS.map((step, i) => (
          <li key={step.title} className="flex flex-col">
            <span
              aria-hidden="true"
              className="font-mono text-meta text-accent-quiet"
            >
              {`0${i + 1}`}
            </span>
            <span aria-hidden="true" className="mt-2 h-px w-full bg-rule" />
            <h3 className="mt-3.5 font-display opsz-section text-label font-[number:var(--weight-section)] leading-snug text-ink">
              {step.title}
            </h3>
            <p className="mt-2 font-sans text-meta leading-relaxed text-ink-muted">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-9 max-w-[64ch] font-sans text-meta leading-relaxed text-ink-muted">
        <span className="font-semibold text-accent-ink">
          Built for Indian exporters and customs brokers.
        </span>{" "}
        Free to use. Every code comes with the chapter, heading and legal basis
        behind it.
      </p>
    </section>
  );
}
