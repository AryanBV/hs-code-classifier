import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RuleLine } from "@/components/ui/rule-line";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Prevyl stores, and what it does not.",
};

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-xl text-ink">{heading}</h2>
      <p className="text-[1.01rem] leading-relaxed text-ink-muted">{children}</p>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-14 sm:px-8 sm:py-20">
      <article className="flex flex-col gap-7">
        <div className="flex flex-col gap-3">
          <p className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink-muted">
            Privacy
          </p>
          <h1 className="font-display text-4xl leading-[1.08] text-ink">
            We keep this simple.
          </h1>
          <RuleLine />
        </div>

        <Section heading="No account needed">
          You can use Prevyl without signing in. Your past classifications are saved only in your own
          browser, on your own device, so you can open them again later. Clearing your browser data
          clears them.
        </Section>

        <Section heading="What we send to classify">
          When you classify a product, the description you type is sent to our service to find the
          code, and a short technical log helps us keep the service running. Please do not include
          personal details in a product description, since you do not need to.
        </Section>

        <Section heading="When accounts arrive">
          If you choose to create an account in the future, we will keep only what is needed to save
          your records and let you share them: your sign-in email and your saved classifications.
          Sharing a record is always your explicit choice, and a shared record carries no personal
          information. This is in keeping with India's Digital Personal Data Protection principles of
          collecting the minimum and being clear about it.
        </Section>

        <Section heading="Questions">
          If you want a record removed or have a question, reach out and we will take care of it.
        </Section>

        <div className="mt-2">
          <Button asChild variant="secondary" size="lg">
            <Link href="/">Back to Prevyl</Link>
          </Button>
        </div>
      </article>
    </div>
  );
}
