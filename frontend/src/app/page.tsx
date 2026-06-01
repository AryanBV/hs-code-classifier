import type { Metadata } from "next";

import { PageShell } from "@/components/layout/page-shell";
import { LandingForm } from "@/components/landing/landing-form";
import { Surface } from "@/components/ui/surface";
import { MonoCode } from "@/components/ui/mono-code";
import { TAGLINE, VALUE_PROP, VALUE_SUB, TRUST_POINTS } from "@/lib/content";

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
 * Landing / input screen — the first impression and the brand moment.
 *
 * An off-center, anchored composition: the brand line, value proposition and
 * ledger field on the left; a static example RECORD specimen on the right (at
 * `lg`) so a stranger SEES the artifact the instrument produces before waiting
 * for one. The specimen is clearly labelled "An example result" so it is never
 * mistaken for a live classification.
 *
 * H7 — the page reads `?q=` server-side (it already awaits searchParams) and
 * hands it to <LandingForm/> as `initialQuery`, so a recovery exit that routes
 * back to `/?q=…` returns the field PREFILLED. Server component; the interactive
 * field lives in <LandingForm/>. Renders its OWN PageShell (the one shared rail).
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
      className="flex flex-1 flex-col justify-center py-section"
    >
      <div className="grid grid-cols-1 items-center gap-x-[clamp(28px,5vw,72px)] gap-y-block lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        {/* ---- Left column: the brand moment + the ledger field ---- */}
        <div className="flex max-w-focus flex-col">
          {/* hero copy */}
          <div className="flex flex-col gap-4 text-left">
            <p className="reveal-rise text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-accent-ink">
              {TAGLINE}
            </p>

            {/* H4 — the ONE serif that reaches the display register (opsz 144,
                lighter/opener cut), the page's display-scale typographic event. */}
            <h1 className="reveal-rise max-w-[15ch] text-balance font-display opsz-display text-title font-[number:var(--weight-display)] leading-[var(--leading-tight)] tracking-[var(--tracking-title)] text-ink sm:text-display">
              {VALUE_PROP}
            </h1>

            <p className="reveal-rise max-w-[46ch] text-balance font-sans text-body leading-relaxed text-ink-muted">
              {VALUE_SUB}
            </p>
          </div>

          {/* the ledger field + examples (carries the prefilled query) */}
          <div className="reveal-rise mt-block">
            <LandingForm initialQuery={initialQuery} />
          </div>
        </div>

        {/* ---- Right column: the static example specimen ---- */}
        <div className="reveal-rise hidden lg:block">
          <ExampleRecord />
        </div>
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

/**
 * ExampleRecord — H3. A small, static SPECIMEN of a finished record so the
 * landing SHOWS what it produces, not just claims it: the lifted document sheet,
 * the HS code as the hero object, a confidence band on its keyed wash, and ONE
 * verbatim citation line. It is plainly marked "An example result" and is NOT a
 * live classification: no copy controls, no actions, no seal. Honesty holds —
 * the band is a word + meaning, never a number; the italic line is a real
 * verbatim quote from the schedule (italic = verbatim-source only).
 */
function ExampleRecord() {
  return (
    <figure className="m-0">
      <Surface
        variant="raised"
        sheet
        className="surface-grain flex flex-col gap-5 p-[clamp(1.1rem,2.4vw,1.6rem)]"
        aria-hidden="true"
      >
        <p className="font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
          An example result
        </p>

        {/* the code as the hero object (static, not copyable here) */}
        <MonoCode code="7318.15.00" size="lg" />

        <p className="max-w-[34ch] font-sans text-meta leading-snug text-ink-muted">
          Threaded bolts and screws of iron or steel, other.
        </p>

        {/* the one chromatic event, on its keyed wash. Word + meaning, no number. */}
        <div className="band-wash-high flex flex-col gap-1 rounded-md border px-3.5 py-3">
          <span className="font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-band-high">
            High confidence
          </span>
          <span className="font-sans text-meta leading-snug text-ink-muted">
            A clear, well-supported reading.
          </span>
        </div>

        {/* one verbatim citation line. Italic ONLY because it is quoted source. */}
        <div className="flex flex-col gap-1.5 border-t border-rule pt-3.5">
          <span className="font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
            Basis in the schedule
          </span>
          <blockquote className="m-0 border-l-[3px] border-accent-quiet pl-3 font-display opsz-citation text-meta italic leading-snug text-ink">
            Heading 7318: Screws, bolts, nuts ... of iron or steel.
          </blockquote>
        </div>
      </Surface>

      <figcaption className="mt-2.5 text-center font-sans text-meta text-ink-muted">
        A sample of what every classification returns. Not a live result.
      </figcaption>
    </figure>
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
