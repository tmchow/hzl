import { describe, it, expect } from 'vitest';
import { parseEnumValue, parseInteger, parseIntegerWithDefault, parseOptionalInteger, parseTaskStatus } from './parse.js';
import { TaskStatus } from 'hzl-core/events/types.js';

describe('parseInteger', () => {
  it('parses integer strings', () => {
    expect(parseInteger('42', 'Limit')).toBe(42);
  });

  it('rejects non-integers', () => {
    expect(() => parseInteger('4.2', 'Limit')).toThrow(/must be an integer/);
    expect(() => parseInteger('abc', 'Limit')).toThrow(/must be an integer/);
  });

  it('applies bounds', () => {
    expect(parseInteger('3', 'Priority', { min: 0, max: 3 })).toBe(3);
    expect(() => parseInteger('-1', 'Priority', { min: 0, max: 3 })).toThrow(/between 0 and 3/);
    expect(() => parseInteger('4', 'Priority', { min: 0, max: 3 })).toThrow(/between 0 and 3/);
  });
});

describe('parseOptionalInteger', () => {
  it('returns undefined for missing values', () => {
    expect(parseOptionalInteger(undefined, 'Lease')).toBeUndefined();
  });

  it('parses provided values', () => {
    expect(parseOptionalInteger('15', 'Lease', { min: 1 })).toBe(15);
  });
});

describe('parseIntegerWithDefault', () => {
  it('uses default when undefined', () => {
    expect(parseIntegerWithDefault(undefined, 'Limit', 20, { min: 1 })).toBe(20);
  });

  it('uses provided value when present', () => {
    expect(parseIntegerWithDefault('10', 'Limit', 20, { min: 1 })).toBe(10);
  });
});

describe('parseEnumValue', () => {
  it('returns undefined when value is missing', () => {
    expect(parseEnumValue(undefined, 'mode', ['a', 'b'])).toBeUndefined();
  });

  it('parses allowed values', () => {
    expect(parseEnumValue('a', 'mode', ['a', 'b'])).toBe('a');
  });

  it('rejects unknown values', () => {
    expect(() => parseEnumValue('c', 'mode', ['a', 'b'])).toThrow(/Invalid mode/);
  });
});

describe('parseTaskStatus', () => {
  it('parses valid status', () => {
    expect(parseTaskStatus(TaskStatus.Ready)).toBe(TaskStatus.Ready);
  });

  it('rejects invalid status', () => {
    expect(() => parseTaskStatus('running')).toThrow(/Invalid status/);
  });
});
