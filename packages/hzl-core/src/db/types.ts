import { z } from 'zod';

// ULID format validation (26 chars, Crockford's Base32)
const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
export const UlidSchema = z.string().regex(ULID_REGEX, 'Invalid ULID format');

// Turso/libsql URL validation (must be libsql:// or https://)
const TURSO_URL_REGEX = /^(libsql|https):\/\/[a-zA-Z0-9][a-zA-Z0-9-]*(\.[a-zA-Z0-9-]+)*(:\d+)?(\/.*)?$/;
export const TursoUrlSchema = z.string().regex(TURSO_URL_REGEX, 'Invalid Turso URL (must be libsql:// or https://)');

export const SyncModeSchema = z.enum(['replica', 'offline']);
export type SyncMode = z.infer<typeof SyncModeSchema>;

export const SyncPolicySchema = z.enum(['manual', 'opportunistic', 'strict']);
export type SyncPolicy = z.infer<typeof SyncPolicySchema>;

export const ConflictStrategySchema = z.enum(['merge', 'discard-local', 'fail']);
export type ConflictStrategy = z.infer<typeof ConflictStrategySchema>;

export const EventsDbConfigSchema = z.object({
    path: z.string().optional(),
    // Validated Turso URL format (libsql:// or https://)
    syncUrl: TursoUrlSchema.optional(),
    authToken: z.string().optional(),
    syncMode: SyncModeSchema.optional().default('offline'),
    encryptionKey: z.string().optional(),
    encryptionCipher: z.string().optional(),
    readYourWrites: z.boolean().optional().default(true),
}).optional();

export const CacheDbConfigSchema = z.object({
    path: z.string().optional(),
}).optional();

export const SyncConfigSchema = z.object({
    policy: SyncPolicySchema.optional().default('opportunistic'),
    staleAfterMs: z.number().positive().optional().default(60000),
    minIntervalMs: z.number().positive().optional().default(15000),
    failureBackoffMs: z.number().positive().optional().default(60000),
    lockTimeoutMs: z.number().positive().optional().default(3000),
    // Timeout for individual sync() calls (prevents hanging)
    syncTimeoutMs: z.number().positive().optional().default(30000),
    // Rate limiting: max sync attempts per minute
    maxSyncAttemptsPerMinute: z.number().positive().optional().default(10),
    conflictStrategy: ConflictStrategySchema.optional().default('merge'),
}).optional();

export const DbConfigSchema = z.object({
    events: EventsDbConfigSchema,
    cache: CacheDbConfigSchema,
    timeoutSec: z.number().positive().optional(),
    syncPeriod: z.number().nonnegative().optional(),
    sync: SyncConfigSchema,
}).partial();

export type DbConfig = z.infer<typeof DbConfigSchema>;
export type EventsDbConfig = z.infer<typeof EventsDbConfigSchema>;
export type CacheDbConfig = z.infer<typeof CacheDbConfigSchema>;
export type SyncConfig = z.infer<typeof SyncConfigSchema>;

export interface SyncResult {
    frames_synced: number;
    frame_no: number;
}

export interface SyncStats {
    attempted: boolean;
    success: boolean;
    framesSynced?: number;
    frameNo?: number;
    error?: string;
}
