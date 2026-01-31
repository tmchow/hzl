import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations, getCurrentVersion } from './migrations.js';
import { SCHEMA_V1 } from './schema.js';

describe('migrations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('creates schema_migrations table', () => {
    runMigrations(db);
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
    ).get();
    expect(table).toBeDefined();
  });

  it('creates events table with correct columns', () => {
    runMigrations(db);
    const columns = db.prepare("PRAGMA table_info(events)").all();
    const columnNames = columns.map((c: any) => c.name);
    expect(columnNames).toContain('event_id');
    expect(columnNames).toContain('task_id');
    expect(columnNames).toContain('type');
    expect(columnNames).toContain('data');
    expect(columnNames).toContain('timestamp');
  });

  it('creates tasks_current projection table with lease fields', () => {
    runMigrations(db);
    const columns = db.prepare("PRAGMA table_info(tasks_current)").all();
    const columnNames = columns.map((c: any) => c.name);
    expect(columnNames).toContain('task_id');
    expect(columnNames).toContain('title');
    expect(columnNames).toContain('status');
    expect(columnNames).toContain('project');
    expect(columnNames).toContain('claimed_at');
    expect(columnNames).toContain('lease_until');
  });

  it('creates task_dependencies table', () => {
    runMigrations(db);
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='task_dependencies'"
    ).get();
    expect(table).toBeDefined();
  });

  it('creates projection_state table', () => {
    runMigrations(db);
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='projection_state'"
    ).get();
    expect(table).toBeDefined();
  });

  it('creates task_tags table for fast tag filtering', () => {
    runMigrations(db);
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='task_tags'"
    ).get();
    expect(table).toBeDefined();
  });

  it('creates task_comments table', () => {
    runMigrations(db);
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='task_comments'"
    ).get();
    expect(table).toBeDefined();
  });

  it('creates task_checkpoints table', () => {
    runMigrations(db);
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='task_checkpoints'"
    ).get();
    expect(table).toBeDefined();
  });

  it('creates task_search FTS5 table', () => {
    runMigrations(db);
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='task_search'"
    ).get();
    expect(table).toBeDefined();
  });

  it('is idempotent', () => {
    runMigrations(db);
    runMigrations(db);
    const version = getCurrentVersion(db);
    expect(version).toBe(1);
  });
});

describe('projects table migration', () => {
  it('should create projects table', () => {
    const db = new Database(':memory:');
    db.exec(SCHEMA_V1);
    db.exec('DROP TABLE projects');
    db.exec('DROP INDEX IF EXISTS idx_projects_protected');

    db.prepare(`INSERT INTO tasks_current (task_id, title, project, status, created_at, updated_at, last_event_id)
      VALUES ('t1', 'Task 1', 'projectA', 'ready', datetime('now'), datetime('now'), 1)`).run();
    db.prepare(`INSERT INTO tasks_current (task_id, title, project, status, created_at, updated_at, last_event_id)
      VALUES ('t2', 'Task 2', 'projectB', 'ready', datetime('now'), datetime('now'), 2)`).run();

    runMigrations(db);

    const projects = db.prepare('SELECT name FROM projects ORDER BY name').all() as {
      name: string;
    }[];
    expect(projects.map((p) => p.name)).toContain('inbox');
    expect(projects.map((p) => p.name)).toContain('projectA');
    expect(projects.map((p) => p.name)).toContain('projectB');

    const inbox = db
      .prepare('SELECT is_protected FROM projects WHERE name = ?')
      .get('inbox') as any;
    expect(inbox.is_protected).toBe(1);

    db.close();
  });

  it('should emit synthetic ProjectCreated events for existing projects', () => {
    const db = new Database(':memory:');
    db.exec(SCHEMA_V1);
    db.exec('DROP TABLE projects');
    db.exec('DROP INDEX IF EXISTS idx_projects_protected');

    db.prepare(`INSERT INTO tasks_current (task_id, title, project, status, created_at, updated_at, last_event_id)
      VALUES ('t1', 'Task 1', 'myproject', 'ready', datetime('now'), datetime('now'), 1)`).run();

    runMigrations(db);

    const events = db
      .prepare(`SELECT * FROM events WHERE type = 'project_created'`)
      .all() as any[];
    expect(events.length).toBeGreaterThanOrEqual(2);

    const projectNames = events.map((e) => JSON.parse(e.data).name);
    expect(projectNames).toContain('inbox');
    expect(projectNames).toContain('myproject');

    db.close();
  });
});
