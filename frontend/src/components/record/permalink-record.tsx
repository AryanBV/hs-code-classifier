"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, ExternalLink, FileSearch } from "lucide-react";

import { Surface } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { ResultView } from "@/components/result/result-view";
import { PageShell } from "@/components/layout/page-shell";
import { getHistoryRecord, type HistoryRecord } from "@/lib/history";
import { formatGeneratedAt, makeRecordId } from "@/lib/record-id";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getAccountRecord } from "@/lib/account";

export interface PermalinkRecordProps {
  id: string;
}

/** The official DGFT ITC(HS)-based policy reference, for the reader to check against. */
const OFFICIAL_SCHEDULE_URL =
  "https://www.dgft.gov.in/CP/?opt=itchsbasedimportexportpolicy";

/** Calm skeleton shown until the local store is read on the client. */
function RecordSkeleton() {
  return (
    <div className="py-[clamp(18px,3vw,40px)]">
      <div className="mb-6 h-12 w-full max-w-[28rem] animate-pulse rounded-md bg-surface-sunk motion-reduce:animate-none" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,64%)_minmax(0,36%)]">
        <Surface variant="raised" className="h-[440px] animate-pulse opacity-60 motion-reduce:animate-none" />
        <Surface variant="sunk" className="h-[320px] animate-pulse opacity-60 motion-reduce:animate-none" />
      </div>
    </div>
  );
}

/**
 * Honest unavailable panel. A permalink is addressable for the owner on the
 * device that created it; it is NOT yet publicly shareable to others. So when a
 * record is not in this browser, we say exactly that, rather than implying the
 * link is broken or that someone else can open it.
 */
function RecordUnavailable({ id }: { id: string }) {
  return (
    <div className="flex min-h-[52vh] items-center justify-center py-[clamp(18px,3vw,40px)]">
      <Surface
        variant="raised"
        className="surface-grain flex w-full max-w-md flex-col items-center gap-6 px-8 py-14 text-center"
      >
        <span
          aria-hidden="true"
          className="grid size-14 place-items-center rounded-md border border-rule-strong bg-surface-sunk text-ink-muted sunk"
        >
          <FileSearch strokeWidth={1.6} className="size-6" />
        </span>
        <div className="flex flex-col gap-2.5">
          <p className="font-display text-section font-[number:var(--weight-section)] tracking-[var(--tracking-title)] text-ink">
            This record is not on this device.
          </p>
          <p className="font-sans text-body leading-relaxed text-ink-muted">
            Records currently live in the browser that created them, so this link
            opens for whoever made it, on the device they made it on. Public
            sharing of a record to anyone arrives when accounts are enabled.
          </p>
        </div>
        {/* Keep the requested id visible: the URL stays addressable for the owner. */}
        <p className="font-mono text-eyebrow tracking-[0.04em] text-ink-muted">
          {id}
        </p>
        <Button asChild variant="primary" size="md">
          <Link href="/">Classify a product</Link>
        </Button>
      </Surface>
    </div>
  );
}

/**
 * The record masthead above the reused ResultView. It names the artifact
 * honestly: a saved record, identified by its Record ID and the time it was
 * generated. No "shared / verified / public" claim — it is the owner's keepable
 * instrument, addressable by URL on this device.
 */
function RecordMasthead({ record }: { record: HistoryRecord }) {
  const recordId = makeRecordId(record.query, record.result.hsCode);
  const generatedAt = formatGeneratedAt(record.createdAt);

  return (
    <header className="mb-[clamp(16px,2.4vw,24px)]">
      <p className="mb-2 font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
        Saved record
      </p>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
        <span className="font-mono text-label tracking-[0.02em] text-ink">
          {recordId}
        </span>
        {generatedAt ? (
          <span className="inline-flex items-center gap-1.5 font-sans text-meta text-ink-muted">
            <CalendarDays aria-hidden="true" strokeWidth={1.7} className="size-3.5" />
            <time dateTime={new Date(record.createdAt).toISOString()}>{generatedAt}</time>
          </span>
        ) : null}
      </div>
    </header>
  );
}

/**
 * A quiet "check this yourself" footer in the record idiom. Inviting the reader
 * to verify against the official schedule is trust-building, and it keeps the
 * honesty promise that this is indicative, not authoritative.
 */
