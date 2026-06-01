"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, FileText, Inbox, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { MonoCode } from "@/components/ui/mono-code";
import { ConfidenceBand } from "@/components/ui/confidence-band";
import { RuleLine } from "@/components/ui/rule-line";
import { clearHistory, listHistory, type HistoryRecord } from "@/lib/history";

/** Stable, human date format. No locale surprises across SSR/CSR boundaries. */
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

function descriptionOf(record: HistoryRecord): string {
  const desc = (record.result.description ?? "").trim();
  if (desc.length > 0) return desc;
  return record.result.isSixDigit
    ? "Subheading description not recorded for this line."
    : "Tariff-line description not recorded for this line.";
}

/** A single ledger row. Links to the permalink record at /r/{id}. */
function HistoryRow({ record }: { record: HistoryRecord }) {
  return (
    <li>
      <Link
        href={`/r/${record.id}`}
        className="group block rounded-md outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <Surface
          variant="raised"
          className="flex flex-col gap-4 p-[clamp(16px,2.2vw,22px)] transition-[border-color,box-shadow] duration-150 ease-[var(--ease-ledger)] group-hover:border-accent/35 sm:flex-row sm:items-center sm:gap-5"
        >
          {/* code + band */}
          <div className="flex min-w-0 shrink-0 flex-col gap-2 sm:w-[clamp(150px,22vw,200px)]">
            <MonoCode code={record.result.hsCode} size="lg" className="font-medium" />
            <ConfidenceBand band={record.result.confidenceBand} variant="chip" />
          </div>

          {/* query + description */}
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[1.02rem] font-normal italic text-ink">
              <span aria-hidden="true" className="text-accent">
                &ldquo;
              </span>
              {record.query}
              <span aria-hidden="true" className="text-accent">
                &rdquo;
              </span>
            </p>
            <p className="mt-1 line-clamp-2 font-sans text-[0.88rem] leading-relaxed text-ink-muted">
              {descriptionOf(record)}
            </p>
          </div>

          {/* date + affordance */}
          <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center sm:gap-2">
            <span className="font-sans text-[0.74rem] font-medium uppercase tracking-[0.12em] text-ink-muted">
              {formatDate(record.createdAt)}
            </span>
            <span className="inline-flex items-center gap-1.5 font-sans text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-accent opacity-80 transition-opacity group-hover:opacity-100">
              Open record
              <ArrowRight
                aria-hidden="true"
                strokeWidth={1.9}
                className="size-3.5 transition-transform duration-150 ease-[var(--ease-ledger)] group-hover:translate-x-0.5"
              />
            </span>
          </div>
        </Surface>
      </Link>
    </li>
  );
}

/** Honest empty state. */
function EmptyState() {
  return (
    <Surface
      variant="raised"
      className="flex flex-col items-center gap-5 px-8 py-14 text-center"
    >
      <span
        aria-hidden="true"
        className="grid size-12 place-items-center rounded-full border border-rule bg-surface-sunk text-ink-muted"
      >
        <Inbox strokeWidth={1.6} className="size-6" />
      </span>
      <div className="flex flex-col gap-2">
        <p className="font-display text-xl font-medium tracking-[0.005em] text-ink">
          You have not classified anything yet.
        </p>
        <p className="max-w-sm text-sm leading-relaxed text-ink-muted">
          Records you create live on this device. Classify a product and it will
          show up here, ready to reopen.
        </p>
      </div>
      <Button asChild variant="primary" size="md">
        <Link href="/">Classify a product</Link>
      </Button>
    </Surface>
  );
}

/**
 * History page. Reads the local (localStorage) record store. Because that store
 * is browser-only, we render a stable, content-free shell on the server and on
 * the first client paint, then hydrate the list in an effect. This avoids a
 * hydration mismatch (server has no records; the client may have many).
 *
 * Once Supabase `classifications` is provisioned, this list becomes the union of
 * the signed-in user's server records and any not-yet-migrated guest records.
 */
export default function HistoryPage() {
  const [hydrated, setHydrated] = React.useState(false);
  const [records, setRecords] = React.useState<HistoryRecord[]>([]);
  // Two-step confirm for the destructive clear, kept local and calm.
  const [confirmingClear, setConfirmingClear] = React.useState(false);

  React.useEffect(() => {
    setRecords(listHistory());
    setHydrated(true);
  }, []);

  // Reset the pending confirm if the list empties out from under it.
  React.useEffect(() => {
    if (records.length === 0) setConfirmingClear(false);
  }, [records.length]);

  const handleClear = React.useCallback(() => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    clearHistory();
    setRecords([]);
    setConfirmingClear(false);
    toast.success("History cleared", {
      description: "Records on this device have been removed.",
    });
  }, [confirmingClear]);

  const hasRecords = hydrated && records.length > 0;

  return (
    <div className="mx-auto w-full max-w-[920px] px-[clamp(16px,4vw,44px)] py-[clamp(20px,3vw,44px)]">
      {/* masthead */}
      <header className="mb-[clamp(20px,3vw,32px)]">
        <p className="mb-2.5 flex items-center gap-2.5 font-sans text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-muted">
          <span aria-hidden="true" className="h-px w-[18px] bg-accent" />
          On this device
        </p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 font-display text-[clamp(1.6rem,3.4vw,2.1rem)] font-medium tracking-[0.005em] text-ink">
              <FileText aria-hidden="true" strokeWidth={1.6} className="size-7 text-accent" />
              Your records
            </h1>
            <p className="mt-2 max-w-[52ch] font-sans text-[0.92rem] leading-relaxed text-ink-muted">
              Past classifications, kept in this browser. Open one to read the
              full cited record again.
            </p>
          </div>

          {hasRecords ? (
            <Button
              variant={confirmingClear ? "primary" : "secondary"}
              size="sm"
              onClick={handleClear}
              aria-label={
                confirmingClear ? "Confirm clearing all records" : "Clear history"
              }
            >
              <Trash2 aria-hidden="true" />
              {confirmingClear ? "Tap again to clear" : "Clear history"}
            </Button>
          ) : null}
        </div>
      </header>

      <RuleLine className="mb-[clamp(18px,2.4vw,26px)]" />

      {/* body: stable shell until hydrated, then list or empty state */}
      {!hydrated ? (
        <ul className="flex flex-col gap-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <Surface
                variant="raised"
                className="h-[104px] animate-pulse p-[clamp(16px,2.2vw,22px)] opacity-60"
              />
            </li>
          ))}
        </ul>
      ) : hasRecords ? (
        <ul className="flex flex-col gap-3">
          {records.map((record) => (
            <HistoryRow key={record.id} record={record} />
          ))}
        </ul>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
