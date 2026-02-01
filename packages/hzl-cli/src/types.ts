// packages/hzl-cli/src/types.ts
import { z } from 'zod';

export const GlobalOptionsSchema = z.object({
  db: z.string().optional(),
  json: z.boolean().default(false),
});

export type GlobalOptions = z.infer<typeof GlobalOptionsSchema>;

export interface Config {
  dbPath?: string;
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
