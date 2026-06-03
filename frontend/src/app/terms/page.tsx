import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RuleLine } from "@/components/ui/rule-line";
import { PageShell } from "@/components/layout/page-shell";
import { BRAND } from "@/lib/content";

export const metadata: Metadata = {
  title: "Terms",
  description: "The plain terms for using Prevyl, a free indicative ITC-HS classifier.",
};

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <RuleLine label={heading} />
      <div className="flex flex-col gap-3 text-body leading-relaxed text-ink-muted">
        {children}
      </div>
    </section>
  );
}

// DRAFT COPY FOR FOUNDER REVIEW. Plain-language, non-committal terms for a free,
// pre-revenue tool. No legal entity, address, or jurisdiction is invented; review
// with a lawyer before relying on this as a binding agreement.
export default function TermsPage() {
  return (
    <PageShell width="read" className="py-section">
      <article className="flex flex-col gap-section">
        <header className="flex flex-col gap-4">
          <p className="text-eyebrow uppercase text-ink-muted">Terms of use</p>
          <h1 className="font-display text-title leading-[1.08] text-ink">
            The honest terms.
          </h1>
          <p className="text-body leading-relaxed text-ink-muted">
            {BRAND} is a free tool that gives indicative Indian ITC-HS export
            codes. By using it you agree to the points below. They are short
            and plain.
          </p>
        </header>

        <Section heading="What Prevyl is">
          {BRAND} reads a plain description of your product and proposes an
          8-digit Indian ITC(HS) tariff line, with the legal basis shown so you
          can check it. The result is AI-generated and indicative. Treat it as a
          starting point for your own work, not a finished classification.
        </Section>

        <Section heading="What Prevyl is not">
          <p>
            {BRAND} is not official customs or legal advice, and it is not a
            substitute for a licensed customs broker, a customs authority, or
            your own professional judgement. It does not file anything for you
            and does not represent you to any authority.
          </p>
          <p>
            The final call on the tariff line for a shipment, and on any duty,
            policy condition, or licence that applies, rests with you and your
            licensed broker. Always check a code against your actual product,
            and against the official ITC(HS) schedule and current DGFT policy,
            before you file.
          </p>
        </Section>

        <Section heading="No warranty">
          {BRAND} is provided as is, free of charge, with no warranty of any
          kind. We do not promise that a result is accurate, complete, current,
          or fit for a particular shipment. The service may change or be
          unavailable at any time.
        </Section>

        <Section heading="Limitation of liability">
          To the maximum extent the law allows, {BRAND} and the people behind it
          are not liable for any loss, penalty, delay, or damage that comes from
          your use of the tool or from relying on a result, including a code
          that turns out to be wrong. You use it at your own discretion, and you
          confirm important decisions with a qualified professional.
        </Section>

        <Section heading="Acceptable use">
          Use {BRAND} for genuine product classification. Do not put personal or
          sensitive details in a product description, do not attempt to overload
          or abuse the service, and do not use it for anything unlawful.
        </Section>

        <Section heading="Your data">
          How we handle the small amount of data {BRAND} collects is set out in
          the{" "}
          <Link
            href="/privacy"
            className="text-accent-ink underline decoration-accent-quiet underline-offset-4 hover:decoration-accent"
          >
            Privacy notice
          </Link>
          . In short: we collect as little as we can, use it only to run and
          improve the service, do not sell it, and you can ask us to delete it.
        </Section>

        <Section heading="Changes and contact">
          These terms may change as the tool grows; the current version always
          lives on this page. If anything here is unclear, or you want a record
          removed, write to{" "}
          <a
            href="mailto:aryan@prevyl.com"
            className="text-accent-ink underline decoration-accent-quiet underline-offset-4 hover:decoration-accent"
          >
            aryan@prevyl.com
          </a>{" "}
          and a person will read it.
        </Section>

        <div className="mt-2">
          <Button asChild variant="secondary" size="lg">
            <Link href="/">Back to {BRAND}</Link>
          </Button>
        </div>
      </article>
    </PageShell>
  );
}
