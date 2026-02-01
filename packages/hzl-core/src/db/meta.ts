import type Database from 'libsql';

/**
 * Schema for hzl_global_meta table (stored in events.db, synced)
 * Contains immutable dataset identity.
 */
export function createGlobalMetaSchema(): string {
    return `
    CREATE TABLE IF NOT EXISTS hzl_global_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `;
}

/**
 * Schema for hzl_local_meta table (stored in cache.db, local-only)
 * Contains per-device sync bookkeeping.
 */
export function createLocalMetaSchema(): string {
    return `
    CREATE TABLE IF NOT EXISTS hzl_local_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `;
}

// Global meta keys
const INSTANCE_ID_KEY = 'hzl_instance_id';
const CREATED_AT_KEY = 'created_at_ms';

// Local meta keys
const DEVICE_ID_KEY = 'device_id';
const DIRTY_SINCE_KEY = 'dirty_since_ms';
const LAST_SYNC_AT_KEY = 'last_sync_at_ms';
const LAST_SYNC_ATTEMPT_KEY = 'last_sync_attempt_at_ms';
const LAST_SYNC_ERROR_KEY = 'last_sync_error';
const LAST_SYNC_FRAME_KEY = 'last_sync_frame_no';

export function getInstanceId(db: Database.Database): string | null {
    const row = db.prepare('SELECT value FROM hzl_global_meta WHERE key = ?').get(INSTANCE_ID_KEY) as { value: string } | undefined;
    return row?.value ?? null;
}

export function setInstanceId(db: Database.Database, instanceId: string): void {
    const existing = getInstanceId(db);
    if (existing !== null) {
        throw new Error(`Instance ID already set to ${existing}. Cannot overwrite.`);
    }
    db.prepare('INSERT INTO hzl_global_meta (key, value) VALUES (?, ?)').run(INSTANCE_ID_KEY, instanceId);
    db.prepare('INSERT INTO hzl_global_meta (key, value) VALUES (?, ?)').run(CREATED_AT_KEY, Date.now().toString());
}

export function getDeviceId(db: Database.Database): string | null {
    const row = db.prepare('SELECT value FROM hzl_local_meta WHERE key = ?').get(DEVICE_ID_KEY) as { value: string } | undefined;
    return row?.value ?? null;
}

export function setDeviceId(db: Database.Database, deviceId: string): void {
    db.prepare('INSERT OR REPLACE INTO hzl_local_meta (key, value) VALUES (?, ?)').run(DEVICE_ID_KEY, deviceId);
}

export function getDirtySince(db: Database.Database): number | null {
    const row = db.prepare('SELECT value FROM hzl_local_meta WHERE key = ?').get(DIRTY_SINCE_KEY) as { value: string } | undefined;
    return row ? parseInt(row.value, 10) : null;
}

export function setDirtySince(db: Database.Database, timestamp: number): void {
    db.prepare('INSERT OR REPLACE INTO hzl_local_meta (key, value) VALUES (?, ?)').run(DIRTY_SINCE_KEY, timestamp.toString());
}

export function clearDirtySince(db: Database.Database): void {
    db.prepare('DELETE FROM hzl_local_meta WHERE key = ?').run(DIRTY_SINCE_KEY);
}

export function getLastSyncAt(db: Database.Database): number | null {
    const row = db.prepare('SELECT value FROM hzl_local_meta WHERE key = ?').get(LAST_SYNC_AT_KEY) as { value: string } | undefined;
    return row ? parseInt(row.value, 10) : null;
}

export function setLastSyncAt(db: Database.Database, timestamp: number): void {
    db.prepare('INSERT OR REPLACE INTO hzl_local_meta (key, value) VALUES (?, ?)').run(LAST_SYNC_AT_KEY, timestamp.toString());
}

export function getLastSyncError(db: Database.Database): string | null {
    const row = db.prepare('SELECT value FROM hzl_local_meta WHERE key = ?').get(LAST_SYNC_ERROR_KEY) as { value: string } | undefined;
    return row?.value ?? null;
}

export function setLastSyncError(db: Database.Database, error: string): void {
    db.prepare('INSERT OR REPLACE INTO hzl_local_meta (key, value) VALUES (?, ?)').run(LAST_SYNC_ERROR_KEY, error);
}

export function clearLastSyncError(db: Database.Database): void {
    db.prepare('DELETE FROM hzl_local_meta WHERE key = ?').run(LAST_SYNC_ERROR_KEY);
}

export function getLastSyncFrameNo(db: Database.Database): number | null {
    const row = db.prepare('SELECT value FROM hzl_local_meta WHERE key = ?').get(LAST_SYNC_FRAME_KEY) as { value: string } | undefined;
    return row ? parseInt(row.value, 10) : null;
}

export function setLastSyncFrameNo(db: Database.Database, frameNo: number): void {
    db.prepare('INSERT OR REPLACE INTO hzl_local_meta (key, value) VALUES (?, ?)').run(LAST_SYNC_FRAME_KEY, frameNo.toString());
}

export function getLastSyncAttemptAt(db: Database.Database): number | null {
    const row = db.prepare('SELECT value FROM hzl_local_meta WHERE key = ?').get(LAST_SYNC_ATTEMPT_KEY) as { value: string } | undefined;
    return row ? parseInt(row.value, 10) : null;
}

export function setLastSyncAttemptAt(db: Database.Database, timestamp: number): void {
    db.prepare('INSERT OR REPLACE INTO hzl_local_meta (key, value) VALUES (?, ?)').run(LAST_SYNC_ATTEMPT_KEY, timestamp.toString());
}
