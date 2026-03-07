import { TaskStatus } from 'hzl-core/events/types.js';
import { CLIError, ExitCode } from './errors.js';

interface IntBounds {
  min?: number;
  max?: number;
}

export const TASK_STATUSES = Object.values(TaskStatus) as TaskStatus[];

function formatRange(bounds: IntBounds): string {
  if (bounds.min !== undefined && bounds.max !== undefined) {
    return `an integer between ${bounds.min} and ${bounds.max}`;
  }
  if (bounds.min !== undefined) {
    return `an integer >= ${bounds.min}`;
  }
  if (bounds.max !== undefined) {
    return `an integer <= ${bounds.max}`;
  }
  return 'an integer';
}

export function parseInteger(
  raw: string | number,
  fieldName: string,
  bounds: IntBounds = {}
): number {
  let value: number;

  if (typeof raw === 'number') {
    value = raw;
  } else {
    const trimmed = raw.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      throw new CLIError(`${fieldName} must be an integer`, ExitCode.InvalidInput);
    }
    value = Number(trimmed);
  }

  if (!Number.isInteger(value)) {
    throw new CLIError(`${fieldName} must be an integer`, ExitCode.InvalidInput);
  }

  if (bounds.min !== undefined && value < bounds.min) {
    throw new CLIError(`${fieldName} must be ${formatRange(bounds)}`, ExitCode.InvalidInput);
  }

  if (bounds.max !== undefined && value > bounds.max) {
    throw new CLIError(`${fieldName} must be ${formatRange(bounds)}`, ExitCode.InvalidInput);
  }

  return value;
}

export function parseOptionalInteger(
  raw: string | number | undefined,
  fieldName: string,
  bounds: IntBounds = {}
): number | undefined {
  if (raw === undefined) return undefined;
  return parseInteger(raw, fieldName, bounds);
}

export function parseIntegerWithDefault(
  raw: string | number | undefined,
  fieldName: string,
  defaultValue: number,
  bounds: IntBounds = {}
): number {
  if (raw === undefined) return parseInteger(defaultValue, fieldName, bounds);
  return parseInteger(raw, fieldName, bounds);
}

export function parseDurationMinutes(
  raw: string | number,
  fieldName: string,
  bounds: IntBounds = {}
): number {
  if (typeof raw === 'number') {
    return parseInteger(raw, fieldName, bounds);
  }

  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d+)([mhd])?$/i);
  if (!match) {
    throw new CLIError(
      `${fieldName} must be a duration like 30, 30m, 2h, or 7d`,
      ExitCode.InvalidInput
    );
  }

  const value = Number(match[1]);
  const suffix = (match[2] ?? 'm').toLowerCase();
  const multiplier = suffix === 'h' ? 60 : suffix === 'd' ? 1_440 : 1;
  return parseInteger(value * multiplier, fieldName, bounds);
}

export function parseOptionalDurationMinutes(
  raw: string | number | undefined,
  fieldName: string,
  bounds: IntBounds = {}
): number | undefined {
  if (raw === undefined) return undefined;
  return parseDurationMinutes(raw, fieldName, bounds);
}

export function parseEnumValue<T extends string>(
  raw: string | undefined,
  fieldName: string,
  allowed: readonly T[]
): T | undefined {
  if (raw === undefined) return undefined;
  if (!allowed.includes(raw as T)) {
    throw new CLIError(
      `Invalid ${fieldName}: ${raw}. Must be one of: ${allowed.join(', ')}`,
      ExitCode.InvalidInput
    );
  }
  return raw as T;
}

export function parseTaskStatus(raw: string | undefined, fieldName = 'status'): TaskStatus | undefined {
  return parseEnumValue(raw, fieldName, TASK_STATUSES);
}
