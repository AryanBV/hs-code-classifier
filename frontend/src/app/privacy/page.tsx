import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RuleLine } from "@/components/ui/rule-line";
import { PageShell } from "@/components/layout/page-shell";
import { BRAND } from "@/lib/content";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Prevyl stores, and what it does not.",
};

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <RuleLine label={heading} />
      <p className="text-body leading-relaxed text-ink-muted">{children}</p>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <PageShell width="read" className="py-section">
      <article className="flex flex-col gap-section">
        <header className="flex flex-col gap-4">
          <p className="text-eyebrow uppercase text-ink-muted">Privacy</p>
          <h1 className="font-display text-title leading-[1.08] text-ink">
            We keep this simple.
          </h1>
          <p className="text-body leading-relaxed text-ink-muted">
            {BRAND} collects as little as it can to do the job, and it tells you plainly what that
            is. This is the short, honest version.
          </p>
        </header>

        <Section heading="No account needed">
          You can use {BRAND} without signing in. Your past classifications are saved only in your
          own browser, on your own device, so you can open them again later. Clearing your browser
          data clears them, and we never see them.
        </Section>

        <Section heading="What we send to classify">
          When you classify a product, the description you type is sent to our service to find the
          code, and a short technical log helps us keep the service running. Please do not put
          personal details in a product description, because you never need to.
        </Section>

        <Section heading="When accounts arrive">
          If you choose to create an account later, we will keep only what is needed to save your
          records and let you share them: your sign-in email and your saved classifications. Sharing
          a record is always your explicit choice, and a shared record carries no personal
          information. This follows India&apos;s Digital Personal Data Protection principles of
          collecting the minimum and being clear about it.
        </Section>

        <Section heading="Who holds this and how to reach us">
          {BRAND} is operated by Prevyl. If you want a record removed, or have any question about
          your data, write to{" "}
          <a
            href="mailto:hello@prevyl.com"
            className="text-accent-ink underline decoration-accent-quiet underline-offset-4 hover:decoration-accent"
          >
            hello@prevyl.com
          </a>{" "}
          and a person will take care of it.
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
