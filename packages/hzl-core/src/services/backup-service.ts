import Database from 'libsql';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { ProjectionEngine } from '../projections/engine.js';
import { TasksCurrentProjector } from '../projections/tasks-current.js';
import { DependenciesProjector } from '../projections/dependencies.js';
import { TagsProjector } from '../projections/tags.js';
import { SearchProjector } from '../projections/search.js';
import { CommentsCheckpointsProjector } from '../projections/comments-checkpoints.js';
import { rebuildAllProjections } from '../projections/rebuild.js';

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: number;
}

type ExportEventRow = {
  event_id: string;
  task_id: string;
  type: string;
  data: string;
  author: string | null;
  agent_id: string | null;
  session_id: string | null;
  correlation_id: string | null;
  causation_id: string | null;
  timestamp: string;
};

export class BackupService {
  constructor(private db: Database.Database) { }

  async backup(destPath: string): Promise<void> {
    const dir = path.dirname(destPath);
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(destPath)) {
      fs.unlinkSync(destPath);
    }
    this.db.exec(`VACUUM INTO '${destPath}'`);
  }

  async restore(srcPath: string, destPath: string): Promise<void> {
    if (!fs.existsSync(srcPath)) {
      throw new Error(`Backup file not found: ${srcPath}`);
    }

    try {
      const testDb = new Database(srcPath, { readonly: true });
      testDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").get();
      testDb.close();
    } catch {
      throw new Error(`Invalid backup file: ${srcPath}`);
    }

    const dir = path.dirname(destPath);
    await fs.promises.mkdir(dir, { recursive: true });

    // Remove existing WAL and SHM files to prevent corruption after restore
    if (fs.existsSync(`${destPath}-wal`)) fs.unlinkSync(`${destPath}-wal`);
    if (fs.existsSync(`${destPath}-shm`)) fs.unlinkSync(`${destPath}-shm`);

    await fs.promises.copyFile(srcPath, destPath);
  }

  async exportEvents(destPath: string): Promise<void> {
    const dir = path.dirname(destPath);
    fs.mkdirSync(dir, { recursive: true });

    const stream = fs.createWriteStream(destPath, { encoding: 'utf-8' });

    const rows = this.db
      .prepare(
        `
        SELECT event_id, task_id, type, data, author, agent_id, session_id,
               correlation_id, causation_id, timestamp
        FROM events
        ORDER BY id ASC
      `
      )
      .all() as ExportEventRow[];

    for (const row of rows) {
      const payload = {
        event_id: row.event_id,
        task_id: row.task_id,
        type: row.type,
        data: JSON.parse(row.data) as Record<string, unknown>,
        author: row.author ?? undefined,
        agent_id: row.agent_id ?? undefined,
        session_id: row.session_id ?? undefined,
        correlation_id: row.correlation_id ?? undefined,
        causation_id: row.causation_id ?? undefined,
        timestamp: row.timestamp,
      };
      stream.write(`${JSON.stringify(payload)}\n`);
    }

    await new Promise<void>((resolve, reject) => {
      stream.end(() => resolve());
      stream.on('error', reject);
    });
  }

  async importEvents(srcPath: string): Promise<ImportResult> {
    if (!fs.existsSync(srcPath)) {
      throw new Error(`Export file not found: ${srcPath}`);
    }

    const insertStmt = this.db.prepare(
      `
      INSERT OR IGNORE INTO events
        (event_id, task_id, type, data, author, agent_id, session_id, correlation_id, causation_id, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    );

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    const fileStream = fs.createReadStream(srcPath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const event = JSON.parse(line) as {
          event_id: string;
          task_id: string;
          type: string;
          data?: Record<string, unknown>;
          author?: string;
          agent_id?: string;
          session_id?: string;
          correlation_id?: string;
          causation_id?: string;
          timestamp: string;
        };
        const result = insertStmt.run(
          event.event_id,
          event.task_id,
          event.type,
          JSON.stringify(event.data ?? {}),
          event.author ?? null,
          event.agent_id ?? null,
          event.session_id ?? null,
          event.correlation_id ?? null,
          event.causation_id ?? null,
          event.timestamp
        );
        if (result.changes === 0) {
          skipped += 1;
        } else {
          imported += 1;
        }
      } catch {
        errors += 1;
      }
    }

    this.rebuildProjections();

    return { imported, skipped, errors };
  }

  private rebuildProjections(): void {
    const engine = new ProjectionEngine(this.db);
    engine.register(new TasksCurrentProjector());
    engine.register(new DependenciesProjector());
    engine.register(new TagsProjector());
    engine.register(new SearchProjector());
    engine.register(new CommentsCheckpointsProjector());
    rebuildAllProjections(this.db, engine);
  }
}
