import { describe, it, expect, beforeAll } from 'vitest';

const hasEnv = !!(process.env.OPENAI_API_KEY && process.env.DATABASE_URL);
let classify: (query: string) => Promise<any>;

beforeAll(async () => {
  if (hasEnv) {
    const mod = await import('../classifier');
    classify = mod.classify;
  }
});

describe('Classification Pipeline — Vehicle Parts', () => {
  it.skipIf(!hasEnv)('ceramic brake pads for heavy trucks → Ch.87 / 8708', async () => {
    const result = await classify('ceramic brake pads for heavy trucks');
    expect(result.responseType).toBe('classification');
    expect(result.hsCode?.substring(0, 2)).toBe('87');
    expect(result.hsCode?.substring(0, 4)).toBe('8708');
  });

  it.skipIf(!hasEnv)('aluminium radiator for car → Ch.87', async () => {
    const result = await classify('aluminium radiator for car');
    expect(result.responseType).toBe('classification');
    expect(result.hsCode?.substring(0, 2)).toBe('87');
  });
});

describe('Classification Pipeline — Textiles', () => {
  it.skipIf(!hasEnv)('knitted cotton t-shirt → Ch.61 / 6109', async () => {
    const result = await classify('knitted cotton t-shirt');
    expect(result.responseType).toBe('classification');
    expect(result.hsCode?.substring(0, 2)).toBe('61');
    expect(result.hsCode?.substring(0, 4)).toBe('6109');
  });

  it.skipIf(!hasEnv)('woven cotton shirt men → Ch.62', async () => {
    const result = await classify('woven cotton shirt men');
    expect(result.responseType).toBe('classification');
    expect(result.hsCode?.substring(0, 2)).toBe('62');
  });
});

describe('Classification Pipeline — Food & Agriculture', () => {
  it.skipIf(!hasEnv)('arabica coffee beans grade A → Ch.09 / 0901', async () => {
    const result = await classify('arabica coffee beans grade A');
    expect(result.responseType).toBe('classification');
    expect(result.hsCode?.substring(0, 2)).toBe('09');
    expect(result.hsCode?.substring(0, 4)).toBe('0901');
  });

  it.skipIf(!hasEnv)('instant coffee powder → Ch.21 / 2101', async () => {
    const result = await classify('instant coffee powder');
    expect(result.responseType).toBe('classification');
    expect(result.hsCode?.substring(0, 2)).toBe('21');
    expect(result.hsCode?.substring(0, 4)).toBe('2101');
  });
});

describe('Classification Pipeline — Chemicals & Pharmaceuticals', () => {
  it.skipIf(!hasEnv)('portland cement powder bulk → Ch.25 / 2523', async () => {
    const result = await classify('portland cement powder bulk');
    expect(result.responseType).toBe('classification');
    expect(result.hsCode?.substring(0, 2)).toBe('25');
    expect(result.hsCode?.substring(0, 4)).toBe('2523');
  });

  it.skipIf(!hasEnv)('paracetamol tablets 500mg → Ch.30 / 3004', async () => {
    const result = await classify('paracetamol tablets 500mg');
    expect(result.responseType).toBe('classification');
    expect(result.hsCode?.substring(0, 2)).toBe('30');
  });
});

describe('Classification Pipeline — Miscellaneous', () => {
  it.skipIf(!hasEnv)('turmeric powder → Ch.09 / 0910', async () => {
    const result = await classify('turmeric powder');
    expect(result.responseType).toBe('classification');
    expect(result.hsCode?.substring(0, 2)).toBe('09');
    expect(result.hsCode?.substring(0, 4)).toBe('0910');
  });

  it.skipIf(!hasEnv)('lithium ion battery for laptop → Ch.85 / 8507', async () => {
    const result = await classify('lithium ion battery for laptop');
    expect(result.responseType).toBe('classification');
    expect(result.hsCode?.substring(0, 2)).toBe('85');
    expect(result.hsCode?.substring(0, 4)).toBe('8507');
  });
});
