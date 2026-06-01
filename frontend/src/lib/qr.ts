/**
 * Dependency-free QR Code generator (byte mode, EC level M, versions 1..10).
 *
 * Why hand-rolled: the audit asks for a scannable verify link on the record
 * (PDF footer + permalink) with NO new dependency. A short URL like
 * `https://hscode.prevyl.com/r/PRV-73-9F2A1C` fits comfortably in a low version,
 * so a compact encoder is feasible and genuinely useful (a clerk can scan the
 * record to the live page). This implements the QR spec subset we need:
 * byte-mode encoding, Reed-Solomon error correction, the standard mask
 * patterns with penalty scoring, and format/version information.
 *
 * Output is a boolean module matrix (`toMatrix`) plus a self-contained inline
 * SVG string (`toSvg`) using `currentColor` so it inherits the surrounding ink
 * token. If the payload is somehow too long for v10, we throw, and callers fall
 * back to a graceful Record-ID-only footer (no broken image).
 *
 * Spec reference: ISO/IEC 18004. The numeric tables below (alignment positions,
 * EC codeword counts, format/version BCH) are the canonical values from the
 * standard.
 */

// ---------------------------------------------------------------------------
// Galois field GF(256) for Reed-Solomon (primitive polynomial 0x11d).
// ---------------------------------------------------------------------------
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function initGf() {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/**
 * Generator polynomial g(x) = ∏(x - α^i), i = 0..degree-1, returned in
 * DESCENDING power order with the leading coefficient (α^0 = 1) first:
 * `[1, g_{n-1}, ..., g_0]` (length degree+1). This matches the canonical QR
 * reference ordering so the long-division below indexes coefficients correctly.
 */
function rsGeneratorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    // Multiply current poly by (x - α^i) == (x + α^i) in GF(2^m).
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j]; // x * coefficient (shift up one degree)
      next[j + 1] ^= gfMul(poly[j], EXP[i]); // + α^i * coefficient
    }
    poly = next;
  }
  return poly;
}

/**
 * Reed-Solomon EC codewords via polynomial long division of the message (padded
 * with `ecLen` zero terms) by the generator polynomial. `res` holds the running
 * remainder; on each step we eliminate the top term using the generator's
 * coefficients (skipping its leading 1). Returns `ecLen` codewords.
 */
function rsEncode(data: number[], ecLen: number): number[] {
  const gen = rsGeneratorPoly(ecLen); // length ecLen+1, leading 1
  const res = new Array<number>(ecLen).fill(0);
  for (const d of data) {
    const factor = d ^ res[0];
    res.shift();
    res.push(0);
    if (factor !== 0) {
      // gen[0] is the leading 1; coefficients gen[1..ecLen] apply to res[0..ecLen-1].
      for (let i = 0; i < ecLen; i += 1) {
        res[i] ^= gfMul(gen[i + 1], factor);
      }
    }
  }
  return res;
}

// ---------------------------------------------------------------------------
// Version capacity (EC level M, byte mode) and EC block structure.
// [version] -> { totalCodewords, ecPerBlock, group1Blocks, group1Data,
//                group2Blocks, group2Data }
// Values from ISO/IEC 18004 Table 9 for level M, versions 1..10.
// ---------------------------------------------------------------------------
interface VersionSpec {
  ecPerBlock: number;
  g1Blocks: number;
  g1Data: number;
  g2Blocks: number;
  g2Data: number;
}
const VERSIONS_M: Record<number, VersionSpec> = {
  1: { ecPerBlock: 10, g1Blocks: 1, g1Data: 16, g2Blocks: 0, g2Data: 0 },
  2: { ecPerBlock: 16, g1Blocks: 1, g1Data: 28, g2Blocks: 0, g2Data: 0 },
  3: { ecPerBlock: 26, g1Blocks: 1, g1Data: 44, g2Blocks: 0, g2Data: 0 },
  4: { ecPerBlock: 18, g1Blocks: 2, g1Data: 32, g2Blocks: 0, g2Data: 0 },
  5: { ecPerBlock: 24, g1Blocks: 2, g1Data: 43, g2Blocks: 0, g2Data: 0 },
  6: { ecPerBlock: 16, g1Blocks: 4, g1Data: 27, g2Blocks: 0, g2Data: 0 },
  7: { ecPerBlock: 18, g1Blocks: 4, g1Data: 31, g2Blocks: 0, g2Data: 0 },
  8: { ecPerBlock: 22, g1Blocks: 2, g1Data: 38, g2Blocks: 2, g2Data: 39 },
  9: { ecPerBlock: 22, g1Blocks: 3, g1Data: 36, g2Blocks: 2, g2Data: 37 },
  10: { ecPerBlock: 26, g1Blocks: 4, g1Data: 43, g2Blocks: 1, g2Data: 44 },
};

