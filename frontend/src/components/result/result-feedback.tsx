"use client";

import * as React from "react";
import { Check, Flag, ThumbsDown, ThumbsUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import {
  FEEDBACK_DOWN_LABEL,
  FEEDBACK_ERROR,
  FEEDBACK_NOTE_PLACEHOLDER,
  FEEDBACK_PROMPT,
  FEEDBACK_REPORT_LABEL,
  FEEDBACK_SUBMIT_LABEL,
  FEEDBACK_THANKS,
  FEEDBACK_UP_LABEL,
} from "@/lib/content";
import type { UiClassification } from "@/lib/types";

export interface ResultFeedbackRecord {
  id?: string;
  query: string;
  result: UiClassification;
}

export interface ResultFeedbackProps {
  record: ResultFeedbackRecord;
}

type Verdict = "up" | "down" | "report";
type Phase = "idle" | "noting" | "sending" | "done" | "error";

const NOTE_MAX = 500;

/**
 * ResultFeedback — a lightweight, unobtrusive "Was this code right?" affordance.
 *
 * Three intents map to one `verdict` on the row: thumbs-up ("up"), thumbs-down
 * ("down"), and "Report a wrong code" ("report"). Down/report open a short
 * optional note before sending; up sends immediately. The note is optional.
 *
 * Fail-safe by contract: a failed submit NEVER breaks the result view. On error
 * we show a calm "could not save, try again" and let the user retry. No new PII
 * is collected beyond what the record already holds (the query + the code).
 *
 * Accessible: a labelled radiogroup-free button set (each button is a real
 * <button> with an explicit label), a labelled textarea, aria-live status, and
 * keyboard-reachable controls. Reduced-motion safe: there is no animation here
 * beyond the shared Button press, which already honours reduced motion.
 */
function ResultFeedback({ record }: ResultFeedbackProps) {
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [verdict, setVerdict] = React.useState<Verdict | null>(null);
  const [note, setNote] = React.useState("");
  const noteId = React.useId();
  const statusId = React.useId();

  const submit = React.useCallback(
    async (chosen: Verdict, withNote: string) => {
      setVerdict(chosen);
      setPhase("sending");
      try {
        const res = await fetch("/api/feedback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            classificationId: record.id ?? null,
            query: record.query,
            hsCode: record.result.hsCode,
            verdict: chosen,
            note: withNote.trim() || null,
          }),
        });
        if (!res.ok) {
          setPhase("error");
          return;
        }
        setPhase("done");
      } catch {
        setPhase("error");
      }
    },
    [record],
  );

  const onPick = React.useCallback(
    (chosen: Verdict) => {
      setVerdict(chosen);
      if (chosen === "up") {
        // A positive verdict needs no note; send it straight away.
        void submit("up", "");
        return;
      }
      // Down / report invite an optional note first.
      setPhase("noting");
    },
    [submit],
  );

  if (phase === "done") {
    return (
      <section
        aria-label="Feedback"
        className="border-t border-rule pt-5"
      >
        {/* The visible thanks. The icon is decorative; the spoken announcement
            is carried by the polite live region below so screen-reader users
            hear success too (the live region is what gets announced, not this). */}
        <p className="flex items-center gap-2 font-sans text-meta text-ink">
          <Check aria-hidden="true" strokeWidth={2} className="size-4 text-band-high" />
          {FEEDBACK_THANKS}
        </p>
        <p aria-live="polite" className="sr-only">
          {FEEDBACK_THANKS}
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Feedback" className="border-t border-rule pt-5">
      <div
        role="group"
        aria-label={FEEDBACK_PROMPT}
        className="flex flex-col gap-3"
      >
        <p className="font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
          {FEEDBACK_PROMPT}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onPick("up")}
            disabled={phase === "sending"}
            aria-pressed={verdict === "up"}
            aria-label={FEEDBACK_UP_LABEL}
            className={cn(verdict === "up" && "border-accent text-accent-ink")}
          >
            <ThumbsUp aria-hidden="true" strokeWidth={1.9} />
            <span>Yes</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onPick("down")}
            disabled={phase === "sending"}
            aria-pressed={verdict === "down"}
            aria-label={FEEDBACK_DOWN_LABEL}
            className={cn(verdict === "down" && "border-accent text-accent-ink")}
          >
            <ThumbsDown aria-hidden="true" strokeWidth={1.9} />
            <span>No</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onPick("report")}
            disabled={phase === "sending"}
            aria-pressed={verdict === "report"}
            aria-label={FEEDBACK_REPORT_LABEL}
            className={cn("text-ink-muted", verdict === "report" && "text-accent-ink")}
          >
            <Flag aria-hidden="true" strokeWidth={1.9} />
            <span>{FEEDBACK_REPORT_LABEL}</span>
          </Button>
        </div>

        {verdict !== "up" &&
        (phase === "noting" || phase === "sending" || phase === "error") ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={noteId} className="text-ink-muted">
              Add a note (optional)
            </Label>
            <Textarea
              id={noteId}
              value={note}
              maxLength={NOTE_MAX}
              onChange={(e) => setNote(e.target.value)}
              placeholder={FEEDBACK_NOTE_PLACEHOLDER}
              className="min-h-[5rem]"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => verdict && void submit(verdict, note)}
                loading={phase === "sending"}
              >
                {FEEDBACK_SUBMIT_LABEL}
              </Button>
            </div>
          </div>
        ) : null}

        {/* Calm, non-blocking error. The result view is never broken by a failed
            submit; the user can simply send again. */}
        {phase === "error" ? (
          <p className="font-sans text-meta text-band-low">{FEEDBACK_ERROR}</p>
        ) : null}

        <p id={statusId} aria-live="polite" className="sr-only">
          {phase === "sending"
            ? "Sending feedback."
            : phase === "error"
              ? FEEDBACK_ERROR
              : ""}
        </p>
      </div>
    </section>
  );
}

export { ResultFeedback };
