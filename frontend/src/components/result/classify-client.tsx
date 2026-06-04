"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { answer as answerApi, classify as classifyApi, ClassifyTimeoutError } from "@/lib/api";
import { ClassifyError } from "@/lib/types";
import type { ClassifyResult, UiClassification, UiQuestion, UiRefused } from "@/lib/types";
import { saveHistory } from "@/lib/history";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { TurnstileError, useTurnstile } from "@/components/cost/turnstile";

import { PageShell } from "@/components/layout/page-shell";
import { LoadingView } from "@/components/result/loading-view";
import { ResultView } from "@/components/result/result-view";
import { QuestionView } from "@/components/result/question-view";
import { RefusedView } from "@/components/result/refused-view";
import { ErrorView, type ErrorKind } from "@/components/result/error-view";
import {
  resolveToldUsLabel,
  type ToldUsItem,
} from "@/components/result/what-you-told-us";
import { markSkipEntrance } from "@/lib/reveal-handoff";

export interface ClassifyClientProps {
  query: string;
}

function errorKind(err: unknown): ErrorKind {
  // Timeout is a distinct kind even though it extends ClassifyError as a
  // retryable transient (so the base shape stays compatible).
  if (err instanceof ClassifyTimeoutError) return "timeout";
  // A failed bot check is recoverable: a retry mints a fresh token. Surfaced as
  // a friendly transient so the existing retry affordance applies.
  if (err instanceof TurnstileError) return "transient";
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

  // Invisible bot check. When NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset this is a
  // pure no-op: `getToken()` resolves to null and the rendered widget is null,
  // so the request body is exactly as it was before Turnstile existed.
  const turnstile = useTurnstile();

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

  // REACTIVE MIRROR (engineering C): a render-visible copy of the user's OWN
  // submitted answers, so the "WHAT YOU TOLD US" strip repaints across rounds.
  // It is written ALONGSIDE the imperative previousAnswers/roundsRef refs in
  // submitAnswer (never replacing them), so the carefully-guarded single-fire /
  // double-submit / round-count logic on those refs is untouched. Reset to []
  // whenever a fresh classification starts (same lifecycle as the refs).
  const [toldUs, setToldUs] = React.useState<ToldUsItem[]>([]);

  // Region focus target — moved into on each async transition.
  const regionRef = React.useRef<HTMLDivElement | null>(null);

  // The error type is `Error`: the thrown value is either a ClassifyError (API
  // path) or a TurnstileError (bot check failed) — `errorKind` discriminates.
  const classifyMutation = useMutation<ClassifyResult, Error, string>({
    mutationFn: async (q: string) => {
      // No-op (null) when Turnstile is unconfigured; the body stays unchanged.
      const token = await turnstile.getToken();
      return classifyApi(q, token) as Promise<ClassifyResult>;
    },
  });

  const answerMutation = useMutation<
    ClassifyResult,
    Error,
    {
      questionId: string;
      answerId: string;
      priorAnswers: Record<string, string>;
      priorRounds: number;
    }
  >({
    mutationFn: async ({ questionId, answerId, priorAnswers, priorRounds }) => {
      const token = await turnstile.getToken();
      return answerApi(
        {
          originalQuery,
          questionId,
          answerId,
          // Per the v2 contract: previousAnswers carries PRIOR rounds only; the
          // current answer is sent separately as answerId, and rounds counts
          // rounds already completed before this one.
          previousAnswers: priorAnswers,
          rounds: priorRounds,
        },
        token,
      ) as Promise<ClassifyResult>;
    },
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
    setToldUs([]);
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

  // Persist a successful classification exactly once, then make the result
  // URL-ADDRESSABLE: replace the transient compute URL (/classify?q=…) with the
  // durable record URL (/r/{id}). This holds for BOTH the initial classify and
  // the multi-turn answer path (the save effect fires for any classification
  // result, whichever mutation produced it). A refresh then reads the saved
  // record from localStorage via /r/{id} instead of re-spending the ~40s
  // rate-limited backend run. router.replace keeps it out of history so Back
  // does not return to a recompute. The save+replace runs once per record;
  // until it lands, the in-page ResultView still renders, so there is no flash.
  React.useEffect(() => {
    if (result?.responseType !== "classification") return;
    const key = `${originalQuery}::${result.hsCode}`;
    if (savedKey.current === key) return;
    savedKey.current = key;
    const saved = saveHistory(originalQuery, result, Date.now());

    // Engineering A (double-reveal fix): the in-page ResultView is ALREADY
    // playing the signature inscription reveal right now. We are about to
    // router.replace('/r/{id}') to the durable record URL, where a FRESH
    // ResultView would otherwise re-play the same reveal. Mark this record id so
    // that next mount skips its entrance and settles instantly (read-once on the
    // /r/ mount). A direct/cold/refreshed /r/{id} visit is unmarked and animates
    // normally. Set BEFORE either navigation path fires.
    markSkipEntrance(saved.id);

    // Additive, best-effort cloud sync. The local save above is the source of
    // truth; the cloud insert is strictly additive and never throws. Earlier the
    // insert was fire-and-forget and `router.replace` ran on the SAME tick, so
    // the navigation unmounted this component (and tore down the async chunk
    // load + insert) before the row was dispatched — most reliably on the
    // answer-continuation path. We now AWAIT the cloud save (raced against a
    // short ceiling so a slow/hung save can never block the redirect) and only
    // then navigate. The save still never blocks the local save, never throws,
    // and is a no-op when signed out / unconfigured.
    if (!isSupabaseConfigured()) {
      router.replace(`/r/${saved.id}`);
      return;
    }

    let navigated = false;
    const navigate = (): void => {
      if (navigated) return;
      navigated = true;
      router.replace(`/r/${saved.id}`);
    };
    // Hard ceiling: never let cloud sync delay the redirect for long.
    const fallback = window.setTimeout(navigate, 1500);

    void import("@/lib/account")
      .then((m) => m.saveClassification(saved))
      .catch(() => {
        /* helper is fail-safe; this guards a chunk-load failure too */
      })
      .finally(() => {
        window.clearTimeout(fallback);
        navigate();
      });

    // Clear the fallback timer if this effect tears down before the save settles
    // (e.g. unmount). The `navigated` guard already prevents a double redirect.
    return () => window.clearTimeout(fallback);
  }, [result, originalQuery, router]);

  // Which discrete view is on screen — used to move focus on each transition.
  const viewKey = isPending
    ? "loading"
    : error
      ? "error"
      : (result?.responseType ?? "loading");

  // ----------------------------------------------------------------------
  // SPA-nav loading "hang": this is a DEV-ONLY artifact, NOT a production bug.
  // VERIFIED empirically against a `next build` production server: the landing
  // click-through (landing -> "coffee beans" -> "Find the code" -> /classify via
  // router.push) ADVANCES correctly to the question/result in production; it only
  // freezes on the loading view under `next dev`.
  //
  // Cause: `next dev` runs React StrictMode, which double-invokes the mount
  // (mount -> unmount -> remount) while App Router navigation runs inside a React
  // Transition. That dev-only double-mount entangles this component's classify
  // mutation with the still-pending navigation Transition so React Query's
  // resolution commit (isPending:false + data) is starved and the view never
  // advances. Production has no StrictMode double-mount, so the resolution commits
  // normally — consistent with the app classifying live before this work. NOTE:
  // removing the loading view's old 500ms setInterval did NOT change the dev
  // symptom, so the interval was never the cause; it was removed anyway because
  // the new loader is CSS-driven and timer-light (see loading-view.tsx).
  //
  // HARDENING kept regardless: the rAF focus-mover below runs ONLY for terminal
  // views (result/question/error/refused), never while isPending/"loading" — no
  // needless focus churn into a transient region during the pending Transition.
  // ----------------------------------------------------------------------
  React.useEffect(() => {
    // Only move focus once a TERMINAL view has settled; never during loading.
    if (viewKey === "loading") return;
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
      // Resolve the human label of the chosen option from the question CURRENTLY
      // on screen, BEFORE the next mutation swaps the result. This is the user's
      // own answer, captured for the "WHAT YOU TOLD US" strip.
      const onScreenQuestion =
        result?.responseType === "question" ? (result as UiQuestion) : null;
      const chosenLabel = resolveToldUsLabel(onScreenQuestion, optionId);
      // Snapshot the PRIOR state for this request, then fold this round into
      // the accumulators so the NEXT round sees it as prior.
      const priorAnswers = { ...previousAnswers.current };
      const priorRounds = roundsRef.current;
      previousAnswers.current = { ...previousAnswers.current, [questionId]: optionId };
      roundsRef.current += 1;
      // Reactive mirror, written ALONGSIDE the refs (engineering C): append this
      // round's answer so the chip strip repaints. Never touches the guards above.
      setToldUs((prev) => [...prev, { questionId, label: chosenLabel }]);
      answerMutation.mutate({ questionId, answerId: optionId, priorAnswers, priorRounds });
    },
    [answerMutation, isPending, result],
  );

  const handleRetry = React.useCallback(() => {
    answerMutation.reset();
    classifyMutation.reset();
    submitGuard.current = false;
    // A retry restarts the session from the original query, so the prior
    // answers' refs are reset on the next initial-classify; clear the mirror too.
    previousAnswers.current = {};
    roundsRef.current = 0;
    setToldUs([]);
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
    body = (
      <LoadingView
        query={originalQuery}
        onCancel={goHomePrefilled}
        toldUs={toldUs}
        // An answer-continuation wait (vs the initial classify): the lead line
        // then honestly names the user's own added detail.
        isAnswerPath={answerMutation.isPending}
        // Advance the gloss/lesson decks per round instead of restarting them, so
        // a 2nd/3rd round's wait reads materially different.
        deckOffset={toldUs.length}
      />
    );
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
    body = <ResultView record={record} toldUs={toldUs} />;
  } else if (result?.responseType === "question") {
    body = (
      <QuestionView
        question={result as UiQuestion}
        query={originalQuery}
        value={selectedOption}
        submitting={isPending}
        onSelect={selectOption}
        onSubmit={submitAnswer}
        // Prior submitted answers ride into a 2nd+ question (continuous record).
        toldUs={toldUs}
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

      {/* Invisible Turnstile widget — null unless a site key is configured. */}
      {turnstile.widget}
    </PageShell>
  );
}

export { ClassifyClient };