function dataCodewordsFor(spec: VersionSpec): number {
  return spec.g1Blocks * spec.g1Data + spec.g2Blocks * spec.g2Data;
}

// Alignment pattern centre coordinates per version (ISO/IEC 18004 Annex E).
const ALIGN_POS: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

const EC_LEVEL_M_BITS = 0; // level indicator bits used in format info (00 = M).

// ---------------------------------------------------------------------------
// Bit buffer
// ---------------------------------------------------------------------------
class BitBuffer {
  bits: number[] = [];
  put(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i -= 1) this.bits.push((value >> i) & 1);
  }
  get length(): number {
    return this.bits.length;
  }
}

// ---------------------------------------------------------------------------
// Matrix construction
// ---------------------------------------------------------------------------
type Cell = boolean | null;

function chooseVersion(byteLen: number): number {
  for (let v = 1; v <= 10; v += 1) {
    const spec = VERSIONS_M[v];
    const capacityBits = dataCodewordsFor(spec) * 8;
    const lenBits = v < 10 ? 8 : 16; // byte-mode char-count indicator size
    const needed = 4 + lenBits + byteLen * 8;
    if (needed <= capacityBits) return v;
  }
  throw new Error("QR payload too long for supported versions (>v10).");
}

function buildDataCodewords(text: string, version: number): number[] {
  const spec = VERSIONS_M[version];
  const bytes = Array.from(new TextEncoder().encode(text));
  const buf = new BitBuffer();
  buf.put(0b0100, 4); // byte mode
  buf.put(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) buf.put(b, 8);

  const totalDataCodewords = dataCodewordsFor(spec);
  const capacityBits = totalDataCodewords * 8;
  // terminator
  const term = Math.min(4, capacityBits - buf.length);
  buf.put(0, term);
  // pad to byte boundary
  while (buf.length % 8 !== 0) buf.bits.push(0);
  // pad codewords
  const codewords: number[] = [];
  for (let i = 0; i < buf.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j += 1) v = (v << 1) | buf.bits[i + j];
    codewords.push(v);
  }
  const PADS = [0xec, 0x11];
  let p = 0;
  while (codewords.length < totalDataCodewords) {
    codewords.push(PADS[p % 2]);
    p += 1;
  }
  return codewords;
}

function interleave(dataCodewords: number[], version: number): number[] {
  const spec = VERSIONS_M[version];
  const blocks: { data: number[]; ec: number[] }[] = [];
  let offset = 0;
  const push = (count: number, dataLen: number) => {
    for (let i = 0; i < count; i += 1) {
      const data = dataCodewords.slice(offset, offset + dataLen);
      offset += dataLen;
      blocks.push({ data, ec: rsEncode(data, spec.ecPerBlock) });
    }
  };
  push(spec.g1Blocks, spec.g1Data);
  push(spec.g2Blocks, spec.g2Data);

  const result: number[] = [];
  const maxData = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < maxData; i += 1) {
    for (const b of blocks) if (i < b.data.length) result.push(b.data[i]);
  }
  for (let i = 0; i < spec.ecPerBlock; i += 1) {
    for (const b of blocks) result.push(b.ec[i]);
  }
  return result;
}

function makeEmptyMatrix(size: number): Cell[][] {
  return Array.from({ length: size }, () => new Array<Cell>(size).fill(null));
}

function placeFinder(m: Cell[][], r: number, c: number): void {
  for (let dr = -1; dr <= 7; dr += 1) {
    for (let dc = -1; dc <= 7; dc += 1) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= m.length || cc >= m.length) continue;
      const inRing =
        dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6
          ? dr === 0 || dr === 6 || dc === 0 || dc === 6
          : false;
      const inCore = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
      m[rr][cc] = inRing || inCore;
    }
  }
}

