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

// DRAFT COPY FOR FOUNDER REVIEW. Plain-language, DPDP-aware privacy notice for a
// free, pre-revenue tool. No legal entity or address is invented; review with a
// lawyer before treating this as a binding notice.

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
            {BRAND} collects as little as it can to do the job, and it tells you
            plainly what that is. Here is the short version.
          </p>
        </header>

        <Section heading="No account needed">
          You can use {BRAND} without signing in. Your past classifications are
          saved only in your own browser, on your own device, so you can open
          them again later. Clear your browser data and they are gone. We never
          see them.
        </Section>

        <Section heading="What we send to classify">
          When you classify a product, the description you type goes to our
          service to find the code. A short technical log helps us keep the
          service running. We use your product description to run the
          classification, and if you choose to send feedback on a result, we use
          that feedback to improve the service. We do not train any AI model on
          what you type. We do not sell your data. Please do not put personal
          details in a product description. You never need to.
        </Section>

        <Section heading="Cookies and tracking">
          We do not run analytics, advertising, or third-party tracking on this
          site. If you sign in, we use the essential cookies needed to keep you
          signed in for that session. That is all.
        </Section>

        <Section heading="When accounts arrive">
          If you create an account later, we will keep only what is needed to
          save your records and let you share them. That is your sign-in email
          and your saved classifications. Sharing a record is always your own
          choice, and a shared record carries no personal information. This
          follows India&apos;s Digital Personal Data Protection principles:
          collect the minimum, and be clear about it.
        </Section>

        <Section heading="Your rights, including deletion">
          Under India&apos;s Digital Personal Data Protection principles you can
          ask us what we hold about you, ask us to correct it, and ask us to
          delete it. There is no self-serve delete button yet; to remove an
          account, the saved classifications tied to it, and any feedback you
          sent, email us and a person will do it by hand. If you used {BRAND}{" "}
          without an account, your history lives only in your own browser, so
          clearing your browser data, or using the clear option on the history
          page, removes it yourself.
        </Section>

        <Section heading="Who holds this and how to reach us">
          {BRAND} is operated by Prevyl. If you want a record removed, want your
          data deleted, or have any question about your data, write to{" "}
          <a
            href="mailto:aryan@prevyl.com"
            className="text-accent-ink underline decoration-accent-quiet underline-offset-4 hover:decoration-accent"
          >
            aryan@prevyl.com
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
