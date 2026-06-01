"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, FileSearch, Share2 } from "lucide-react";

import { Surface } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { ResultView } from "@/components/result/result-view";
import { getHistoryRecord, type HistoryRecord } from "@/lib/history";

export interface PermalinkRecordProps {
  id: string;
}

/** Stable, human date format that matches the history page. */
function formatDate(ms: number): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(ms));
  } catch {
    return "";
  }
}

/** The page-level container, shared by every state below. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1240px] px-[clamp(16px,4vw,44px)] py-[clamp(18px,3vw,40px)]">
      {children}
    </div>
  );
}

/** Calm skeleton shown until the local store is read on the client. */
function RecordSkeleton() {
  return (
    <Shell>
      <div className="mb-6 h-7 w-64 max-w-[70%] animate-pulse rounded-md bg-surface-sunk" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,62%)_minmax(0,38%)]">
        <Surface variant="raised" className="h-[420px] animate-pulse opacity-60" />
        <Surface variant="raised" className="h-[300px] animate-pulse opacity-60" />
      </div>
    </Shell>
  );
}

/** Graceful, non-alarming panel when the record is not on this device. */
function RecordUnavailable() {
  return (
    <Shell>
      <div className="flex min-h-[48vh] items-center justify-center">
        <Surface
          variant="raised"
          className="flex w-full max-w-md flex-col items-center gap-5 px-8 py-12 text-center"
        >
          <span
            aria-hidden="true"
            className="grid size-12 place-items-center rounded-full border border-rule bg-surface-sunk text-ink-muted"
          >
            <FileSearch strokeWidth={1.6} className="size-6" />
          </span>
          <div className="flex flex-col gap-2">
            <p className="font-display text-xl font-medium tracking-[0.005em] text-ink">
              This record is not available on this device.
            </p>
            <p className="max-w-sm text-sm leading-relaxed text-ink-muted">
              Records currently live in the browser that created them. Public
              sharing arrives when accounts are enabled.
            </p>
          </div>
          <Button asChild variant="primary" size="md">
            <Link href="/">Classify a product</Link>
          </Button>
        </Surface>
      </div>
    </Shell>
  );
}

/** The "shared record" banner above the reused ResultView. */
function SharedBanner({ createdAt }: { createdAt: number }) {
  const date = formatDate(createdAt);
  return (
    <Surface
      variant="sunk"
      className="mb-[clamp(16px,2.4vw,24px)] flex flex-wrap items-center gap-x-4 gap-y-2 px-[clamp(14px,2vw,20px)] py-3.5"
    >
      <span className="inline-flex items-center gap-2 font-sans text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-accent">
        <Share2 aria-hidden="true" strokeWidth={1.9} className="size-3.5" />
        Shared classification record
      </span>
      {date ? (
        <span className="inline-flex items-center gap-1.5 font-sans text-[0.8rem] text-ink-muted">
          <CalendarDays aria-hidden="true" strokeWidth={1.7} className="size-3.5" />
          {date}
        </span>
      ) : null}
    </Surface>
  );
}

/**
 * PermalinkRecord — renders a single classification record by id from the local
 * (localStorage) store. Because that store is browser-only, we show a calm
 * skeleton until we have hydrated and read it, then either the full record
 * (reusing ResultView) or a graceful "not on this device" panel.
 *
 * TODO (DB): once Supabase `shared_records` is provisioned, this page should
 * ALSO try a server fetch by id. The record page (server component) would fetch
 * the public, PII-scrubbed record and pass it down, so a link works on any
 * device; this local lookup then becomes the fast path / guest fallback.
 */
function PermalinkRecord({ id }: PermalinkRecordProps) {
  const [hydrated, setHydrated] = React.useState(false);
  const [record, setRecord] = React.useState<HistoryRecord | null>(null);

  React.useEffect(() => {
    setRecord(getHistoryRecord(id));
    setHydrated(true);
  }, [id]);

  if (!hydrated) {
    return <RecordSkeleton />;
  }

  if (!record) {
    return <RecordUnavailable />;
  }

  return (
    <Shell>
      <SharedBanner createdAt={record.createdAt} />
      <ResultView
        record={{ id: record.id, query: record.query, result: record.result }}
      />
    </Shell>
  );
}

export { PermalinkRecord };
