import { getDb } from './connection';

export function runMigrations(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      description TEXT,
      status      TEXT NOT NULL CHECK (status IN ('todo', 'in_progress', 'done')) DEFAULT 'todo',
      priority    TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high'))     DEFAULT 'medium',
      due_date    TEXT,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status     ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority   ON tasks(priority);
    CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
  `);
}

if (require.main === module) {
  runMigrations();
  console.log('Migrations applied.');
  process.exit(0);
}
