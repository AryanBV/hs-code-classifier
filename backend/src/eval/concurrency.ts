/**
 * Minimal bounded-concurrency map — no external dependency.
 *
 * Runs `worker(item, index)` over `items` with at most `limit` promises
 * in flight at once. Results are returned in INPUT ORDER (results[i]
 * corresponds to items[i]) regardless of completion order, so the eval
 * report stays deterministic under concurrency.
 *
 * The worker is expected to never reject (the eval runner catches per-case
 * errors internally and returns an error EvalDetail); if it does reject,
 * the rejection propagates and aborts the pool — matching `Promise.all`.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;

  const runners: Promise<void>[] = [];
  const poolSize = Math.max(1, Math.min(limit, items.length));

  for (let w = 0; w < poolSize; w++) {
    runners.push(
      (async () => {
        // Each runner pulls the next un-claimed index until the queue drains.
        for (;;) {
          const i = next++;
          if (i >= items.length) return;
          results[i] = await worker(items[i] as T, i);
        }
      })(),
    );
  }

  await Promise.all(runners);
  return results;
}
