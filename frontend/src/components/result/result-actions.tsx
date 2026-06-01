"use client";

import * as React from "react";
import { Download, Link2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { UiClassification } from "@/lib/types";
import { saveHistory } from "@/lib/history";

export interface ResultActionsRecord {
  id?: string;
  query: string;
  result: UiClassification;
}

export interface ResultActionsProps {
  record: ResultActionsRecord;
}

/**
 * ResultActions — the gated artifacts in the assessment margin. Both actions
 * work locally for this no-DB build; the "Sign in" hint is the soft gate the
 * locked decision (D6/B) asks for. The full rationale record above stays free.
 *
 * - Download PDF record: builds a formal certificate via @/lib/pdf (lazy import
 *   so @react-pdf/renderer never enters the result bundle until clicked).
 * - Share permalink: ensures the record has an id (via saveHistory), then copies
 *   an absolute "/r/{id}" URL to the clipboard and confirms with a toast.
 */
function ResultActions({ record }: ResultActionsProps) {
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const [shareBusy, setShareBusy] = React.useState(false);

  const ensureId = React.useCallback((): string => {
    if (record.id) return record.id;
    // No id yet (e.g. history save raced): mint one now so the link resolves.
    const saved = saveHistory(record.query, record.result, Date.now());
    return saved.id;
  }, [record]);

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

  const onShare = React.useCallback(async () => {
    setShareBusy(true);
    try {
      const id = ensureId();
      const path = `/r/${id}`;
      const absolute =
        typeof window !== "undefined" ? new URL(path, window.location.origin).toString() : path;

      let copied = false;
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(absolute);
          copied = true;
        }
      } catch {
        copied = false;
      }

      if (copied) {
        toast.success("Permalink copied to your clipboard.");
      } else {
        toast.success("Permalink ready", { description: absolute });
      }
    } finally {
      setShareBusy(false);
    }
  }, [ensureId]);

  return (
    <div className="flex flex-col gap-3">
      <p className="mb-0.5 font-sans text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
        Keep this record
      </p>

      <Button
        variant="primary"
        onClick={onDownload}
        disabled={pdfBusy}
        aria-busy={pdfBusy}
        className="h-13 min-h-13 w-full justify-start gap-3 px-[18px]"
      >
        <Download aria-hidden="true" strokeWidth={1.9} />
        <span className="flex-1 text-left">
          {pdfBusy ? "Preparing PDF record" : "Download PDF record"}
        </span>
      </Button>

      <Button
        variant="secondary"
        onClick={onShare}
        disabled={shareBusy}
        aria-busy={shareBusy}
        className="h-13 min-h-13 w-full justify-start gap-3 px-[18px] text-accent-ink hover:bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface))]"
      >
        <Link2 aria-hidden="true" strokeWidth={1.9} />
        <span className="flex-1 text-left">Share permalink</span>
      </Button>

      <p className="mt-0.5 px-0.5 font-sans text-[0.74rem] leading-relaxed text-ink-muted">
        <span className="font-semibold text-accent">Saved on this device.</span>{" "}
        Sign in to keep your records and share them.
      </p>
    </div>
  );
}

export { ResultActions };
