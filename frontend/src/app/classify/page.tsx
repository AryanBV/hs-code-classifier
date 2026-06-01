import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ClassifyClient } from "@/components/result/classify-client";

export const metadata: Metadata = {
  title: "Classifying",
  description:
    "Prevyl is classifying your product against the Indian ITC-HS schedule and checking the result against the legal notes.",
  robots: { index: false, follow: false },
};

interface ClassifyPageProps {
  // Next 16: searchParams is a Promise and must be awaited.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ClassifyPage({ searchParams }: ClassifyPageProps) {
  const params = await searchParams;
  const raw = params.q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";

  if (!q) {
    redirect("/");
  }

  return <ClassifyClient query={q} />;
}