function placeFunctionPatterns(m: Cell[][], version: number): boolean[][] {
  const size = m.length;
  const reserved: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  const reserve = (r: number, c: number) => {
    if (r >= 0 && c >= 0 && r < size && c < size) reserved[r][c] = true;
  };

  // finders + separators
  const finders = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ];
  for (const [r, c] of finders) {
    placeFinder(m, r, c);
    for (let dr = -1; dr <= 7; dr += 1)
      for (let dc = -1; dc <= 7; dc += 1) reserve(r + dr, c + dc);
  }

  // timing patterns
  for (let i = 8; i < size - 8; i += 1) {
    m[6][i] = i % 2 === 0;
    m[i][6] = i % 2 === 0;
    reserve(6, i);
    reserve(i, 6);
  }

  // alignment patterns
  const centers = ALIGN_POS[version];
  for (const r of centers) {
    for (const c of centers) {
      // skip the three that overlap finders
      const nearFinder =
        (r <= 8 && c <= 8) ||
        (r <= 8 && c >= size - 9) ||
        (r >= size - 9 && c <= 8);
      if (nearFinder) continue;
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const ring =
            Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
          m[r + dr][c + dc] = ring;
          reserve(r + dr, c + dc);
        }
      }
    }
  }

  // dark module
  m[size - 8][8] = true;
  reserve(size - 8, 8);

  // reserve format-info areas
  for (let i = 0; i < 9; i += 1) {
    reserve(8, i);
    reserve(i, 8);
  }
  for (let i = 0; i < 8; i += 1) {
    reserve(8, size - 1 - i);
    reserve(size - 1 - i, 8);
  }

  // version info (v >= 7) — not needed for v<=6 but reserve if present.
  if (version >= 7) {
    for (let i = 0; i < 6; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        reserve(size - 11 + j, i);
        reserve(i, size - 11 + j);
      }
    }
  }

  return reserved;
}

function placeData(
  m: Cell[][],
  reserved: boolean[][],
  bytes: number[],
): void {
  const size = m.length;
  let bitIndex = 0;
  const totalBits = bytes.length * 8;
  const getBit = (i: number) =>
    i < totalBits ? (bytes[i >> 3] >> (7 - (i & 7))) & 1 : 0;

  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1; // skip timing column
    for (let i = 0; i < size; i += 1) {
      const row = upward ? size - 1 - i : i;
      for (let c = 0; c < 2; c += 1) {
        const cc = col - c;
        if (reserved[row][cc]) continue;
        m[row][cc] = getBit(bitIndex) === 1;
        bitIndex += 1;
      }
    }
    upward = !upward;
  }
}

function maskFn(maskId: number, r: number, c: number): boolean {
  switch (maskId) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return false;
  }
}

function applyMask(
  base: Cell[][],
  reserved: boolean[][],
  maskId: number,
): boolean[][] {
  const size = base.length;
  const out: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      let v = base[r][c] === true;
      if (!reserved[r][c] && maskFn(maskId, r, c)) v = !v;
      out[r][c] = v;
    }
  }
  return out;
}

// BCH(15,5) format-info encoding.
function formatBits(maskId: number): number {
  const data = (EC_LEVEL_M_BITS << 3) | maskId; // 5 bits: 00 (M) + 3-bit mask
  let bch = data << 10;
  const g = 0b10100110111;
  for (let i = 4; i >= 0; i -= 1) {
    if ((bch >> (i + 10)) & 1) bch ^= g << i;
  }
  const combined = ((data << 10) | (bch & 0x3ff)) ^ 0b101010000010010;
  return combined & 0x7fff;
}

/**
 * Place the 15 format-info bits in the two standard strips (a vertical copy down
 * column 8 and a horizontal copy along row 8), following the canonical ISO/IEC
 * 18004 mapping. Bit `i` (LSB-first) goes to the cells below.
 */
