import { describe, expect, it } from 'vitest';
import {
  getNumberProperty,
  getStringProperty,
  isRecord,
  parseJsonObject,
  parseJsonValue,
} from './json.js';

describe('json utils', () => {
  it('parses raw JSON as unknown', () => {
    expect(parseJsonValue('{"ok":true}')).toEqual({ ok: true });
  });

  it('detects plain records', () => {
    expect(isRecord({ ok: true })).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
  });

  it('parses object JSON safely', () => {
    expect(parseJsonObject('{"value":1}')).toEqual({ value: 1 });
    expect(parseJsonObject('[1,2,3]')).toBeNull();
    expect(parseJsonObject('not json')).toBeNull();
    expect(parseJsonObject(null)).toBeNull();
  });

  it('reads typed properties from records', () => {
    const record: Record<string, unknown> = {
      name: 'hzl',
      count: 3,
      enabled: true,
    };

    expect(getStringProperty(record, 'name')).toBe('hzl');
    expect(getStringProperty(record, 'count')).toBeNull();
    expect(getNumberProperty(record, 'count')).toBe(3);
    expect(getNumberProperty(record, 'enabled')).toBeNull();
  });
});
