// packages/hzl-cli/src/db.ts
import type Database from 'libsql';
import { createDatastore, type Datastore } from 'hzl-core/db/datastore.js';
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

export interface Services {
  db: Database.Database;
  cacheDb: Database.Database;
  datastore: Datastore;
  eventStore: EventStore;
  projectionEngine: ProjectionEngine;
  taskService: TaskService;
  projectService: ProjectService;
  searchService: SearchService;
  validationService: ValidationService;
}

export interface InitializeDbOptions {
  eventsDbPath: string;
  cacheDbPath: string;
  syncUrl?: string;
  authToken?: string;
}

export function initializeDb(options: InitializeDbOptions): Services {
  const { eventsDbPath, cacheDbPath, syncUrl, authToken } = options;

  const datastore = createDatastore({
    events: {
      path: eventsDbPath,
      syncUrl,
      authToken,
      syncMode: 'offline',
      readYourWrites: true,
    },
    cache: { path: cacheDbPath },
  });

  const { eventsDb, cacheDb } = datastore;

  const eventStore = new EventStore(eventsDb);
  // Pass both databases to ProjectionEngine: cache for projections, events for reading events
  const projectionEngine = new ProjectionEngine(cacheDb, eventsDb);
  projectionEngine.register(new TasksCurrentProjector());
  projectionEngine.register(new DependenciesProjector());
  projectionEngine.register(new TagsProjector());
  projectionEngine.register(new CommentsCheckpointsProjector());
  projectionEngine.register(new SearchProjector());
  projectionEngine.register(new ProjectsProjector());

  const projectService = new ProjectService(cacheDb, eventStore, projectionEngine);
  const taskService = new TaskService(cacheDb, eventStore, projectionEngine, projectService);
  const searchService = new SearchService(cacheDb);
  const validationService = new ValidationService(cacheDb);

  projectService.ensureInboxExists();

  return {
    db: eventsDb,
    cacheDb,
    datastore,
    eventStore,
    projectionEngine,
    taskService,
    projectService,
    searchService,
    validationService,
  };
}

export function closeDb(services: Services): void {
  services.datastore.close();
}

/**
 * Helper for tests: derive cache path from events path.
 */
function deriveCachePath(eventsPath: string): string {
  if (eventsPath.endsWith('/events.db') || eventsPath.endsWith('\\events.db')) {
    return eventsPath.replace(/events\.db$/, 'cache.db');
  }
  if (eventsPath.endsWith('.db')) {
    return eventsPath.replace(/\.db$/, '-cache.db');
  }
  return `${eventsPath}-cache.db`;
}

/**
 * Test helper: initialize database from a single path (derives cache path automatically).
 * This is for backward compatibility with existing tests.
 */
export function initializeDbFromPath(dbPath: string): Services {
  return initializeDb({
    eventsDbPath: dbPath,
    cacheDbPath: deriveCachePath(dbPath),
  });
}
