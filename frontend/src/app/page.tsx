import type { Metadata } from "next";

import { LandingForm } from "@/components/landing/landing-form";
import { VALUE_PROP, VALUE_SUB, TRUST_POINTS } from "@/lib/content";

export const metadata: Metadata = {
  title: "The right ITC-HS export code, with a rationale you can verify",
  description:
    "Describe your product and Prevyl finds the correct 8-digit Indian ITC-HS export code, with the chapter, heading and legal basis cited so you can verify it before filing. Free to use.",
  alternates: { canonical: "/" },
};

/**
 * Landing / input screen — the first impression and the brand moment.
 * A single-purpose instrument, idle and inviting: a centered hero, the ledger
 * field, real example chips, and an honest trust strip. Server component; the
 * interactive field lives in <LandingForm/>.
 */
export default function Home() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1240px] flex-col px-4 sm:px-8 lg:px-11">
      <section
        aria-label="Classify a product"
        className="flex flex-1 flex-col items-center justify-center py-8 sm:py-12 lg:py-16"
      >
        {/* ---- Hero copy ---- */}
        <div className="w-full max-w-[48rem] text-center">
          <p className="prevyl-settle mb-5 inline-flex items-center gap-2.5 font-sans text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-ink-muted">
            <span aria-hidden="true" className="h-px w-5 bg-accent" />
            Indian ITC-HS · 8-digit
            <span aria-hidden="true" className="h-px w-5 bg-accent" />
          </p>

          <h1
            className="prevyl-settle prevyl-d1 mx-auto max-w-[18ch] text-balance font-display text-[clamp(2.15rem,4.4vw,3.5rem)] font-normal leading-[1.06] tracking-[-0.012em] text-ink"
          >
            {VALUE_PROP}
          </h1>

          <p className="prevyl-settle prevyl-d2 mx-auto mt-4 max-w-[50ch] text-balance font-sans text-[clamp(1rem,1.6vw,1.14rem)] leading-relaxed text-ink-muted">
            {VALUE_SUB}
          </p>
        </div>

        {/* ---- The ledger field + examples ---- */}
        <div className="prevyl-settle prevyl-d3 mt-9 w-full max-w-[48rem] sm:mt-11">
          <LandingForm />
        </div>

        {/* ---- Trust strip: quiet, honest, no hype ---- */}
        <div className="prevyl-settle prevyl-d4 mt-10 w-full max-w-[48rem] border-t border-rule pt-6 sm:mt-12">
          <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2.5 text-[0.82rem] text-ink-muted sm:gap-x-5">
            {TRUST_POINTS.map((point, i) => (
              <li key={point} className="inline-flex items-center gap-2">
                {i > 0 && (
                  <span aria-hidden="true" className="text-rule">
                    ·
                  </span>
                )}
                <CheckIcon className="size-[0.9rem] shrink-0 text-accent opacity-85" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-center text-[0.78rem] text-ink-muted">
            <span className="font-semibold text-accent-ink">
              Built for Indian exporters and customs brokers.
            </span>{" "}
            Every code comes with the chapter, heading and legal basis behind it.
          </p>
        </div>
      </section>

      {/* Entrance-only motion. Reduced-motion is neutralized globally in globals.css. */}
      <style>{settleStyles}</style>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
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

const settleStyles = `
.prevyl-settle {
  animation: prevyl-settle 0.5s var(--ease-ledger) both;
}
.prevyl-d1 { animation-delay: 0.05s; }
.prevyl-d2 { animation-delay: 0.12s; }
.prevyl-d3 { animation-delay: 0.18s; }
.prevyl-d4 { animation-delay: 0.3s; }
@keyframes prevyl-settle {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}
`;
