"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Copy,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { MonoCode } from "@/components/ui/mono-code";
import { ConfidenceBand } from "@/components/ui/confidence-band";
import { RuleLine } from "@/components/ui/rule-line";
import {
  clearHistory,
  listHistory,
  saveHistory,
  type HistoryRecord,
} from "@/lib/history";
import { makeRecordId } from "@/lib/record-id";
import { PageShell } from "@/components/layout/page-shell";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { useUser } from "@/lib/supabase/use-user";
import { listAccountHistory } from "@/lib/account";

// ---------------------------------------------------------------------------
// History store adapter.
//
// We do NOT own lib/history.ts, so we wrap its public API (list / save / clear)
// in a tiny subscribable store local to this page. `useSyncExternalStore` reads
// it, which is the correct, SSR-safe, hydration-mismatch-free way to surface a
// browser-only store (the server snapshot is an empty list). A cached snapshot
// keeps the value referentially stable between mutations so React does not loop.
// ---------------------------------------------------------------------------

const EMPTY: HistoryRecord[] = [];

let cachedSnapshot: HistoryRecord[] | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  cachedSnapshot = null; // invalidate; next read recomputes from the store
  for (const fn of listeners) fn();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** Stable client snapshot: recomputed only after a mutation, else cached. */
function getSnapshot(): HistoryRecord[] {
  if (cachedSnapshot === null) cachedSnapshot = listHistory();
  return cachedSnapshot;
}

/** The store is empty on the server (localStorage is browser-only). */
function getServerSnapshot(): HistoryRecord[] {
  return EMPTY;
}

/**
 * Persist a full list as the new store contents, going only through the public
 * history API (delete/set-all are not exposed by lib/history.ts, which we do not
 * own here). `listHistory()` always re-sorts by `createdAt`, and each record
 * keeps its original timestamp, so the physical write order does not affect what
 * the user sees. Re-saving is idempotent: duplicates were already deduped on
 * first save. Emits so every subscriber re-reads.
 *
 * Known limit: saveHistory() mints a fresh storage id on each save, so survivors
 * get new ids after a rewrite. In-session links always use the live id, and the
 * display Record ID (makeRecordId) is deterministic from query+code, so this is
 * invisible to the user. A previously-copied /r/{id} to a survivor degrades to
 * the graceful "not on this device" panel. FOLLOW-UP for the lib owner: add a
 * `deleteHistoryRecord(id)` / `setHistory(list)` so rewrites preserve ids.
 */
function persistList(records: HistoryRecord[]): void {
  clearHistory();
  // Oldest first so the prepend in saveHistory leaves newest at the head.
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const r = records[i];
    saveHistory(r.query, r.result, r.createdAt);
  }
  emit();
}

/** Remove one record by id, persist, and notify. */
function removeOne(id: string): void {
  persistList(getSnapshot().filter((r) => r.id !== id));
}

/** Clear everything, persist, and notify. */
function clearAll(): void {
  clearHistory();
  emit();
}

// ---- Client snapshots (canonical useSyncExternalStore idiom) ----
function noopSubscribe(): () => void {
  return () => {};
}
function getIsClient(): boolean {
  return true;
}
function getIsServer(): boolean {
  return false;
}

/**
 * The start of "today", read through useSyncExternalStore so Date.now() never
 * runs during render. Cached on first client read so the snapshot is stable
 * (otherwise React would loop). Server snapshot is 0; grouping only renders
 * post-hydration, so that placeholder is never seen.
 */
let cachedNowDay = 0;
function getClientNowDay(): number {
  if (cachedNowDay === 0) cachedNowDay = startOfDay(Date.now());
  return cachedNowDay;
}
function getServerNowDay(): number {
  return 0;
}

/** Stable, human date. en-GB avoids SSR/CSR locale drift. */
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

// ---------------------------------------------------------------------------
// Date grouping — cheap, deterministic buckets so a long ledger stays scannable.
// ---------------------------------------------------------------------------

type GroupKey = "today" | "yesterday" | "week" | "earlier";

const GROUP_LABEL: Record<GroupKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "Earlier this week",
  earlier: "Earlier",
};

