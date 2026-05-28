import { describe, it, expect } from 'vitest';
import { mapWithConcurrency } from './concurrency';

describe('mapWithConcurrency', () => {
  it('preserves input order regardless of completion order', async () => {
    const items = [0, 1, 2, 3, 4, 5, 6, 7];
    // Later items resolve FASTER → completion order is reverse of input order.
    const out = await mapWithConcurrency(items, 4, async (n) => {
      await new Promise((r) => setTimeout(r, (items.length - n) * 5));
      return n * 10;
    });
    expect(out).toEqual([0, 10, 20, 30, 40, 50, 60, 70]);
  });

  it('never exceeds the concurrency limit of in-flight workers', async () => {
    let inFlight = 0;
    let maxObserved = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);

    await mapWithConcurrency(items, 5, async (n) => {
      inFlight++;
      maxObserved = Math.max(maxObserved, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
      return n;
    });

    expect(maxObserved).toBeLessThanOrEqual(5);
    expect(maxObserved).toBeGreaterThan(1); // proves it actually ran concurrently
  });

  it('processes every item exactly once', async () => {
    const items = Array.from({ length: 17 }, (_, i) => i);
    const seen = new Set<number>();
    const out = await mapWithConcurrency(items, 8, async (n) => {
      seen.add(n);
      return n;
    });
    expect(seen.size).toBe(17);
    expect(out).toEqual(items);
  });

  it('handles empty input', async () => {
    const out = await mapWithConcurrency([], 8, async (n: number) => n);
    expect(out).toEqual([]);
  });

  it('handles limit larger than item count', async () => {
    const out = await mapWithConcurrency([1, 2, 3], 100, async (n) => n + 1);
    expect(out).toEqual([2, 3, 4]);
  });
});
