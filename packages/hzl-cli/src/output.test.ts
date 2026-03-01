import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  SCHEMA_VERSION,
  createErrorEnvelope,
  createFormatter,
  createSuccessEnvelope,
} from './output.js';

describe('output envelopes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates success envelope with schema version', () => {
    const envelope = createSuccessEnvelope({ foo: 'bar' });
    expect(envelope).toEqual({
      schema_version: SCHEMA_VERSION,
      ok: true,
      data: { foo: 'bar' },
    });
  });

  it('creates error envelope with structured error object', () => {
    const envelope = createErrorEnvelope('invalid_input', 'Bad input', { field: 'priority' });
    expect(envelope).toEqual({
      schema_version: SCHEMA_VERSION,
      ok: false,
      error: {
        code: 'invalid_input',
        message: 'Bad input',
        details: { field: 'priority' },
      },
    });
  });

  it('creates error envelope with suggestions', () => {
    const envelope = createErrorEnvelope('not_found', 'Task not found', undefined, [
      'hzl task list -P demo',
    ]);
    expect(envelope).toEqual({
      schema_version: SCHEMA_VERSION,
      ok: false,
      error: {
        code: 'not_found',
        message: 'Task not found',
        suggestions: ['hzl task list -P demo'],
      },
    });
  });

  it('omits suggestions from error envelope when empty', () => {
    const envelope = createErrorEnvelope('not_found', 'Task not found');
    expect(envelope.error).not.toHaveProperty('suggestions');
  });

  it('prints success envelope in json mode', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    createFormatter(true).json({ hello: 'world' });
    expect(logSpy).toHaveBeenCalledTimes(1);

    const printed = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(printed).toEqual({
      schema_version: SCHEMA_VERSION,
      ok: true,
      data: { hello: 'world' },
    });
  });
});