const GROUP_ORDER: GroupKey[] = ["today", "yesterday", "week", "earlier"];

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function groupOf(createdAt: number, nowDay: number): GroupKey {
  const day = startOfDay(createdAt);
  const dayMs = 86_400_000;
  if (day >= nowDay) return "today";
  if (day >= nowDay - dayMs) return "yesterday";
  if (day >= nowDay - dayMs * 6) return "week";
  return "earlier";
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

/**
 * A single ledger row. The whole row links to the permalink record at /r/{id};
 * the per-row copy / re-run / delete controls sit on top as real buttons (they
 * stop the link navigation). The HS code anchors a fixed-width left column so
 * every code shares one left edge down the page, the way a ledger reads.
 */
function HistoryRow({
  record,
  onCopy,
  onDelete,
  copied,
}: {
  record: HistoryRecord;
  onCopy: (record: HistoryRecord) => void;
  onDelete: (record: HistoryRecord) => void;
  copied: boolean;
}) {
  const recordId = makeRecordId(record.query, record.result.hsCode);
  const rerunHref = `/classify?q=${encodeURIComponent(record.query)}`;

  return (
    <li className="group/row relative">
      <Surface
        variant="raised"
        className={cn(
          "relative grid grid-cols-1 gap-x-5 gap-y-3 p-card",
          "transition-[border-color] duration-150 ease-[var(--ease-ledger)]",
          "group-focus-within/row:border-accent/40 group-hover/row:border-accent/35",
          "sm:grid-cols-[clamp(150px,20vw,184px)_minmax(0,1fr)]",
        )}
      >
        {/* Stretched link: covers the whole row so any empty area opens it. It
            sits above the static text (z-[1]) and below the controls (z-[2]). */}
        <Link
          href={`/r/${record.id}`}
          aria-label={`Open record ${recordId}: ${record.result.hsCode}`}
          className="absolute inset-0 z-[1] rounded-md outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        />
        {/* code + band — the fixed left column */}
        <div className="flex min-w-0 flex-col gap-2">
          <MonoCode code={record.result.hsCode} size="lg" className="font-medium" />
          <ConfidenceBand band={record.result.confidenceBand} variant="chip" />
        </div>

        {/* query + description — the readable middle */}
        <div className="min-w-0">
          <p className="truncate font-sans text-body font-medium text-ink">
            {record.query}
          </p>
          <p className="mt-1 line-clamp-2 font-sans text-meta leading-relaxed text-ink-muted">
            {descriptionOf(record)}
          </p>

          {/* meta line: record id + date, then the open affordance on hover */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="font-mono text-eyebrow tracking-[0.02em] text-ink-muted">
              {recordId}
            </span>
            <span aria-hidden="true" className="h-3 w-px bg-rule" />
            <time
              dateTime={new Date(record.createdAt).toISOString()}
              className="font-sans text-eyebrow tracking-[0.04em] text-ink-muted"
            >
              {formatDate(record.createdAt)}
            </time>
            <span
              aria-hidden="true"
              className="ml-auto hidden items-center gap-1 font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-accent-ink opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 group-focus-within/row:opacity-100 sm:inline-flex"
            >
              Open record
              <ArrowRight strokeWidth={1.9} className="size-3.5" />
            </span>
          </div>
        </div>

        {/* per-row controls — above the stretched link (z-[2]), real buttons */}
        <div className="relative z-[2] col-span-full -mt-1 flex items-center gap-1 border-t border-rule pt-3 sm:col-start-2 sm:mt-2 sm:border-t-0 sm:pt-0">
          <RowAction
            label={copied ? "Copied" : "Copy code"}
            onClick={() => onCopy(record)}
            active={copied}
          >
            {copied ? (
              <Check aria-hidden="true" strokeWidth={2} className="size-4 text-ink" />
            ) : (
              <Copy aria-hidden="true" strokeWidth={1.8} className="size-4" />
            )}
            <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
          </RowAction>

          <Link
            href={rerunHref}
            className={cn(
              "relative inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 py-1.5",
              "font-sans text-meta font-medium text-ink-muted",
              "transition-colors hover:bg-[color-mix(in_oklab,var(--accent)_9%,var(--surface))] hover:text-accent-ink",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
            )}
          >
            <RotateCcw aria-hidden="true" strokeWidth={1.8} className="size-4" />
            <span className="hidden sm:inline">Run again</span>
          </Link>

          <RowAction
            label="Delete record"
            onClick={() => onDelete(record)}
            className="ml-auto hover:text-band-low"
          >
            <Trash2 aria-hidden="true" strokeWidth={1.8} className="size-4" />
            <span className="sr-only">Delete</span>
          </RowAction>
        </div>
      </Surface>
    </li>
  );
}

/** A quiet ledger control sitting above the row link. */
function RowAction({
  label,
  onClick,
  active,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "relative inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 py-1.5",
        "font-sans text-meta font-medium",
        active ? "text-ink" : "text-ink-muted",
        "transition-colors hover:bg-[color-mix(in_oklab,var(--accent)_9%,var(--surface))] hover:text-accent-ink",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Empty / no-results states
// ---------------------------------------------------------------------------

/** The teaching "blank ledger" empty state. */
function EmptyState() {
  return (
    <Surface
      variant="raised"
      className="surface-grain flex flex-col items-center gap-6 px-8 py-16 text-center"
    >
      <BlankLedgerMark />
      <div className="flex max-w-sm flex-col gap-2.5">
        <p className="font-display text-section font-[number:var(--weight-section)] tracking-[var(--tracking-title)] text-ink">
          Your ledger is empty.
        </p>
        <p className="font-sans text-body leading-relaxed text-ink-muted">
          Every product you classify is written here, on this device. Open one
          later to read its full cited record or download it again.
        </p>
      </div>
      <Button asChild variant="primary" size="md">
        <Link href="/">Classify a product</Link>
      </Button>
    </Surface>
  );
}

/** Shown when a search excludes everything. */
function NoMatches({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <Surface variant="sunk" className="flex flex-col items-center gap-4 px-8 py-12 text-center">
      <p className="font-sans text-body text-ink">
        No records match{" "}
        <span className="font-mono text-meta text-accent-ink">&ldquo;{query}&rdquo;</span>.
      </p>
      <Button variant="secondary" size="sm" onClick={onClear}>
        Clear search
      </Button>
    </Surface>
  );
}

/** A small archival mark for the blank ledger — a ruled corner, no checkmark. */
function BlankLedgerMark() {
  return (
    <span
      aria-hidden="true"
      className="grid size-14 place-items-center rounded-md border border-rule-strong bg-surface-sunk text-ink-muted sunk"
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-7">
        <path
          d="M6 4.5h9L18.5 8v11.5H6z"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <path d="M9 11h6M9 14h6M9 8h3" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
      </svg>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * History — the CHA workspace. Reads the local (localStorage) record store.
 * That store is browser-only, so we render a stable, content-free shell on the
 * server and on first client paint, then hydrate the list in an effect to avoid
 * a hydration mismatch.
 *
 * It is a scannable ledger: a fixed code column, a band chip, the typed query
 * as data (not a pull-quote), the record id and date, per-row copy / run-again
 * / delete, date-group headers, a cheap search filter, an Undo toast on every
 * destructive action, and a teaching empty state.
 *
 * Once Supabase `classifications` is provisioned, this list becomes the union
 * of the signed-in user's server records and any not-yet-migrated guest records.
 */
export default function HistoryPage() {
  // The persisted list and "are we on the client yet" both come from the store
  // via useSyncExternalStore: SSR-safe, no hydration mismatch, no setState in an
  // effect. Mutations write through the lib and emit(); React re-reads.
  const records = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = React.useSyncExternalStore(noopSubscribe, getIsClient, getIsServer);
  const nowDay = React.useSyncExternalStore(noopSubscribe, getClientNowDay, getServerNowDay);

  // Cloud records for the signed-in user. Display-only: these are MERGED with the
  // local store for rendering, but every mutation (delete / clear) still operates
  // on the local store alone. When signed out / unconfigured this stays [], so the
  // displayed list is exactly the local list (no behaviour change). Fetched in an
  // effect; state is set only inside the async callback (never in the effect body).
  const { user } = useUser();
  // Depend on the user IDENTITY, not the object ref: onAuthStateChange hands us a
  // fresh `session.user` object on every TOKEN_REFRESHED, so keying effects on the
  // object would re-fire on routine token churn. The id only changes on a real
  // identity change (sign-in / switch / sign-out), which is exactly when we must
  // re-read the (possibly just-cleared) local store.
  const userId = user?.id ?? null;
  const [cloudRecords, setCloudRecords] = React.useState<HistoryRecord[]>([]);

  // Fetch the signed-in user's cloud records. State is set ONLY inside the async
  // callback (never synchronously in the effect body, per react-hooks/set-state-in-
  // effect). On sign-out we do NOT clear here; instead the union below ignores
  // cloudRecords whenever there is no user, so the displayed list drops the cloud
  // rows immediately and they are refreshed on the next sign-in.
  React.useEffect(() => {
    if (!isSupabaseConfigured() || !user) return;
    let active = true;
    void listAccountHistory().then((rows) => {
      if (active) setCloudRecords(rows);
    });
    return () => {
      active = false;
    };
  }, [user]);

  // Re-read the local store whenever the auth user changes. Sign-out clears the
  // device-global local history (lib/supabase/use-user.ts, gated on SIGNED_OUT)
  // to close the cross-account leak; that write happens OUTSIDE this page, so the
  // cached snapshot would otherwise linger on screen until the next mutation or
  // reload. emit() invalidates the cache and notifies useSyncExternalStore so the
  // cleared list is reflected immediately. Data-source sync only — no visual change.
  // Keyed on the user IDENTITY (userId) not the object ref, so it fires only on a
  // real identity change (incl. after a sentinel-driven clear), not on every
  // TOKEN_REFRESHED object churn.
  React.useEffect(() => {
    emit();
  }, [userId]);

  // The DISPLAYED list: union of local + cloud, de-duped by (query + hsCode),
  // newest first. Cloud rows count only while a user is present; otherwise this
  // equals the local list exactly (no behaviour change signed-out / unconfigured).
  const effectiveCloud = user ? cloudRecords : EMPTY;
  const displayRecords = React.useMemo(() => {
    if (effectiveCloud.length === 0) return records;
    const seen = new Set<string>();
    const merged: HistoryRecord[] = [];
    // Local first so a local record's live id (used by /r/{id} this session) wins
    // the de-dupe for an identical (query, code) pair.
    for (const r of [...records, ...effectiveCloud]) {
      const key = `${r.query}::${r.result.hsCode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(r);
    }
    return merged.sort((a, b) => b.createdAt - a.createdAt);
  }, [records, effectiveCloud]);

  const [search, setSearch] = React.useState("");
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  // Two-step confirm for the destructive clear, kept local and calm.
  const [confirmingClear, setConfirmingClear] = React.useState(false);
  const copyTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const handleCopy = React.useCallback((record: HistoryRecord) => {
    const code = record.result.hsCode;
    const done = () => {
      setCopiedId(record.id);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedId(null), 1600);
    };
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(done).catch(() => {
        toast.error("Could not copy the code. You can select it on the record page.");
      });
    } else {
      toast.message("Copy is unavailable here", { description: code });
    }
  }, []);

  const handleDelete = React.useCallback((record: HistoryRecord) => {
    removeOne(record.id);
    toast("Record removed", {
      description: record.result.hsCode,
      action: {
        label: "Undo",
        onClick: () => {
          // Re-insert the removed record, then re-sort by recency.
          const merged = [record, ...getSnapshot().filter((r) => r.id !== record.id)].sort(
            (a, b) => b.createdAt - a.createdAt,
          );
          persistList(merged);
        },
      },
    });
  }, []);

  const handleClear = React.useCallback(() => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    setConfirmingClear(false);
    const removed = getSnapshot();
    clearAll();
    toast("History cleared", {
      description: `${removed.length} record${removed.length === 1 ? "" : "s"} removed from this device.`,
      action: {
        label: "Undo",
        onClick: () => persistList(removed),
      },
    });
  }, [confirmingClear]);

  // Cheap client-side filter over code, query and description.
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return displayRecords;
    return displayRecords.filter((r) => {
      const haystack = `${r.result.hsCode} ${r.query} ${r.result.description ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [displayRecords, search]);

  // Group the (already date-sorted) filtered list into date buckets.
  const groups = React.useMemo(() => {
    const map = new Map<GroupKey, HistoryRecord[]>();
    for (const r of filtered) {
      const key = groupOf(r.createdAt, nowDay);
      const bucket = map.get(key);
      if (bucket) bucket.push(r);
      else map.set(key, [r]);
    }
    return GROUP_ORDER.filter((k) => map.has(k)).map((k) => ({
      key: k,
      label: GROUP_LABEL[k],
      records: map.get(k) as HistoryRecord[],
    }));
  }, [filtered, nowDay]);

  const hasRecords = hydrated && displayRecords.length > 0;
  const countLabel = `${displayRecords.length} record${displayRecords.length === 1 ? "" : "s"}`;

  return (
    <PageShell width="wide" className="py-[clamp(20px,3vw,44px)]">
      {/* masthead */}
      <header className="mb-[clamp(18px,2.6vw,28px)]">
        <p className="mb-2 font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
          On this device
        </p>
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <h1 className="font-display text-title font-[number:var(--weight-title)] tracking-[var(--tracking-title)] text-ink">
            Your records
          </h1>
          {hasRecords ? (
            <span className="font-mono text-meta text-ink-muted">{countLabel}</span>
          ) : null}
        </div>
        <p className="mt-2 max-w-[54ch] font-sans text-meta leading-relaxed text-ink-muted">
          Past classifications, kept in this browser. Open one to read its full
          cited record again, or run it through afresh.
        </p>
      </header>

      {/* toolbar: search + clear. Only when there is something to work with. */}
      {hasRecords ? (
        <div className="mb-[clamp(16px,2.2vw,22px)] flex flex-wrap items-center gap-3">
          <div className="relative min-w-[12rem] flex-1 sm:max-w-md">
            <Search
              aria-hidden="true"
              strokeWidth={1.8}
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code, product or description"
              aria-label="Search your records"
              className={cn(
                "h-11 w-full rounded-md border border-rule-strong bg-surface pl-9 pr-9",
                "font-sans text-meta text-ink placeholder:text-ink-muted",
                "transition-[border-color] duration-150 ease-[var(--ease-ledger)]",
                "focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              )}
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <X aria-hidden="true" strokeWidth={1.9} className="size-4" />
              </button>
            ) : null}
          </div>

          <Button
            variant={confirmingClear ? "primary" : "secondary"}
            size="sm"
            onClick={handleClear}
            aria-label={
              confirmingClear ? "Confirm clearing all records" : "Clear all records"
            }
          >
            <Trash2 aria-hidden="true" />
            {confirmingClear ? "Tap again to clear" : "Clear all"}
          </Button>
        </div>
      ) : null}

      <RuleLine className="mb-[clamp(16px,2.2vw,24px)]" />

      {/* body: stable shell until hydrated, then list / empty / no-matches */}
      {!hydrated ? (
        <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <li key={i}>
              <Surface
                variant="raised"
                className="h-[112px] animate-pulse p-card opacity-60 motion-reduce:animate-none"
              />
            </li>
          ))}
        </ul>
      ) : !hasRecords ? (
        <EmptyState />
      ) : filtered.length === 0 ? (
        <NoMatches query={search.trim()} onClear={() => setSearch("")} />
      ) : (
        <div className="flex flex-col gap-[clamp(20px,3vw,32px)]">
          {groups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h2 className="mb-3 flex items-baseline gap-3">
                <span className="font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
                  {group.label}
                </span>
                <span aria-hidden="true" className="h-px flex-1 -translate-y-[0.18em] bg-rule" />
                <span className="font-mono text-eyebrow text-ink-muted">
                  {group.records.length}
                </span>
              </h2>
              {/* On desktop the records open out into a two-up grid so a long
                  ledger uses the page width instead of a single narrow column;
                  mobile and tablet stay single-column. Each row's own internal
                  two-column layout (code rail + readable middle) keeps a cell
                  comfortable at this width. */}
              <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {group.records.map((record) => (
                  <HistoryRow
                    key={record.id}
                    record={record}
                    onCopy={handleCopy}
                    onDelete={handleDelete}
                    copied={copiedId === record.id}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}
