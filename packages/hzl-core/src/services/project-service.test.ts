import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'libsql';
import {
  ProjectService,
  ProjectNotFoundError,
  ProtectedProjectError,
  ProjectAlreadyExistsError,
} from './project-service.js';
import { EventStore } from '../events/store.js';
import { ProjectionEngine } from '../projections/engine.js';
import { ProjectsProjector } from '../projections/projects.js';
import { TasksCurrentProjector } from '../projections/tasks-current.js';
import { SCHEMA_V1 } from '../db/schema.js';

describe('ProjectService', () => {
  let db: Database.Database;
  let eventStore: EventStore;
  let projectionEngine: ProjectionEngine;
  let projectService: ProjectService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(SCHEMA_V1);
    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        name TEXT PRIMARY KEY,
        description TEXT,
        is_protected INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        last_event_id INTEGER NOT NULL
      );
    `);
    eventStore = new EventStore(db);
    projectionEngine = new ProjectionEngine(db);
    projectionEngine.register(new ProjectsProjector());
    projectionEngine.register(new TasksCurrentProjector());
    projectService = new ProjectService(db, eventStore, projectionEngine);
  });

  afterEach(() => {
    db.close();
  });

  describe('createProject', () => {
    it('should create a project', () => {
      const project = projectService.createProject('myproject', {
        description: 'Test',
      });
      expect(project.name).toBe('myproject');
      expect(project.description).toBe('Test');
      expect(project.is_protected).toBe(false);
    });

    it('should create protected project', () => {
      const project = projectService.createProject('inbox', {
        is_protected: true,
      });
      expect(project.is_protected).toBe(true);
    });

    it('should throw ProjectAlreadyExistsError if project already exists', () => {
      projectService.createProject('myproject');
      expect(() => projectService.createProject('myproject')).toThrow(
        ProjectAlreadyExistsError
      );
    });
  });

  describe('getProject', () => {
    it('should get existing project', () => {
      projectService.createProject('myproject');
      const project = projectService.getProject('myproject');
      expect(project?.name).toBe('myproject');
    });

    it('should return null for non-existent project', () => {
      const project = projectService.getProject('nonexistent');
      expect(project).toBeNull();
    });
  });

  describe('projectExists', () => {
    it('should return true for existing project', () => {
      projectService.createProject('myproject');
      expect(projectService.projectExists('myproject')).toBe(true);
    });

    it('should return false for non-existent project', () => {
      expect(projectService.projectExists('nonexistent')).toBe(false);
    });
  });

  describe('listProjects', () => {
    it('should list all projects', () => {
      projectService.createProject('project-a');
      projectService.createProject('project-b');
      const projects = projectService.listProjects();
      expect(projects).toHaveLength(2);
    });
  });

  describe('renameProject', () => {
    it('should rename a project', () => {
      projectService.createProject('oldname');
      projectService.renameProject('oldname', 'newname');
      expect(projectService.projectExists('oldname')).toBe(false);
      expect(projectService.projectExists('newname')).toBe(true);
    });

    it('should throw when renaming non-existent project', () => {
      expect(() => projectService.renameProject('nonexistent', 'newname')).toThrow(
        ProjectNotFoundError
      );
    });

    it('should throw when renaming protected project', () => {
      projectService.createProject('inbox', { is_protected: true });
      expect(() => projectService.renameProject('inbox', 'newname')).toThrow(
        ProtectedProjectError
      );
    });

    it('should throw when target name already exists', () => {
      projectService.createProject('project-a');
      projectService.createProject('project-b');
      expect(() => projectService.renameProject('project-a', 'project-b')).toThrow(
        ProjectAlreadyExistsError
      );
    });
  });

  describe('ensureInboxExists', () => {
    it('should create inbox if not exists', () => {
      projectService.ensureInboxExists();
      const inbox = projectService.getProject('inbox');
      expect(inbox).not.toBeNull();
      expect(inbox?.is_protected).toBe(true);
    });

    it('should be idempotent - not fail if inbox already exists', () => {
      projectService.ensureInboxExists();
      projectService.ensureInboxExists();
      const projects = projectService.listProjects();
      expect(projects.filter((p) => p.name === 'inbox')).toHaveLength(1);
    });
  });

  describe('getTaskCount', () => {
    it('should return task count excluding archived by default', () => {
      projectService.createProject('myproject');
      db.prepare(`INSERT INTO tasks_current (task_id, title, project, status, created_at, updated_at, last_event_id)
        VALUES ('t1', 'Test1', 'myproject', 'ready', datetime('now'), datetime('now'), 1)`).run();
      db.prepare(`INSERT INTO tasks_current (task_id, title, project, status, created_at, updated_at, last_event_id)
        VALUES ('t2', 'Test2', 'myproject', 'archived', datetime('now'), datetime('now'), 2)`).run();

      expect(projectService.getTaskCount('myproject', false)).toBe(1);
    });

    it('should include archived when requested', () => {
      projectService.createProject('myproject');
      db.prepare(`INSERT INTO tasks_current (task_id, title, project, status, created_at, updated_at, last_event_id)
        VALUES ('t1', 'Test1', 'myproject', 'ready', datetime('now'), datetime('now'), 1)`).run();
      db.prepare(`INSERT INTO tasks_current (task_id, title, project, status, created_at, updated_at, last_event_id)
        VALUES ('t2', 'Test2', 'myproject', 'archived', datetime('now'), datetime('now'), 2)`).run();

      expect(projectService.getTaskCount('myproject', true)).toBe(2);
    });
  });
});
