"use client";

import * as React from "react";
import { Check, Copy, Download, Link2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UiClassification } from "@/lib/types";

export interface ResultActionsRecord {
  id?: string;
  query: string;
  result: UiClassification;
}

export interface ResultActionsProps {
  record: ResultActionsRecord;
}

/** Strip the dots from a dotted HS code, e.g. "7318.15.00" -> "73181500". */
function withoutDots(code: string): string {
  return code.replace(/\D/g, "");
}

/**
 * useRecordActions — the shared copy + PDF behaviour, used by both the margin
 * actions block (desktop) and the mobile sticky bar (C1/H11). Keeping the
 * clipboard + lazy PDF logic in one hook means the two surfaces never drift.
 */
function useRecordActions(record: ResultActionsRecord) {
  const code = record.result.hsCode;

  const [pdfBusy, setPdfBusy] = React.useState(false);
  const [copied, setCopied] = React.useState<null | "dotted" | "plain">(null);
  const copyTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const copyCode = React.useCallback(
    async (value: string, which: "dotted" | "plain") => {
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
          setCopied(which);
          if (copyTimer.current) clearTimeout(copyTimer.current);
          copyTimer.current = setTimeout(() => setCopied(null), 1600);
        } else {
          toast("Select the code to copy it.", { description: value });
        }
      } catch {
        toast("Select the code to copy it.", { description: value });
      }
    },
    [],
  );

  const onDownload = React.useCallback(async () => {
    setPdfBusy(true);
    try {
      const { generateAndDownloadPdf } = await import("@/lib/pdf");
      await generateAndDownloadPdf({ query: record.query, result: record.result });
    } catch {
      toast.error("We could not build the PDF just now. Please try again.");
    } finally {
      setPdfBusy(false);
    }
  }, [record]);

  return { code, pdfBusy, copied, copyCode, onDownload };
}

/**
 * ResultActions — the keep-this-record controls in the assessment margin.
 *
 * Honesty (audit P0 #4): we do NOT mint a "Share permalink" that dead-ends for
 * recipients. Records live only on this device until a signed-in account and
 * server-side shared records exist, so the share control is presented as a
 * disabled, clearly-reasoned "Sign in to publish" affordance. It never copies a
 * link and never toasts a success it cannot keep.
 *
 * - Copy code: the CHA's 30x/day micro-task. Copies the dotted code; a quiet
 *   second control copies it without dots. Always available, no network.
 * - Download PDF record: builds the formal record via @/lib/pdf (lazy import so
 *   @react-pdf/renderer never enters the result bundle until clicked). Works now.
 * - Publish a shareable link: disabled with a plain reason until sign-in lands.
 */
