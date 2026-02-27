import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createDatastore, Datastore } from '../datastore.js';
import type { DbConfig } from '../types.js';

describe('createDatastore', () => {
    const testDir = path.join(os.tmpdir(), `datastore-test-${Date.now()}`);
    let datastore: Datastore | null = null;

    afterEach(() => {
        datastore?.close();
        datastore = null;
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('creates events.db and cache.db with default paths', () => {
        const config: DbConfig = {
            events: { path: path.join(testDir, 'events.db'), syncMode: 'offline', readYourWrites: true },
            cache: { path: path.join(testDir, 'cache.db') },
        };

        datastore = createDatastore(config);

        expect(fs.existsSync(path.join(testDir, 'events.db'))).toBe(true);
        expect(fs.existsSync(path.join(testDir, 'cache.db'))).toBe(true);
    });

    it('initializes events.db schema', () => {
        const config: DbConfig = {
            events: { path: path.join(testDir, 'events.db'), syncMode: 'offline', readYourWrites: true },
            cache: { path: path.join(testDir, 'cache.db') },
        };

        datastore = createDatastore(config);

        // Check events table exists
        const tables = datastore.eventsDb.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='events'"
        ).all() as { name: string }[];
        expect(tables.length).toBe(1);
    });

    it('initializes cache.db schema', () => {
        const config: DbConfig = {
            events: { path: path.join(testDir, 'events.db'), syncMode: 'offline', readYourWrites: true },
            cache: { path: path.join(testDir, 'cache.db') },
        };

        datastore = createDatastore(config);

        // Check tasks_current table exists
        const tables = datastore.cacheDb.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='tasks_current'"
        ).all() as { name: string }[];
        expect(tables.length).toBe(1);
    });

    it('initializes hook/workflow foundation tables and indexes in cache.db', () => {
        const config: DbConfig = {
            events: { path: path.join(testDir, 'events.db'), syncMode: 'offline', readYourWrites: true },
            cache: { path: path.join(testDir, 'cache.db') },
        };

        datastore = createDatastore(config);

        const tables = datastore.cacheDb.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('hook_outbox', 'workflow_ops')"
        ).all() as { name: string }[];

        expect(tables.map(t => t.name).sort()).toEqual(['hook_outbox', 'workflow_ops']);

        const indexes = datastore.cacheDb.prepare(
            "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_hook_outbox_drain', 'idx_workflow_ops_workflow_input')"
        ).all() as { name: string }[];

        expect(indexes.map(i => i.name).sort()).toEqual([
            'idx_hook_outbox_drain',
            'idx_workflow_ops_workflow_input',
        ]);
    });

    it.skip('reports sync mode when syncUrl configured', () => {
        const config: DbConfig = {
            events: {
                path: path.join(testDir, 'events.db'),
                syncUrl: 'libsql://test.turso.io',
                authToken: 'test-token',
                syncMode: 'offline',
                readYourWrites: true,
            },
            cache: { path: path.join(testDir, 'cache.db') },
        };

        datastore = createDatastore(config);

        expect(datastore.mode).toBe('offline-sync');
        expect(datastore.syncUrl).toBe('libsql://test.turso.io');
    });

    it('reports local-only mode when no syncUrl', () => {
        const config: DbConfig = {
            events: { path: path.join(testDir, 'events.db'), syncMode: 'offline', readYourWrites: true },
            cache: { path: path.join(testDir, 'cache.db') },
        };

        datastore = createDatastore(config);

        expect(datastore.mode).toBe('local-only');
        expect(datastore.syncUrl).toBeUndefined();
    });
});
