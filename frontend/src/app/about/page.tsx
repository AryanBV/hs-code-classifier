import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RuleLine } from "@/components/ui/rule-line";
import { PageShell } from "@/components/layout/page-shell";
import { BRAND, TAGLINE } from "@/lib/content";

export const metadata: Metadata = {
  title: "About",
  description:
    "Prevyl returns an indicative 8-digit Indian ITC-HS export code with the legal basis shown, so you can check it before filing.",
};

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <RuleLine label={label} />
      <div className="flex flex-col gap-3 text-body leading-relaxed text-ink-muted">
        {children}
      </div>
    </section>
  );
}

// DRAFT COPY FOR FOUNDER REVIEW. Plain-language about page for a free,
// pre-revenue tool. No legal entity, address, or claims about a registered
// company are made; review before relying on it.
export default function AboutPage() {
  return (
    <PageShell width="read" className="py-section">
      <article className="flex flex-col gap-section">
        <header className="flex flex-col gap-4">
          <p className="text-eyebrow uppercase text-ink-muted">About {BRAND}</p>
          <h1 className="max-w-[18ch] font-display text-title leading-[1.08] text-ink">
            {TAGLINE}
          </h1>
          <p className="text-body leading-relaxed text-ink-muted">
            {BRAND} works like a careful customs clerk, not an oracle. It reads a plain description of
            your product, applies the legal rules, and gives you a record you can check. Then it tells
            you to verify before you file.
          </p>
        </header>

        <Section label="How Prevyl works">
          <p>
            You describe your product in plain words. {BRAND} reads the Indian ITC(HS) 2022 schedule,
            applies the General Interpretive Rules and the chapter and section notes, and proposes
            the 8-digit tariff line that best fits what you wrote.
          </p>
          <p>
            Every result shows its working: the rule it applied, the note or exclusion it relied on,
            and the text quoted from the schedule that the match rests on. It also lists the closest
            alternatives, because an honest answer often includes a near miss worth a second look.
            The reasoning is on screen so you can confirm the code against your actual product
            instead of taking it on faith.
          </p>
        </Section>

        <Section label="Where it can be wrong">
          <p>
            {BRAND} is an indicative tool. It is right far more often than not, but it is not always
            right, and it does not pretend to be. Two products that read alike in a sentence can sit
            on different tariff lines once you know the material, the grade, or the exact use, and a
            short description cannot always carry that.
          </p>
          <p>
            So every result comes with a confidence band in plain English, not a score dressed up as
            certainty. When the answer is uncertain, {BRAND} says so. Sometimes it asks one more
            question. Sometimes it narrows only to the 6-digit subheading and leaves the last two
            digits for you to confirm. We would rather tell you we are not sure than hand you a
            clean-looking code that is wrong.
          </p>
        </Section>

        <Section label="Who is behind it">
          <p>
            {BRAND} is built and run by Prevyl, a bootstrapped venture serving Indian exporters
            and customs brokers. It is free to use. If you spot a code that looks off, or want a
            shared record removed, write to{" "}
            <a
              href="mailto:hello@prevyl.com"
              className="text-accent-ink underline decoration-accent-quiet underline-offset-4 hover:decoration-accent"
            >
              hello@prevyl.com
            </a>{" "}
            and a person will read it.
          </p>
          <p>
            The final responsibility for a tariff line on a shipment rests with you and your licensed
            broker. That is the one line we put on every record: indicative classification, verify
            before filing.
          </p>
        </Section>

        <div className="mt-2">
          <Button asChild variant="primary" size="lg">
            <Link href="/">Classify a product</Link>
          </Button>
        </div>
      </article>
    </PageShell>
  );
}
