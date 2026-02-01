import { describe, it, expect } from 'vitest';
import { DbConfigSchema, SyncPolicySchema, UlidSchema, TursoUrlSchema } from '../types.js';

describe('UlidSchema', () => {
    it('accepts valid ULIDs', () => {
        expect(UlidSchema.safeParse('01HQ3K5BXYZ123456789ABCDEF').success).toBe(true);
        expect(UlidSchema.safeParse('01ARZ3NDEKTSV4RRFFQ69G5FAV').success).toBe(true);
    });

    it('rejects invalid ULIDs', () => {
        expect(UlidSchema.safeParse('invalid').success).toBe(false);
        expect(UlidSchema.safeParse('01HQ3K5BXYZ12345678').success).toBe(false); // Too short
        expect(UlidSchema.safeParse('01HQ3K5BXYZ123456789ABCDEFGH').success).toBe(false); // Too long
        expect(UlidSchema.safeParse('01HQ3K5BXYZ123456789ABCDEI').success).toBe(false); // Invalid char I
        expect(UlidSchema.safeParse('01HQ3K5BXYZ123456789ABCDEL').success).toBe(false); // Invalid char L
        expect(UlidSchema.safeParse('01HQ3K5BXYZ123456789ABCDEO').success).toBe(false); // Invalid char O
        expect(UlidSchema.safeParse('01HQ3K5BXYZ123456789ABCDEU').success).toBe(false); // Invalid char U
    });
});

describe('TursoUrlSchema', () => {
    it('accepts valid Turso URLs', () => {
        expect(TursoUrlSchema.safeParse('libsql://my-db.turso.io').success).toBe(true);
        expect(TursoUrlSchema.safeParse('libsql://my-db-name.example.com').success).toBe(true);
        expect(TursoUrlSchema.safeParse('https://my-db.turso.io').success).toBe(true);
        expect(TursoUrlSchema.safeParse('libsql://localhost:8080').success).toBe(true);
    });

    it('rejects invalid Turso URLs', () => {
        expect(TursoUrlSchema.safeParse('http://my-db.turso.io').success).toBe(false); // http not allowed
        expect(TursoUrlSchema.safeParse('my-db.turso.io').success).toBe(false); // No protocol
        expect(TursoUrlSchema.safeParse('libsql://').success).toBe(false); // No host
        expect(TursoUrlSchema.safeParse('sqlite://local.db').success).toBe(false); // Wrong protocol
        expect(TursoUrlSchema.safeParse('libsql://-invalid.turso.io').success).toBe(false); // Invalid host start
    });
});

describe('DbConfigSchema', () => {
    it('accepts minimal config', () => {
        const result = DbConfigSchema.safeParse({});
        expect(result.success).toBe(true);
    });

    it('accepts full events config', () => {
        const result = DbConfigSchema.safeParse({
            events: {
                path: '/path/to/events.db',
                syncUrl: 'libsql://my-db.turso.io',
                authToken: 'secret',
                syncMode: 'offline',
                encryptionKey: 'key',
            },
            cache: {
                path: '/path/to/cache.db',
            },
            sync: {
                policy: 'opportunistic',
                staleAfterMs: 60000,
                minIntervalMs: 15000,
                lockTimeoutMs: 3000,
                syncTimeoutMs: 30000,
                maxSyncAttemptsPerMinute: 10,
                conflictStrategy: 'merge',
            },
        });
        expect(result.success).toBe(true);
    });

    it('rejects invalid syncUrl format', () => {
        const result = DbConfigSchema.safeParse({
            events: { syncUrl: 'http://invalid.com' },
        });
        expect(result.success).toBe(false);
    });

    it('rejects invalid syncMode', () => {
        const result = DbConfigSchema.safeParse({
            events: { syncMode: 'invalid' },
        });
        expect(result.success).toBe(false);
    });

    it('rejects invalid conflictStrategy', () => {
        const result = DbConfigSchema.safeParse({
            sync: { conflictStrategy: 'invalid' },
        });
        expect(result.success).toBe(false);
    });
});

describe('SyncPolicySchema', () => {
    it('accepts valid policies', () => {
        expect(SyncPolicySchema.safeParse('manual').success).toBe(true);
        expect(SyncPolicySchema.safeParse('opportunistic').success).toBe(true);
        expect(SyncPolicySchema.safeParse('strict').success).toBe(true);
    });

    it('rejects invalid policies', () => {
        expect(SyncPolicySchema.safeParse('invalid').success).toBe(false);
    });
});
