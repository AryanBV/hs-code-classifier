import type { Metadata } from "next";

import { PermalinkRecord } from "@/components/record/permalink-record";

interface RecordPageProps {
  // Next 16: params is a Promise and must be awaited.
  params: Promise<{ id: string }>;
}

/**
 * Generic, tasteful metadata for a shared record. The per-record code and band
 * are NOT server-available in this no-DB build, so the title/description stay
 * generic on purpose. The matching opengraph-image.tsx in this segment is
 * auto-detected and attached as og:image / twitter:image.
 *
 * When Supabase `shared_records` is provisioned, this can fetch the record by
 * id and produce a per-record title (e.g. the HS code) and OG image.
 */
export async function generateMetadata({
  params,
}: RecordPageProps): Promise<Metadata> {
  // Awaited even though the value is not used yet, to satisfy the Next 16
  // Promise contract and to be ready for a future by-id fetch.
  await params;

  const title = "Classification record";
  const description =
    "An ITC-HS export classification from Prevyl, with a cited rationale you can verify before filing.";

  return {
    title,
    description,
    openGraph: {
      type: "article",
      title: `${title} · Prevyl`,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · Prevyl`,
      description,
    },
  };
}

export default async function RecordPage({ params }: RecordPageProps) {
  const { id } = await params;

  return <PermalinkRecord id={id} />;
}