function ResultActions({ record }: ResultActionsProps) {
  const { code, pdfBusy, copied, copyCode, onDownload } = useRecordActions(record);

  return (
    <div className="flex flex-col gap-3">
      <p className="mb-0.5 font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
        Keep this record
      </p>

      {/* Copy the code — the load-bearing micro-task, always available. */}
      <div className="flex items-stretch gap-2">
        <Button
          variant="secondary"
          size="lg"
          layout="row"
          onClick={() => copyCode(code, "dotted")}
          className="flex-1"
          aria-label={copied === "dotted" ? `Copied ${code}` : `Copy code ${code}`}
        >
          <span className="flex items-center gap-2.5">
            {copied === "dotted" ? (
              <Check aria-hidden="true" strokeWidth={2} className="text-band-high" />
            ) : (
              <Copy aria-hidden="true" strokeWidth={1.9} />
            )}
            <span>{copied === "dotted" ? "Code copied" : "Copy the code"}</span>
          </span>
          <span className="font-mono text-meta text-ink-muted">{code}</span>
        </Button>
        <Button
          variant="ghost"
          size="lg"
          onClick={() => copyCode(withoutDots(code), "plain")}
          className="shrink-0 px-3 font-mono text-meta"
          aria-label={`Copy without dots, ${withoutDots(code)}`}
          title="Copy without dots (digits only)"
        >
          {copied === "plain" ? "Copied" : withoutDots(code)}
        </Button>
      </div>

      {/* Download the formal PDF record — works now, no account needed. */}
      <Button
        variant="primary"
        size="lg"
        layout="row"
        onClick={onDownload}
        loading={pdfBusy}
        className="w-full"
      >
        <span className="flex items-center gap-2.5">
          {!pdfBusy && <Download aria-hidden="true" strokeWidth={1.9} />}
          <span>{pdfBusy ? "Preparing PDF record" : "Download PDF record"}</span>
        </span>
      </Button>

      {/* Share — honestly gated. A link with no server record dead-ends for the
          recipient, so we do not mint or copy one. Disabled with a plain reason. */}
      <Button
        variant="secondary"
        size="lg"
        layout="row"
        disabled
        aria-disabled="true"
        className="w-full opacity-100 disabled:opacity-100"
        title="Available once you can sign in to publish records"
      >
        <span className="flex items-center gap-2.5 text-ink-muted">
          <Link2 aria-hidden="true" strokeWidth={1.9} />
          <span>Sign in to publish a shareable link</span>
        </span>
        <span className="font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
          Soon
        </span>
      </Button>

      <p className="mt-0.5 px-0.5 font-sans text-meta leading-relaxed text-ink-muted">
        <span className="font-semibold text-ink">Saved on this device.</span>{" "}
        A shareable link needs a signed-in account so the person you send it to can
        open it. That is coming. For now, the PDF travels anywhere.
      </p>

      {/* Aria-live confirmation for the copy micro-task (visually hidden). */}
      <span aria-live="polite" className="sr-only">
        {copied === "dotted"
          ? `Copied ${code}`
          : copied === "plain"
            ? `Copied ${withoutDots(code)}`
            : ""}
      </span>
    </div>
  );
}

/**
 * MobileActionBar — the sticky bottom action bar (C1/H11). On a long mobile
 * result, the CHA's two load-bearing tasks (Copy the code, Download the PDF)
 * are otherwise buried below the reasoning, alternatives, and expanders. This
 * pins them to the bottom of the viewport on `< lg` only; the desktop two-pane
 * keeps the actions in the margin and never renders this bar (`lg:hidden`).
 *
 * It honours the bottom safe-area inset so it clears the home indicator, and is
 * an opaque ruled ledger strip (no glass). Reuses the same copy + PDF logic as
 * the margin block via `useRecordActions`, so the two never diverge.
 */
function MobileActionBar({ record }: ResultActionsProps) {
  const { code, pdfBusy, copied, copyCode, onDownload } = useRecordActions(record);

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 lg:hidden",
        "border-t border-rule-strong bg-surface",
        // clear the iOS home indicator / gesture bar
        "pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5",
      )}
    >
      <div className="mx-auto flex w-full max-w-3xl items-stretch gap-2.5 px-4">
        <Button
          variant="secondary"
          size="lg"
          onClick={() => copyCode(code, "dotted")}
          className="flex-1"
          aria-label={copied === "dotted" ? `Copied ${code}` : `Copy code ${code}`}
        >
          <span className="flex items-center gap-2.5">
            {copied === "dotted" ? (
              <Check aria-hidden="true" strokeWidth={2} className="text-band-high" />
            ) : (
              <Copy aria-hidden="true" strokeWidth={1.9} />
            )}
            <span>{copied === "dotted" ? "Code copied" : "Copy code"}</span>
          </span>
        </Button>
        <Button
          variant="primary"
          size="lg"
          onClick={onDownload}
          loading={pdfBusy}
          className="flex-1"
          aria-label="Download PDF record"
        >
          <span className="flex items-center gap-2.5">
            {!pdfBusy && <Download aria-hidden="true" strokeWidth={1.9} />}
            <span>{pdfBusy ? "Preparing" : "PDF"}</span>
          </span>
        </Button>
      </div>
      {/* Aria-live confirmation for the copy micro-task (visually hidden). */}
      <span aria-live="polite" className="sr-only">
        {copied === "dotted"
          ? `Copied ${code}`
          : copied === "plain"
            ? `Copied ${withoutDots(code)}`
            : ""}
      </span>
    </div>
  );
}

export { ResultActions, MobileActionBar };
