/**
 * Unit tests for the OpenRouter structured-output adapter (EVAL-ONLY).
 *
 * Asserts the schema mapping is FAITHFUL — a sloppy adapter makes a candidate
 * model look worse than it is. No network; pure transform tests.
 */
import { describe, it, expect } from 'vitest';
import { toOpenAiJsonSchema, looksLikeValidJsonObject } from './openrouter-schema-adapter';

describe('toOpenAiJsonSchema', () => {
  it('drops draft-07 $schema / additionalProperties / const and keeps shape', () => {
    const out = toOpenAiJsonSchema({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      additionalProperties: false,
      const: 'x',
      properties: { code: { type: 'string' } },
      required: ['code'],
    });
    expect('$schema' in out).toBe(false);
    expect('additionalProperties' in out).toBe(false);
    expect('const' in out).toBe(false);
    expect(out.type).toBe('object');
    expect(out.required).toEqual(['code']);
    expect((out.properties as Record<string, unknown>).code).toEqual({ type: 'string' });
  });

  it('keeps a draft-07 nullable type-array as-is', () => {
    const out = toOpenAiJsonSchema({
      type: 'object',
      properties: { material: { type: ['string', 'null'] } },
    });
    const props = out.properties as Record<string, Record<string, unknown>>;
    expect(props.material.type).toEqual(['string', 'null']);
  });

  it('rewrites a Vertex-subset nullable:true scalar → JSON-Schema type-array', () => {
    const out = toOpenAiJsonSchema({
      type: 'object',
      properties: { material: { type: 'string', nullable: true } },
    });
    const props = out.properties as Record<string, Record<string, unknown>>;
    expect(props.material.type).toEqual(['string', 'null']);
    // nullable must not leak through (it is not a JSON-Schema keyword).
    expect('nullable' in props.material).toBe(false);
  });

  it('re-adds a null enum member when the node is nullable', () => {
    const out = toOpenAiJsonSchema({
      type: 'string',
      nullable: true,
      enum: ['a', 'b'],
    });
    expect(out.type).toEqual(['string', 'null']);
    expect(out.enum).toEqual(['a', 'b', null]);
  });

  it('recurses into items (arrays of objects)', () => {
    const out = toOpenAiJsonSchema({
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, score: { type: 'number' } },
        required: ['id', 'score'],
      },
    });
    expect(out.type).toBe('array');
    const items = out.items as Record<string, unknown>;
    expect(items.type).toBe('object');
    expect(items.required).toEqual(['id', 'score']);
  });

  it('drops the Vertex-only propertyOrdering hint', () => {
    const out = toOpenAiJsonSchema({
      type: 'object',
      properties: { a: { type: 'string' } },
      propertyOrdering: ['a'],
    });
    expect('propertyOrdering' in out).toBe(false);
  });

  it('preserves enum/min/max/pattern numeric+string constraints', () => {
    const out = toOpenAiJsonSchema({
      type: 'object',
      properties: {
        completeness: { type: 'number', minimum: 0, maximum: 1 },
        decision: { type: 'string', enum: ['CLASSIFY', 'ASK', 'REFUSE'] },
        chapter: { type: 'string', pattern: '^\\d{2}$' },
      },
    });
    const p = out.properties as Record<string, Record<string, unknown>>;
    expect(p.completeness.minimum).toBe(0);
    expect(p.completeness.maximum).toBe(1);
    expect(p.decision.enum).toEqual(['CLASSIFY', 'ASK', 'REFUSE']);
    expect(p.chapter.pattern).toBe('^\\d{2}$');
  });

  it('returns {} for a non-object node (defensive)', () => {
    expect(toOpenAiJsonSchema('nope')).toEqual({});
    expect(toOpenAiJsonSchema(null)).toEqual({});
    expect(toOpenAiJsonSchema(42)).toEqual({});
  });
});

describe('looksLikeValidJsonObject', () => {
  it('accepts clean JSON objects', () => {
    expect(looksLikeValidJsonObject('{"a":1}')).toBe(true);
  });
  it('accepts a JSON object wrapped in stray prose (brace extraction)', () => {
    expect(looksLikeValidJsonObject('Here you go:\n{"decision":"CLASSIFY"}\nThanks')).toBe(true);
  });
  it('rejects empty / whitespace / non-object', () => {
    expect(looksLikeValidJsonObject('')).toBe(false);
    expect(looksLikeValidJsonObject('   ')).toBe(false);
    expect(looksLikeValidJsonObject('[1,2,3]')).toBe(false);
    expect(looksLikeValidJsonObject('plain text no json')).toBe(false);
  });
});
