"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { answer as answerApi, classify as classifyApi } from "@/lib/api";
import { ClassifyError } from "@/lib/types";
import type { ClassifyResult, UiClassification, UiQuestion, UiRefused } from "@/lib/types";
import { saveHistory } from "@/lib/history";

import { LoadingView } from "@/components/result/loading-view";
import { ResultView } from "@/components/result/result-view";
import { QuestionView, UNSURE_ANSWER_ID } from "@/components/result/question-view";
import { RefusedView } from "@/components/result/refused-view";
import { ErrorView } from "@/components/result/error-view";

export interface ClassifyClientProps {
  query: string;
}

function errorKind(err: unknown): "transient" | "daily_limit" | "network" {
  if (err instanceof ClassifyError) {
    if (err.kind === "daily_limit") return "daily_limit";
    if (err.kind === "network") return "network";
    // bad_request is unreachable here (page redirects on empty query); treat as transient.
    return "transient";
  }
  return "transient";
}

/**
 * ClassifyClient — the result-flow orchestrator. On mount it runs the initial
 * classify; multi-turn answers re-run via the answer endpoint. It keeps the
 * original query constant, accumulates previousAnswers, counts rounds, and
 * branches the rendered view on the result's responseType. The swapping region
 * is wrapped in an aria-live="polite" container so assistive tech is notified
 * when the result lands.
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
    classifyMutation.mutate(originalQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalQuery]);

  // The freshest result is whichever mutation ran last.
  const result: ClassifyResult | undefined =
    answerMutation.data ?? classifyMutation.data;
  const isPending = classifyMutation.isPending || answerMutation.isPending;
  const error = answerMutation.error ?? classifyMutation.error;

  // When a question lands, remember its id for the next answer call.
  React.useEffect(() => {
    if (result?.responseType === "question") {
      activeQuestionId.current = result.questionId;
    }
  }, [result]);

  // Persist a successful classification exactly once.
  React.useEffect(() => {
    if (result?.responseType !== "classification") return;
    const key = `${originalQuery}::${result.hsCode}`;
    if (savedKey.current === key) return;
    savedKey.current = key;
    saveHistory(originalQuery, result, Date.now());
  }, [result, originalQuery]);

  const handleAnswer = React.useCallback(
    (optionId: string) => {
      const questionId = activeQuestionId.current;
      if (!questionId) return;
      // Snapshot the PRIOR state for this request, then fold this round into
      // the accumulators so the NEXT round sees it as prior.
      const priorAnswers = { ...previousAnswers.current };
      const priorRounds = roundsRef.current;
      previousAnswers.current = { ...previousAnswers.current, [questionId]: optionId };
      roundsRef.current += 1;
      answerMutation.mutate({ questionId, answerId: optionId, priorAnswers, priorRounds });
    },
    [answerMutation],
  );

  const handleRetry = React.useCallback(() => {
    answerMutation.reset();
    classifyMutation.reset();
    classifyMutation.mutate(originalQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalQuery]);

  const goHome = React.useCallback(() => {
    router.push("/");
  }, [router]);

  let body: React.ReactNode;

  if (isPending) {
    body = <LoadingView query={originalQuery} />;
  } else if (error) {
    body = <ErrorView kind={errorKind(error)} onRetry={handleRetry} />;
  } else if (result?.responseType === "classification") {
    const record = { query: originalQuery, result: result as UiClassification };
    body = <ResultView record={record} />;
  } else if (result?.responseType === "question") {
    body = (
      <QuestionView
        question={result as UiQuestion}
        onAnswer={(optionId) => {
          if (optionId === UNSURE_ANSWER_ID) {
            // Honest escape: submit the sentinel so the brain classifies with
            // what it has and flags the uncertainty (mock + v2 both accept it).
            handleAnswer(UNSURE_ANSWER_ID);
            return;
          }
          handleAnswer(optionId);
        }}
      />
    );
  } else if (result?.responseType === "refused") {
    body = <RefusedView reason={(result as UiRefused).reason} onReset={goHome} />;
  } else {
    // No result yet and not pending (first paint before effect): show loading.
    body = <LoadingView query={originalQuery} />;
  }

  return (
    <div className="mx-auto w-full max-w-[1240px] px-[clamp(16px,4vw,44px)] py-[clamp(18px,3vw,40px)]">
      <div aria-live="polite" aria-atomic="false">
        {body}
      </div>
    </div>
  );
}

export { ClassifyClient };
