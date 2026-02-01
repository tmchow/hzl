// packages/hzl-core/src/projections/comments-checkpoints.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'libsql';
import { CommentsCheckpointsProjector } from './comments-checkpoints.js';
import { createTestDb } from '../db/test-utils.js';
import { EventStore } from '../events/store.js';
import { EventType } from '../events/types.js';

describe('CommentsCheckpointsProjector', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let projector: CommentsCheckpointsProjector;

  beforeEach(() => {
    db = createTestDb();
    // Schema applied by createTestDb
    eventStore = new EventStore(db);
    projector = new CommentsCheckpointsProjector();
  });

  afterEach(() => {
    db.close();
  });

  describe('comment_added', () => {
    it('inserts comment row', () => {
      const event = eventStore.append({
        task_id: 'TASK1',
        type: EventType.CommentAdded,
        data: { text: 'This is a comment' },
        author: 'user-1',
        agent_id: 'AGENT001',
      });

      projector.apply(event, db);

      const comment = db.prepare(
        'SELECT * FROM task_comments WHERE task_id = ?'
      ).get('TASK1') as any;
      expect(comment.text).toBe('This is a comment');
      expect(comment.author).toBe('user-1');
      expect(comment.agent_id).toBe('AGENT001');
    });
  });

  describe('checkpoint_recorded', () => {
    it('inserts checkpoint row', () => {
      const event = eventStore.append({
        task_id: 'TASK1',
        type: EventType.CheckpointRecorded,
        data: { name: 'step1', data: { progress: 50 } },
      });

      projector.apply(event, db);

      const checkpoint = db.prepare(
        'SELECT * FROM task_checkpoints WHERE task_id = ?'
      ).get('TASK1') as any;
      expect(checkpoint.name).toBe('step1');
      expect(JSON.parse(checkpoint.data)).toEqual({ progress: 50 });
    });
  });

  describe('reset', () => {
    it('clears all comments and checkpoints', () => {
      const commentEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.CommentAdded,
        data: { text: 'Comment' },
      });
      projector.apply(commentEvent, db);

      const checkpointEvent = eventStore.append({
        task_id: 'TASK1',
        type: EventType.CheckpointRecorded,
        data: { name: 'cp1' },
      });
      projector.apply(checkpointEvent, db);

      projector.reset!(db);

      const commentCount = db.prepare('SELECT COUNT(*) as cnt FROM task_comments').get() as any;
      const checkpointCount = db.prepare('SELECT COUNT(*) as cnt FROM task_checkpoints').get() as any;
      expect(commentCount.cnt).toBe(0);
      expect(checkpointCount.cnt).toBe(0);
    });
  });
});