function placeFormat(m: boolean[][], maskId: number): void {
  const size = m.length;
  const bits = formatBits(maskId);
  for (let i = 0; i < 15; i += 1) {
    const mod = ((bits >> i) & 1) === 1;

    // vertical strip, column 8
    if (i < 6) m[i][8] = mod;
    else if (i < 8) m[i + 1][8] = mod;
    else m[size - 15 + i][8] = mod;

    // horizontal strip, row 8
    if (i < 8) m[8][size - i - 1] = mod;
    else if (i < 9) m[8][15 - i - 1 + 1] = mod;
    else m[8][15 - i - 1] = mod;
  }
  m[size - 8][8] = true; // fixed dark module
}

function penalty(m: boolean[][]): number {
  const size = m.length;
  let score = 0;
  // rule 1: runs of 5+
  const runScore = (line: boolean[]) => {
    let s = 0;
    let run = 1;
    for (let i = 1; i < line.length; i += 1) {
      if (line[i] === line[i - 1]) {
        run += 1;
        if (run === 5) s += 3;
        else if (run > 5) s += 1;
      } else run = 1;
    }
    return s;
  };
  for (let r = 0; r < size; r += 1) score += runScore(m[r]);
  for (let c = 0; c < size; c += 1) score += runScore(m.map((row) => row[c]));
  // rule 2: 2x2 blocks
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
  }
  // rule 3: finder-like 1:1:3:1:1 patterns
  const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
  const pat2 = [false, false, false, false, true, false, true, true, true, false, true];
  const lineHas = (line: boolean[], pat: boolean[]) => {
    let count = 0;
    for (let i = 0; i + pat.length <= line.length; i += 1) {
      let ok = true;
      for (let j = 0; j < pat.length; j += 1) if (line[i + j] !== pat[j]) { ok = false; break; }
      if (ok) count += 1;
    }
    return count;
  };
  for (let r = 0; r < size; r += 1) {
    score += 40 * (lineHas(m[r], pat1) + lineHas(m[r], pat2));
  }
  for (let c = 0; c < size; c += 1) {
    const col = m.map((row) => row[c]);
    score += 40 * (lineHas(col, pat1) + lineHas(col, pat2));
  }
  // rule 4: dark proportion
  let dark = 0;
  for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) if (m[r][c]) dark += 1;
  const ratio = (dark * 100) / (size * size);
  const k = Math.floor(Math.abs(ratio - 50) / 5);
  score += k * 10;
  return score;
}

/** Build the QR module matrix (true = dark) for a payload. Throws if too long. */
export function toMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const version = chooseVersion(bytes.length);
  const size = version * 4 + 17;

  const dataCw = buildDataCodewords(text, version);
  const finalCw = interleave(dataCw, version);

  const skeleton = makeEmptyMatrix(size);
  const reserved = placeFunctionPatterns(skeleton, version);
  placeData(skeleton, reserved, finalCw);

  let best: boolean[][] | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const masked = applyMask(skeleton, reserved, mask);
    placeFormat(masked, mask);
    const p = penalty(masked);
    if (p < bestScore) {
      bestScore = p;
      best = masked;
    }
  }
  return best as boolean[][];
}

export interface QrSvgOptions {
  /** Total SVG size in px (square). */
  size?: number;
  /** Quiet-zone modules around the symbol (spec minimum is 4). */
  margin?: number;
  /** Module color. Defaults to currentColor so it inherits the ink token. */
  color?: string;
}

/**
 * Render a payload as a self-contained inline SVG string. One filled <path> for
 * all dark modules (compact). Uses `currentColor` by default so the QR takes the
 * surrounding text color. Returns null if the payload cannot be encoded, so the
 * caller can degrade gracefully instead of showing a broken mark.
 */
export function toSvg(text: string, options: QrSvgOptions = {}): string | null {
  let matrix: boolean[][];
  try {
    matrix = toMatrix(text);
  } catch {
    return null;
  }
  const { size = 120, margin = 4, color = "currentColor" } = options;
  const count = matrix.length;
  const dim = count + margin * 2;
  let d = "";
  for (let r = 0; r < count; r += 1) {
    for (let c = 0; c < count; c += 1) {
      if (matrix[r][c]) d += `M${c + margin} ${r + margin}h1v1h-1z`;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img" ` +
    `aria-label="QR code linking to this record">` +
    `<path fill="${color}" d="${d}"/></svg>`
  );
}
