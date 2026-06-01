"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { answer as answerApi, classify as classifyApi, ClassifyTimeoutError } from "@/lib/api";
import { ClassifyError } from "@/lib/types";
import type { ClassifyResult, UiClassification, UiQuestion, UiRefused } from "@/lib/types";
import { saveHistory } from "@/lib/history";

import { PageShell } from "@/components/layout/page-shell";
import { LoadingView } from "@/components/result/loading-view";
import { ResultView } from "@/components/result/result-view";
import { QuestionView } from "@/components/result/question-view";
import { RefusedView } from "@/components/result/refused-view";
import { ErrorView, type ErrorKind } from "@/components/result/error-view";

export interface ClassifyClientProps {
  query: string;
}

function errorKind(err: unknown): ErrorKind {
  // Timeout is a distinct kind even though it extends ClassifyError as a
  // retryable transient (so the base shape stays compatible).
  if (err instanceof ClassifyTimeoutError) return "timeout";
  if (err instanceof ClassifyError) {
    if (err.kind === "daily_limit") return "daily_limit";
    if (err.kind === "network") return "network";
    // bad_request is unreachable here (page redirects on empty query); treat as transient.
    return "transient";
  }
  return "transient";
}

/** A terse, honest summary of the current state for the single live region. */
function statusSummary(args: {
  isPending: boolean;
  error: unknown;
  result: ClassifyResult | undefined;
}): string {
  const { isPending, error, result } = args;
  if (isPending) return "Classifying your product. This can take up to a minute.";
  if (error) return "The classification could not be completed. A recovery option is shown.";
  if (result?.responseType === "classification") {
    return `Classification ready. Proposed code ${result.hsCode}. Verify before filing.`;
  }
  if (result?.responseType === "question") {
    return "One clarifying question is shown. Choose an option, then continue.";
  }
  if (result?.responseType === "refused") {
    return "No tariff line could be assigned. A way forward is shown.";
  }
  return "Preparing to classify your product.";
}

/**
 * ClassifyClient — the result-flow orchestrator. On mount it runs the initial
 * classify; multi-turn answers re-run via the answer endpoint. It keeps the
 * original query constant, accumulates previousAnswers, counts rounds, and
 * branches the rendered view on the result's responseType.
 *
 * Honest a11y model: the swapping region is NOT an aria-live firehose. Exactly
 * ONE role="status" element carries a terse summary of state changes; the
 * region is marked aria-busy while a run is in flight; and on each transition
 * focus is moved into the new view so keyboard/screen-reader users follow the
 * flow. The ASK step is fully decoupled: selecting an option only sets state;
 * an explicit Continue submits, guarded against double-submit.
 */
