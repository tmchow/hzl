import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'libsql';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createGlobalMetaSchema, createLocalMetaSchema, getInstanceId, setInstanceId, getDeviceId, setDeviceId } from '../meta.js';

describe('meta tables', () => {
    let db: Database.Database;
    const testDbPath = path.join(os.tmpdir(), `meta-test-${Date.now()}.db`);

    beforeEach(() => {
        db = new Database(testDbPath);
    });

    afterEach(() => {
        db.close();
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
    });

    describe('hzl_global_meta', () => {
        beforeEach(() => {
            db.exec(createGlobalMetaSchema());
        });

        it('stores and retrieves instance ID', () => {
            const instanceId = '01HQ3K5BXYZ123456789ABCDEF';
            setInstanceId(db, instanceId);
            expect(getInstanceId(db)).toBe(instanceId);
        });

        it('returns null when instance ID not set', () => {
            expect(getInstanceId(db)).toBeNull();
        });

        it('prevents overwriting instance ID', () => {
            setInstanceId(db, 'first-id');
            expect(() => setInstanceId(db, 'second-id')).toThrow();
        });
    });

    describe('hzl_local_meta', () => {
        beforeEach(() => {
            db.exec(createLocalMetaSchema());
        });

        it('stores and retrieves device ID', () => {
            const deviceId = '01HQ3K5DEVICE123456789ABC';
            setDeviceId(db, deviceId);
            expect(getDeviceId(db)).toBe(deviceId);
        });

        it('returns null when device ID not set', () => {
            expect(getDeviceId(db)).toBeNull();
        });
    });
});
