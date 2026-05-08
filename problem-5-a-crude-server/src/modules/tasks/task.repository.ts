import type { Database } from 'better-sqlite3';
import { getDb } from '../../db/connection';
import type { Task, ListTasksQuery, TaskStatus, TaskPriority } from './task.schema';

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateTaskRow {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export class TaskRepository {
  private db: Database;

  constructor(db: Database = getDb()) {
    this.db = db;
  }

  insert(input: CreateTaskRow): Task {
    const stmt = this.db.prepare(`
      INSERT INTO tasks (id, title, description, status, priority, due_date, created_at, updated_at)
      VALUES (@id, @title, @description, @status, @priority, @dueDate, @createdAt, @updatedAt)
    `);
    stmt.run(input);
  
    const found = this.findById(input.id);
    if (!found) throw new Error('Insert succeeded but row not found — should be impossible');
    return found;
  }

  findById(id: string): Task | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
    return row ? rowToTask(row) : null;
  }

  list(query: ListTasksQuery): { items: Task[]; total: number } {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (query.status) {
      conditions.push('status = @status');
      params.status = query.status;
    }
    if (query.priority) {
      conditions.push('priority = @priority');
      params.priority = query.priority;
    }
    if (query.q) {
      conditions.push('(LOWER(title) LIKE @q OR LOWER(IFNULL(description, "")) LIKE @q)');
      params.q = `%${query.q.toLowerCase()}%`;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sortColumn: Record<ListTasksQuery['sort'], string> = {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      priority: "CASE priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END",
    };
    const orderSql = query.order === 'asc' ? 'ASC' : 'DESC';

    const totalStmt = this.db.prepare(`SELECT COUNT(*) AS count FROM tasks ${where}`);
    const totalRow = (
      conditions.length ? totalStmt.get(params) : totalStmt.get()
    ) as { count: number } | undefined;
    const total = totalRow?.count ?? 0;

    const listStmt = this.db.prepare(
      `SELECT * FROM tasks ${where}
       ORDER BY ${sortColumn[query.sort]} ${orderSql}
       LIMIT @limit OFFSET @offset`,
    );
    const rows = listStmt.all({
      ...params,
      limit: query.limit,
      offset: query.offset,
    }) as TaskRow[];

    return { items: rows.map(rowToTask), total };
  }

  update(id: string, fields: Record<string, unknown>): Task | null {
    const keys = Object.keys(fields);
    if (keys.length === 0) return this.findById(id);

    const setClause = keys.map((k) => `${k} = @${k}`).join(', ');
    const stmt = this.db.prepare(`UPDATE tasks SET ${setClause} WHERE id = @id`);
    const result = stmt.run({ ...fields, id });

    if (result.changes === 0) return null;
    return this.findById(id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
