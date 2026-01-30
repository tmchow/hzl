// packages/hzl-cli/src/types.test.ts
import { describe, it, expect } from 'vitest';
import { GlobalOptionsSchema, type GlobalOptions, type Config } from './types.js';

describe('GlobalOptions', () => {
  it('validates valid options with db path', () => {
    const options = { db: '/path/to/db.sqlite', json: false };
    const result = GlobalOptionsSchema.safeParse(options);
    expect(result.success).toBe(true);
  });

  it('sets default values correctly', () => {
    const options = {};
    const result = GlobalOptionsSchema.parse(options);
    expect(result.json).toBe(false);
    expect(result.db).toBeUndefined();
  });
});

describe('Config type', () => {
  it('has correct shape', () => {
    const config: Config = { dbPath: '/path/to/db', defaultProject: 'inbox' };
    expect(config.dbPath).toBe('/path/to/db');
  });
});
