import { ulid } from 'ulid';

export function generateId(): string {
  return ulid();
}

const ULID_REGEX = /^[0-9A-Z]{26}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return ULID_REGEX.test(id) || UUID_REGEX.test(id);
}
