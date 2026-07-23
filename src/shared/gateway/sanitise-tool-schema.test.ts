import { describe, expect, test } from 'bun:test';
import { sanitiseToolSchema } from './sanitise-tool-schema.ts';

// The shapes below are lifted from the 29 tool schemas the agent actually sends, captured
// against a stand-in endpoint rather than imagined. See .claude/PLAN.md.
describe('preparing a tool schema for an endpoint that only understands Google Schema', () => {
  test('the fields describing what the tool takes all survive', () => {
    const schema = {
      type: 'object',
      description: 'Reads a file',
      properties: {
        path: { type: 'string', description: 'Absolute path', minLength: 1, maxLength: 500, pattern: '^/' },
        limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
      },
      required: ['path'],
    };

    expect(sanitiseToolSchema(schema)).toEqual(schema);
  });

  test('the fields Gemini refuses outright are dropped', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      propertyNames: { type: 'string' },
      properties: { size: { type: 'number', exclusiveMinimum: 0 } },
    };

    expect(sanitiseToolSchema(schema)).toEqual({ type: 'object', properties: { size: { type: 'number' } } });
  });

  test('a fixed value survives as a one-choice enum, because Gemini has no const', () => {
    expect(sanitiseToolSchema({ type: 'string', const: 'proactive' })).toEqual({ type: 'string', enum: ['proactive'] });
  });

  test('a format Gemini does not know is dropped, one it does know is kept', () => {
    expect(sanitiseToolSchema({ type: 'string', format: 'uri' })).toEqual({ type: 'string' });
    expect(sanitiseToolSchema({ type: 'string', format: 'date-time' })).toEqual({ type: 'string', format: 'date-time' });
  });

  // The two lists below ARE this module's contract, so each entry is pinned individually.
  // Left to a sample, most of them could be deleted and every other test would still pass.
  test.each([
    'type',
    'title',
    'description',
    'nullable',
    'enum',
    'required',
    'default',
    'example',
    'pattern',
    'minimum',
    'maximum',
    'minLength',
    'maxLength',
    'minItems',
    'maxItems',
    'minProperties',
    'maxProperties',
    'propertyOrdering',
  ])('a schema describing itself with %s keeps it, because Google Schema has that field', (field) => {
    expect(sanitiseToolSchema({ [field]: 'kept' })).toEqual({ [field]: 'kept' });
  });

  test.each(['enum', 'date-time', 'float', 'double', 'int32', 'int64'])('format %s is one Google understands, so it survives', (format) => {
    expect(sanitiseToolSchema({ type: 'string', format })).toEqual({ type: 'string', format });
  });

  test('list items are cleaned as thoroughly as the object holding them', () => {
    const schema = { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false, properties: { width: { type: 'number', exclusiveMinimum: 0 } } } };

    expect(sanitiseToolSchema(schema)).toEqual({ type: 'array', maxItems: 4, items: { type: 'object', properties: { width: { type: 'number' } } } });
  });

  test('each alternative in an anyOf is cleaned in place', () => {
    const schema = {
      anyOf: [
        { type: 'string', enum: ['pending', 'done'] },
        { type: 'string', const: 'deleted' },
      ],
    };

    expect(sanitiseToolSchema(schema)).toEqual({
      anyOf: [
        { type: 'string', enum: ['pending', 'done'] },
        { type: 'string', enum: ['deleted'] },
      ],
    });
  });

  test('a property literally named "const" or "items" is a property, not a keyword', () => {
    const schema = { type: 'object', properties: { const: { type: 'string' }, items: { type: 'number', exclusiveMinimum: 0 } } };

    expect(sanitiseToolSchema(schema)).toEqual({ type: 'object', properties: { const: { type: 'string' }, items: { type: 'number' } } });
  });

  test('anything that is not a schema object at all becomes an empty one', () => {
    expect(sanitiseToolSchema(true)).toEqual({});
    expect(sanitiseToolSchema(null)).toEqual({});
    expect(sanitiseToolSchema(['nonsense'])).toEqual({});
  });

  test('a malformed properties block does not take the whole schema down', () => {
    expect(sanitiseToolSchema({ type: 'object', properties: 'not an object' })).toEqual({ type: 'object', properties: {} });
    expect(sanitiseToolSchema({ anyOf: 'not a list' })).toEqual({ anyOf: [] });
  });

  test('nothing Gemini rejects survives anywhere in a real tool schema', () => {
    const artifact = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      additionalProperties: false,
      type: 'object',
      properties: {
        capabilities: { additionalProperties: {}, propertyNames: { type: 'string', minLength: 1, maxLength: 64 }, type: 'object' },
        contract: {
          anyOf: [
            { type: 'string', const: 'latest' },
            { type: 'string', pattern: '^(0|[1-9])$' },
          ],
        },
        url: { type: 'string', format: 'uri' },
      },
    };
    const banned = ['$schema', 'additionalProperties', 'propertyNames', 'exclusiveMinimum', 'const'];

    const cleaned = JSON.stringify(sanitiseToolSchema(artifact));

    expect(banned.some((key) => cleaned.includes(`"${key}"`))).toBe(false);
    expect(cleaned.includes('"uri"')).toBe(false);
    expect(cleaned).toContain('"enum":["latest"]');
  });
});