function VerifyFooter() {
  return (
    <Surface
      variant="sunk"
      className="mt-[clamp(20px,3vw,32px)] flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-[clamp(16px,2.4vw,22px)] py-4"
    >
      <p className="max-w-[56ch] font-sans text-meta leading-relaxed text-ink-muted">
        This is an indicative record. Confirm the code against your product and
        the official schedule before you file.
      </p>
      <a
        href={OFFICIAL_SCHEDULE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-1 font-sans text-meta font-semibold text-accent-ink underline-offset-4 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        Open the official ITC(HS) schedule
        <ExternalLink aria-hidden="true" strokeWidth={1.9} className="size-3.5" />
      </a>
    </Surface>
  );
}

/**
 * PermalinkRecord — renders a single classification record by id from the local
 * (localStorage) store. The store is browser-only, so we show a calm skeleton
 * until we have hydrated and read it, then either the full record (reusing
 * ResultView) or the honest "not on this device" panel.
 *
 * It owns its OWN PageShell rail (the layout no longer wraps page bodies), so
 * the masthead, record, and footer share the one shared gutter with the site
 * header and footer.
 *
 * TODO (DB): once Supabase `shared_records` is provisioned, the server component
 * for this route should ALSO try a public, PII-scrubbed fetch by id, so a link
 * resolves on any device; this local lookup then becomes the fast path / guest
 * fallback, and the masthead can drop "on this device".
 */
function PermalinkRecord({ id }: PermalinkRecordProps) {
  // Read the browser-only store via useSyncExternalStore: SSR returns null (so
  // we render the skeleton), then the client reads the record once. A per-id
  // cache keeps the snapshot referentially stable so React does not loop.
  const subscribe = React.useCallback(() => () => {}, []);
  const cacheRef = React.useRef<{ id: string; value: HistoryRecord | null } | null>(null);
  const getSnapshot = React.useCallback(() => {
    if (!cacheRef.current || cacheRef.current.id !== id) {
      cacheRef.current = { id, value: getHistoryRecord(id) };
    }
    return cacheRef.current.value;
  }, [id]);
  const getServerSnapshot = React.useCallback((): HistoryRecord | null => null, []);

  const hydrated = React.useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const localRecord = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Cloud fallback: when the record is not in THIS browser (e.g. after logout
  // cleared the local store, or on a second device), try the signed-in owner's
  // cloud copy by id. Possible because the cloud row carries the SAME id as the
  // local record; RLS scopes it to the owner. Fail-safe: any failure leaves
  // cloudRecord null and the honest "not on this device" panel shows as before.
  // State is set only inside the async callback, never in the effect body.
  const [cloudRecord, setCloudRecord] = React.useState<HistoryRecord | null>(null);
  const [cloudTried, setCloudTried] = React.useState(false);
  React.useEffect(() => {
    // Only reach for the cloud when local missed and Supabase is configured.
    if (localRecord || !isSupabaseConfigured()) return;
    let active = true;
    void getAccountRecord(id).then((rec) => {
      if (!active) return;
      setCloudRecord(rec);
      setCloudTried(true);
    });
    return () => {
      active = false;
    };
  }, [id, localRecord]);

  const record = localRecord ?? cloudRecord;

  if (!hydrated) {
    return (
      <PageShell width="wide">
        <RecordSkeleton />
      </PageShell>
    );
  }

  // Local missed but a cloud lookup is in flight (configured, not yet settled):
  // keep the calm skeleton rather than flashing "not on this device".
  if (!record && isSupabaseConfigured() && !cloudTried) {
    return (
      <PageShell width="wide">
        <RecordSkeleton />
      </PageShell>
    );
  }

  if (!record) {
    return (
      <PageShell width="wide">
        <RecordUnavailable id={id} />
      </PageShell>
    );
  }

  return (
    <PageShell width="wide" className="py-[clamp(18px,3vw,40px)]">
      <RecordMasthead record={record} />
      <ResultView
        record={{ id: record.id, query: record.query, result: record.result }}
      />
      <VerifyFooter />
    </PageShell>
  );
}

export { PermalinkRecord };
