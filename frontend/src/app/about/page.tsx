import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RuleLine } from "@/components/ui/rule-line";

export const metadata: Metadata = {
  title: "About",
  description:
    "Prevyl returns the correct 8-digit Indian ITC-HS export code with the legal basis shown, so you can verify it before filing.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-14 sm:px-8 sm:py-20">
      <article className="flex flex-col gap-6">
        <p className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink-muted">
          About Prevyl
        </p>
        <h1 className="max-w-[18ch] font-display text-4xl leading-[1.08] text-ink sm:text-5xl">
          Classification you can check, not just trust.
        </h1>
        <RuleLine />
        <p className="text-[1.02rem] leading-relaxed text-ink-muted">
          Prevyl reads a plain description of your product and returns the correct 8-digit Indian
          ITC-HS export code. With every result it shows the basis for the code: the chapter and
          section notes it relied on, the General Interpretive Rule it applied, and the close
          alternatives worth a second look.
        </p>
        <p className="text-[1.02rem] leading-relaxed text-ink-muted">
          It is built for Indian exporters and customs brokers who want a fast, well-reasoned
          starting point rather than a black-box answer. Because the reasoning is on screen, you can
          confirm the code against your actual product before you file it.
        </p>
        <p className="text-[1.02rem] leading-relaxed text-ink-muted">
          Every result is indicative. Prevyl is free to use, and the final responsibility for a
          tariff line on a shipment always rests with you and your licensed broker. That is why the
          honest line sits on every record: verify before filing.
        </p>
        <div className="mt-2">
          <Button asChild variant="primary" size="lg">
            <Link href="/">Classify a product</Link>
          </Button>
        </div>
      </article>
    </div>
  );
}
