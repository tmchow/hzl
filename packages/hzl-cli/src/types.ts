// packages/hzl-cli/src/types.ts
import { z } from 'zod';

export const OutputFormatSchema = z.enum(['json', 'md']);

export const GlobalOptionsSchema = z
  .object({
    db: z.string().optional(),
    format: OutputFormatSchema.default('json'),
    // Internal compatibility field so existing commands can keep using `globalOpts.json`.
    json: z.boolean().optional(),
  })
  .transform((value) => ({
    db: value.db,
    format: value.format,
    json: value.format === 'json',
  }));

export type GlobalOptions = z.infer<typeof GlobalOptionsSchema>;

export interface Config {
  dbPath?: string;
  db?: {
    events?: {
      path?: string;
      syncUrl?: string;
      authToken?: string;
      syncMode?: 'replica' | 'offline';
      readYourWrites?: boolean;
      encryptionKey?: string;
    };
    cache?: {
      path?: string;
    };
    sync?: {
      policy?: 'manual' | 'opportunistic' | 'strict';
      staleAfterMs?: number;
      minIntervalMs?: number;
      conflictStrategy?: 'merge' | 'discard-local' | 'fail';
    };
  };
  hooks?: {
    on_done?: {
      url?: string;
      headers?: Record<string, string>;
    };
  };
  defaultProject?: string;
  defaultAuthor?: string;
  leaseMinutes?: number;
  claimStaggerMs?: number;
  syncUrl?: string;
  authToken?: string;
  encryptionKey?: string;
}

export interface CommandContext {
  dbPath: string;
  format: z.infer<typeof OutputFormatSchema>;
  json: boolean;
}
