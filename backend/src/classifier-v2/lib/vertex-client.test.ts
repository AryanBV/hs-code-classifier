/**
 * Unit tests for `sanitizeResponseSchema` — the JSON-Schema-draft → Vertex
 * OpenAPI-3.0-subset normalizer.
 *
 * Root-cause regression guard for the Phase 4.2a Task-13 full-pipeline smoke:
 * Vertex's `generationConfig.responseSchema` rejects draft-07 constructs the v2
 * prompt schemas (triage-v2.md, select-v2.md) are authored with. The live API
 * returned HTTP 400 on `$schema`, `type: [...,"null"]` arrays, and top-level
 * `allOf`/`if`/`then`. These tests assert the sanitizer strips/rewrites exactly
 * those constructs so a future schema edit that reintroduces them fails here
 * (cheaply) instead of at the next billed live call.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeResponseSchema } from './vertex-client';

describe('sanitizeResponseSchema', () => {
  it('drops $schema', () => {
    const out = sanitizeResponseSchema({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
    });
    expect('$schema' in out).toBe(false);
    expect(out.type).toBe('object');
  });

  it('rewrites nullable type-array to scalar type + nullable:true', () => {
    const out = sanitizeResponseSchema({ type: ['string', 'null'] });
    expect(out.type).toBe('string');
    expect(out.nullable).toBe(true);
  });

  it('keeps a plain scalar type without adding nullable', () => {
    const out = sanitizeResponseSchema({ type: 'string' });
    expect(out.type).toBe('string');
    expect('nullable' in out).toBe(false);
  });

  it('drops top-level allOf / if / then / else conditional composition', () => {
    const out = sanitizeResponseSchema({
      type: 'object',
      allOf: [{ if: { properties: {} }, then: {}, else: {} }],
    });
    expect('allOf' in out).toBe(false);
    expect('if' in out).toBe(false);
    expect('then' in out).toBe(false);
    expect('else' in out).toBe(false);
  });

  it('drops additionalProperties and const (not in the Vertex subset)', () => {
    const out = sanitizeResponseSchema({
      type: 'object',
      additionalProperties: false,
      properties: { x: { const: null } },
    });
    expect('additionalProperties' in out).toBe(false);
    const props = out.properties as Record<string, Record<string, unknown>>;
    expect('const' in props.x).toBe(false);
  });

  it('strips a bare null member from an enum and marks nullable', () => {
    const out = sanitizeResponseSchema({
      type: 'string',
      enum: ['a', 'b', null],
    });
    expect(out.enum).toEqual(['a', 'b']);
    expect(out.nullable).toBe(true);
  });

  it('recurses into properties and items', () => {
    const out = sanitizeResponseSchema({
      type: 'object',
      properties: {
        arr: {
          type: 'array',
          items: { type: ['string', 'null'] },
        },
        nested: {
          type: 'object',
          properties: { v: { type: ['number', 'null'] } },
        },
      },
    });
    const props = out.properties as Record<string, Record<string, unknown>>;
    const items = props.arr.items as Record<string, unknown>;
    expect(items.type).toBe('string');
    expect(items.nullable).toBe(true);
    const nestedProps = (props.nested.properties as Record<string, Record<string, unknown>>);
    expect(nestedProps.v.type).toBe('number');
    expect(nestedProps.v.nullable).toBe(true);
  });

  it('retains supported constraint keywords (enum, minItems, pattern, etc.)', () => {
    const out = sanitizeResponseSchema({
      type: 'array',
      minItems: 1,
      maxItems: 5,
      items: { type: 'string', pattern: '^\\d{2}$' },
    });
    expect(out.minItems).toBe(1);
    expect(out.maxItems).toBe(5);
    const items = out.items as Record<string, unknown>;
    expect(items.pattern).toBe('^\\d{2}$');
  });

  it('does not mutate the input object', () => {
    const input = {
      $schema: 'x',
      type: ['string', 'null'] as const,
      allOf: [{}],
    };
    const snapshot = JSON.stringify(input);
    sanitizeResponseSchema(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
