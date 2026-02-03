// packages/hzl-cli/src/db.ts
import type Database from 'libsql';
import { createDatastore, type Datastore } from 'hzl-core/db/datastore.js';
import { CACHE_SCHEMA_V1 } from 'hzl-core/db/schema.js';
import { EventStore } from 'hzl-core/events/store.js';
import { ProjectionEngine } from 'hzl-core/projections/engine.js';
import { rebuildAllProjections } from 'hzl-core/projections/rebuild.js';
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

// Schema version: bump when projection table schemas change
const CURRENT_SCHEMA_VERSION = 2;

/**
 * Check schema version and rebuild projections if needed.
 * Returns true if migration was performed.
 */
function checkAndMigrateSchema(
  cacheDb: Database.Database,
  eventsDb: Database.Database,
  projectionEngine: ProjectionEngine
): boolean {
  // Get current version from hzl_local_meta
  const row = cacheDb.prepare(
    "SELECT value FROM hzl_local_meta WHERE key = 'schema_version'"
  ).get() as { value: string } | undefined;
  const currentVersion = row ? parseInt(row.value, 10) : 1;

  if (currentVersion >= CURRENT_SCHEMA_VERSION) {
    return false;
  }

  // Count events for progress indicator
  const eventCount = (eventsDb.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number }).count;
  console.error(`Upgrading database schema (v${currentVersion} → v${CURRENT_SCHEMA_VERSION})...`);
  console.error(`  Replaying ${eventCount.toLocaleString()} events...`);

  // Wrap entire rebuild in transaction for atomicity
  cacheDb.exec('BEGIN IMMEDIATE');
  try {
    // Drop all projection tables (preserves hzl_local_meta, projection_cursor, projection_state)
    cacheDb.exec('DROP TABLE IF EXISTS tasks_current');
    cacheDb.exec('DROP TABLE IF EXISTS task_dependencies');
    cacheDb.exec('DROP TABLE IF EXISTS task_tags');
    cacheDb.exec('DROP TABLE IF EXISTS task_comments');
    cacheDb.exec('DROP TABLE IF EXISTS task_checkpoints');
    cacheDb.exec('DROP TABLE IF EXISTS task_search');
    cacheDb.exec('DROP TABLE IF EXISTS projects');

    // Also drop indexes that reference these tables
    cacheDb.exec('DROP INDEX IF EXISTS idx_tasks_current_project_status');
    cacheDb.exec('DROP INDEX IF EXISTS idx_tasks_current_status');
    cacheDb.exec('DROP INDEX IF EXISTS idx_tasks_current_priority');
    cacheDb.exec('DROP INDEX IF EXISTS idx_tasks_current_claim_next');
    cacheDb.exec('DROP INDEX IF EXISTS idx_tasks_current_stuck');
    cacheDb.exec('DROP INDEX IF EXISTS idx_tasks_current_parent');
    cacheDb.exec('DROP INDEX IF EXISTS idx_deps_depends_on');
    cacheDb.exec('DROP INDEX IF EXISTS idx_task_tags_tag');
    cacheDb.exec('DROP INDEX IF EXISTS idx_task_comments_task');
    cacheDb.exec('DROP INDEX IF EXISTS idx_task_checkpoints_task');
    cacheDb.exec('DROP INDEX IF EXISTS idx_projects_protected');

    // Recreate with new schema
    cacheDb.exec(CACHE_SCHEMA_V1);

    // Replay all events
    rebuildAllProjections(cacheDb, projectionEngine);

    // Update schema version
    cacheDb.prepare(
      "INSERT OR REPLACE INTO hzl_local_meta (key, value) VALUES ('schema_version', ?)"
    ).run(CURRENT_SCHEMA_VERSION.toString());

    cacheDb.exec('COMMIT');
    console.error('Schema upgrade complete.');
    return true;
  } catch (e) {
    cacheDb.exec('ROLLBACK');
    throw e;
  }
}

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

  // Check and perform schema migration if needed
  checkAndMigrateSchema(cacheDb, eventsDb, projectionEngine);

  const projectService = new ProjectService(cacheDb, eventStore, projectionEngine);
  const taskService = new TaskService(cacheDb, eventStore, projectionEngine, projectService, eventsDb);
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
