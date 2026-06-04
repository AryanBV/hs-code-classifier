/**
 * NORMALIZED INFORMATION GAIN (GAIN RATIO) — Stage S2 divergence engine, pure core.
 *
 * The S4 divergence engine must RANK candidate axes that still split the surviving
 * leaves and pick the single most discriminating one. The naive ranker — raw
 * information gain (IG) over the candidate set, measured in bits — is biased toward
 * axes with MORE branches: a 7-way grade split mechanically yields more bits than a
 * clean 2-way whole-vs-cut split, so raw IG would prefer high-cardinality axes
 * regardless of how cleanly they actually carve the population. That is exactly
 * wrong for a "ask the ONE best question" loop, AND it makes scores from a 2-leaf
 * survivor set incomparable with scores from a 20-leaf one.
 *
 * The fix is a NORMALIZED gain ratio: divide IG by the population's prior entropy so
 * the score is a DIMENSIONLESS fraction in [0,1] — the share of the surviving-leaf
 * uncertainty the answer removes — stable across both the number of classes and the
 * number of survivors:
 *
 *   gainRatio = IG(partition) / H(classes)                       ∈ [0,1]
 *
 * where, over a partition whose classes carry sizes n_1..n_k summing to N:
 *
 *   H(classes) = priorEntropy = log2(N)                          [total leaf-uncertainty]
 *   H(after)   = residualEntropy = Σ_i (n_i / N) · log2(n_i)     [within-class residual]
 *   IG         = priorEntropy − residualEntropy                  [bits the answer removes]
 *   splitInfo  = − Σ_i (n_i / N) · log2(n_i / N)                 [entropy of the answer; diagnostic]
 *
 * This is the "uncertainty coefficient" (normalized mutual information of leaf
 * identity and the answer) — equivalently IG as a fraction of the maximum possible.
 * It rewards a CLEAN, EVEN carve: a 2-way split that fully separates 2 leaves scores
 * 1.0; a 2-way 4-vs-4 split of 8 leaves removes only log2(8)−log2(4) = 1 of 3 bits →
 * 0.33, correctly LESS decisive than the clean carve, while a many-branch split that
 * leaves big residual clumps does NOT win on branch count alone.
 *
 * Why NOT divide by splitInfo (textbook C4.5 gain ratio)? Under this engine's MECE
 * model — survivors are partitioned into DISJOINT classes and a leaf is uniquely
 * identified once its class is known, so residual = log2(n_i) — the algebra collapses
 * to IG ≡ splitInfo, making IG/splitInfo a constant 1.0 (useless for ranking).
 * Dividing by the PRIOR entropy instead is the non-degenerate normalization. The
 * `splitInfo` term is still computed and reported for tracing.
 *
 * Pure. No I/O, no Date, no global state, never throws. Exhaustively unit-tested.
 *
 * Reference: Shannon mutual information / uncertainty coefficient (Theil's U);
 * mirrors the entropy math already used by QGS-generator.ts `computeInformationGain`
 * but normalized for cross-axis + cross-population comparability.
 */

/** A partition of the surviving leaves: class-id -> the leaf codes in that class. */
export type LeafPartition = Map<string, string[]>;

/** Decomposed information-theoretic terms for one axis partition (all in bits). */
export interface GainRatioResult {
  /** Total leaves across all classes (the population the partition is scored over). */
  total: number;
  /** Number of distinct classes (partition.size). */
  classCount: number;
  /** Per-class leaf counts in the order iterated (for tracing / tests). */
  classSizes: number[];
  /** Prior entropy H(before) = log2(total) bits (0 when total ≤ 1). */
  priorEntropy: number;
  /** Expected residual entropy H(after) = Σ (n_i/N)·log2(n_i) bits. */
  residualEntropy: number;
  /** Information gain = priorEntropy − residualEntropy bits (≥0). */
  informationGain: number;
  /** Split information = entropy of the answer = −Σ (n_i/N)·log2(n_i/N) bits (diagnostic). */
  splitInfo: number;
  /**
   * Normalized gain ratio = informationGain / priorEntropy (the uncertainty
   * coefficient), clamped to [0,1]. 0 when the partition does not discriminate
   * (≤1 class, or priorEntropy is 0). 1.0 means the answer fully identifies the leaf.
   */
  gainRatio: number;
}

/** log2 with a 0→0 guard (so a singleton/empty class contributes nothing). */
function log2(x: number): number {
  return x > 0 ? Math.log2(x) : 0;
}

/**
 * Compute the class sizes of a partition as the count of leaf codes per class,
 * de-duplicating codes WITHIN a class (a code listed twice in one class is one
 * leaf) so the population count is honest. Classes are kept in the partition's
 * iteration order. Pure + total.
 *
 * NOTE: this does NOT de-duplicate ACROSS classes — the engine's partitions are
 * MECE by construction (each surviving leaf is placed in exactly one class), and a
 * cross-class duplicate would indicate a malformed partition the caller is
 * responsible for not producing. The math degrades gracefully either way (a code
 * counted in two classes simply inflates that axis's apparent population), never
 * throwing.
 */
export function partitionClassSizes(partition: LeafPartition): number[] {
  const sizes: number[] = [];
  for (const codes of partition.values()) {
    const distinct = new Set<string>(codes);
    sizes.push(distinct.size);
  }
  return sizes;
}

/**
 * Compute the full gain-ratio decomposition for a partition of surviving leaves.
 *
 * Empty / degenerate partitions (0 leaves, ≤1 class, or every leaf in one class)
 * yield `gainRatio: 0` with the decomposed terms still populated for tracing. A
 * partition that cleanly separates every leaf yields the maximal ratio for its
 * shape. The ratio is clamped to [0,1] for cross-axis comparability.
 *
 * Pure + total + never throws.
 */
export function computeGainRatio(partition: LeafPartition): GainRatioResult {
  const classSizes = partitionClassSizes(partition);
  const classCount = classSizes.length;
  const total = classSizes.reduce((a, b) => a + b, 0);

  const priorEntropy = log2(total);

  // Degenerate: nothing to partition, or a single class — no discrimination.
  if (total <= 1 || classCount < 2) {
    return {
      total,
      classCount,
      classSizes,
      priorEntropy,
      residualEntropy: priorEntropy,
      informationGain: 0,
      splitInfo: 0,
      gainRatio: 0,
    };
  }

  let residualEntropy = 0;
  let splitInfo = 0;
  for (const n of classSizes) {
    if (n <= 0) continue;
    const p = n / total;
    residualEntropy += p * log2(n);     // within-class residual (MECE: log2(n_i))
    splitInfo += -p * log2(p);          // entropy of the class-size distribution
  }

  const informationGain = Math.max(0, priorEntropy - residualEntropy);

  // Normalize IG by the PRIOR entropy (the uncertainty coefficient) — the share of
  // total leaf-uncertainty the answer removes. priorEntropy === 0 only when total ≤ 1
  // (caught above) — guard anyway so a malformed partition can never divide by zero.
  const gainRatio =
    priorEntropy > 0 ? Math.min(1, Math.max(0, informationGain / priorEntropy)) : 0;

  return {
    total,
    classCount,
    classSizes,
    priorEntropy,
    residualEntropy,
    informationGain,
    splitInfo,
    gainRatio,
  };
}

/**
 * Convenience: the normalized gain ratio (a single number in [0,1]) for a
 * partition. 0 means the axis does not discriminate the survivors. Pure + total.
 */
export function normalizedGainRatio(partition: LeafPartition): number {
  return computeGainRatio(partition).gainRatio;
}