function ClassifyClient({ query }: ClassifyClientProps) {
  const router = useRouter();

  // Session state held constant across clarifying rounds.
  const originalQuery = query;
  const previousAnswers = React.useRef<Record<string, string>>({});
  const roundsRef = React.useRef(0);
  // The id of the question currently on screen (set when a question lands).
  const activeQuestionId = React.useRef<string | null>(null);
  // Guard so the initial classify mutation fires exactly once per query.
  const startedFor = React.useRef<string | null>(null);
  // Ensure each distinct classification is saved to history only once.
  const savedKey = React.useRef<string | null>(null);
  // Double-submit guard for the explicit Continue on the ASK step.
  const submitGuard = React.useRef(false);

  // The currently-selected ASK option (decoupled from submission), tagged with
  // the question it belongs to so it auto-resets when a NEW question lands
  // (derived, never cleared via setState-in-effect).
  const [selection, setSelection] = React.useState<{
    questionId: string;
    optionId: string;
  } | null>(null);

  // Region focus target — moved into on each async transition.
  const regionRef = React.useRef<HTMLDivElement | null>(null);

  const classifyMutation = useMutation<ClassifyResult, ClassifyError, string>({
    mutationFn: (q: string) => classifyApi(q) as Promise<ClassifyResult>,
  });

  const answerMutation = useMutation<
    ClassifyResult,
    ClassifyError,
    {
      questionId: string;
      answerId: string;
      priorAnswers: Record<string, string>;
      priorRounds: number;
    }
  >({
    mutationFn: ({ questionId, answerId, priorAnswers, priorRounds }) =>
      answerApi({
        originalQuery,
        questionId,
        answerId,
        // Per the v2 contract: previousAnswers carries PRIOR rounds only; the
        // current answer is sent separately as answerId, and rounds counts
        // rounds already completed before this one.
        previousAnswers: priorAnswers,
        rounds: priorRounds,
      }) as Promise<ClassifyResult>,
  });

  // Kick off the initial classification once.
  React.useEffect(() => {
    if (startedFor.current === originalQuery) return;
    startedFor.current = originalQuery;
    previousAnswers.current = {};
    roundsRef.current = 0;
    activeQuestionId.current = null;
    savedKey.current = null;
    submitGuard.current = false;
    classifyMutation.mutate(originalQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalQuery]);

  // The freshest result is whichever mutation ran last.
  const result: ClassifyResult | undefined =
    answerMutation.data ?? classifyMutation.data;
  const isPending = classifyMutation.isPending || answerMutation.isPending;
  const error = answerMutation.error ?? classifyMutation.error;

  // When a question lands, remember its id for the next answer call. The
  // selection auto-resets because it is tagged with the question id (see
  // `selectedOption` below) — no setState in the effect.
  React.useEffect(() => {
    if (result?.responseType === "question") {
      activeQuestionId.current = result.questionId;
      submitGuard.current = false;
    }
  }, [result]);

  // The effective selection for the question currently on screen. A selection
  // tagged with a previous question never leaks into a new one.
  const currentQuestionId =
    result?.responseType === "question" ? result.questionId : null;
  const selectedOption =
    selection && selection.questionId === currentQuestionId
      ? selection.optionId
      : null;
  const selectOption = React.useCallback(
    (optionId: string) => {
      if (!currentQuestionId) return;
      setSelection({ questionId: currentQuestionId, optionId });
    },
    [currentQuestionId],
  );

  // Release the submit guard whenever a run settles.
  React.useEffect(() => {
    if (!isPending) submitGuard.current = false;
  }, [isPending]);

  // Persist a successful classification exactly once.
  React.useEffect(() => {
    if (result?.responseType !== "classification") return;
    const key = `${originalQuery}::${result.hsCode}`;
    if (savedKey.current === key) return;
    savedKey.current = key;
    saveHistory(originalQuery, result, Date.now());
  }, [result, originalQuery]);

  // Which discrete view is on screen — used to move focus on each transition.
  const viewKey = isPending
    ? "loading"
    : error
      ? "error"
      : (result?.responseType ?? "loading");

  // Move focus into the new view on each transition. The individual views
  // self-focus their own <h1>; this is the fallback so SR/keyboard users always
  // land inside the freshly-swapped region (e.g. the result, owned elsewhere).
  React.useEffect(() => {
    const node = regionRef.current;
    if (!node) return;
    // Defer so the new subtree (and its own focus calls) have mounted.
    const id = window.requestAnimationFrame(() => {
      const active = document.activeElement;
      const movedItself = active && node.contains(active) && active !== node;
      if (!movedItself) node.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, [viewKey]);

  const submitAnswer = React.useCallback(
    (optionId: string) => {
      const questionId = activeQuestionId.current;
      if (!questionId) return;
      // Double-submit guard: ignore re-entrant submits while one is in flight.
      if (submitGuard.current || isPending) return;
      submitGuard.current = true;
      // Snapshot the PRIOR state for this request, then fold this round into
      // the accumulators so the NEXT round sees it as prior.
      const priorAnswers = { ...previousAnswers.current };
      const priorRounds = roundsRef.current;
      previousAnswers.current = { ...previousAnswers.current, [questionId]: optionId };
      roundsRef.current += 1;
      answerMutation.mutate({ questionId, answerId: optionId, priorAnswers, priorRounds });
    },
    [answerMutation, isPending],
  );

  const handleRetry = React.useCallback(() => {
    answerMutation.reset();
    classifyMutation.reset();
    submitGuard.current = false;
    classifyMutation.mutate(originalQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalQuery]);

  // Carry the query out so the home field returns prefilled (?q= thread-through)
  // on every recovery exit. This is the "edit and run again" path for the states
  // this orchestrator owns: the person lands back on the field with their words
  // intact, edits, and resubmits. (The in-result Edit affordance lives in the
  // result view; both converge on a prefilled field via ?q=.)
  const goHomePrefilled = React.useCallback(() => {
    router.push(`/?q=${encodeURIComponent(originalQuery)}`);
  }, [router, originalQuery]);

  let body: React.ReactNode;

  if (isPending) {
    body = <LoadingView query={originalQuery} onCancel={goHomePrefilled} />;
  } else if (error) {
    body = (
      <ErrorView
        kind={errorKind(error)}
        onRetry={handleRetry}
        onClassifyAnother={goHomePrefilled}
      />
    );
  } else if (result?.responseType === "classification") {
    const record = { query: originalQuery, result: result as UiClassification };
    body = <ResultView record={record} />;
  } else if (result?.responseType === "question") {
    body = (
      <QuestionView
        question={result as UiQuestion}
        query={originalQuery}
        value={selectedOption}
        submitting={isPending}
        onSelect={selectOption}
        onSubmit={submitAnswer}
        // Required by the preserved prop signature; unused while decoupled
        // (onSelect + onSubmit drive the flow). Kept compatible as a fallback.
        onAnswer={submitAnswer}
      />
    );
  } else if (result?.responseType === "refused") {
    body = (
      <RefusedView
        reason={(result as UiRefused).reason}
        onReset={goHomePrefilled}
        onClassifyAnother={goHomePrefilled}
      />
    );
  } else {
    // No result yet and not pending (first paint before effect): show loading.
    body = <LoadingView query={originalQuery} onCancel={goHomePrefilled} />;
  }

  return (
    <PageShell width="wide" className="py-[clamp(18px,3vw,40px)]">
      {/* Single terse live region — replaces the previous aria-live firehose. */}
      <p role="status" aria-live="polite" className="sr-only">
        {statusSummary({ isPending, error, result })}
      </p>

      {/* The swapping region: focus moves in here on each async transition. */}
      <div ref={regionRef} tabIndex={-1} aria-busy={isPending} className="outline-none">
        {body}
      </div>
    </PageShell>
  );
}

export { ClassifyClient };
