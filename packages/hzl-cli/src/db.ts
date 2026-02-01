// packages/hzl-cli/src/db.ts
import Database from 'libsql';
import { runMigrations } from 'hzl-core/db/migrations.js';
import { EventStore } from 'hzl-core/events/store.js';
import { ProjectionEngine } from 'hzl-core/projections/engine.js';
import { TasksCurrentProjector } from 'hzl-core/projections/tasks-current.js';
import { DependenciesProjector } from 'hzl-core/projections/dependencies.js';
import { TagsProjector } from 'hzl-core/projections/tags.js';
import { CommentsCheckpointsProjector } from 'hzl-core/projections/comments-checkpoints.js';
import { SearchProjector } from 'hzl-core/projections/search.js';
import { ProjectsProjector } from 'hzl-core/projections/projects.js';
import { TaskService } from 'hzl-core/services/task-service.js';
import { ProjectService } from 'hzl-core/services/project-service.js';
import { SearchService } from 'hzl-core/services/search-service.js';
import { ValidationService } from 'hzl-core/services/validation-service.js';
import { ensureDbDirectory } from './config.js';

export interface Services {
  db: Database.Database;
  eventStore: EventStore;
  projectionEngine: ProjectionEngine;
  taskService: TaskService;
  projectService: ProjectService;
  searchService: SearchService;
  validationService: ValidationService;
}

export function initializeDb(dbPath: string): Services {
  ensureDbDirectory(dbPath);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  runMigrations(db);

  const eventStore = new EventStore(db);
  const projectionEngine = new ProjectionEngine(db);
  projectionEngine.register(new TasksCurrentProjector());
  projectionEngine.register(new DependenciesProjector());
  projectionEngine.register(new TagsProjector());
  projectionEngine.register(new CommentsCheckpointsProjector());
  projectionEngine.register(new SearchProjector());
  projectionEngine.register(new ProjectsProjector());

  const projectService = new ProjectService(db, eventStore, projectionEngine);
  const taskService = new TaskService(db, eventStore, projectionEngine, projectService);
  const searchService = new SearchService(db);
  const validationService = new ValidationService(db);

  projectService.ensureInboxExists();

  return {
    db,
    eventStore,
    projectionEngine,
    taskService,
    projectService,
    searchService,
    validationService,
  };
}

export function closeDb(services: Services): void {
  services.db.close();
}
