// packages/hzl-cli/src/types.ts
import { z } from 'zod';

export const GlobalOptionsSchema = z.object({
  db: z.string().optional(),
  json: z.boolean().default(false),
});

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
  defaultProject?: string;
  defaultAuthor?: string;
  leaseMinutes?: number;
  syncUrl?: string;
  authToken?: string;
  encryptionKey?: string;
}

export interface CommandContext {
  dbPath: string;
  json: boolean;
}
