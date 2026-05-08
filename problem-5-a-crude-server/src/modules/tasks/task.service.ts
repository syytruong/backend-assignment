import { randomUUID } from 'node:crypto';
import { TaskRepository } from './task.repository';
import { AppError } from '../../utils/AppError';
import type {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  ListTasksQuery,
} from './task.schema';

export class TaskService {
  constructor(private readonly repo: TaskRepository = new TaskRepository()) {}

  create(input: CreateTaskInput): Task {
    const now = new Date().toISOString();
    return this.repo.insert({
      id: randomUUID(),
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? 'todo',
      priority: input.priority ?? 'medium',
      dueDate: input.dueDate ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  getById(id: string): Task {
    const task = this.repo.findById(id);
    if (!task) throw AppError.notFound('Task', id);
    return task;
  }

  list(query: ListTasksQuery): {
    items: Task[];
    pagination: { total: number; limit: number; offset: number };
  } {
    const { items, total } = this.repo.list(query);
    return {
      items,
      pagination: { total, limit: query.limit, offset: query.offset },
    };
  }

  update(id: string, input: UpdateTaskInput): Task {
    const existing = this.repo.findById(id);
    if (!existing) throw AppError.notFound('Task', id);

    const fields: Record<string, unknown> = {};
    if (input.title !== undefined) fields.title = input.title;
    if (input.description !== undefined) fields.description = input.description;
    if (input.status !== undefined) fields.status = input.status;
    if (input.priority !== undefined) fields.priority = input.priority;
    if (input.dueDate !== undefined) fields.due_date = input.dueDate;
    fields.updated_at = new Date().toISOString();

    const updated = this.repo.update(id, fields);
    if (!updated) {
      // The row vanished between the existence check and the UPDATE — race condition.
      // Treat as not found rather than 500.
      throw AppError.notFound('Task', id);
    }
    return updated;
  }

  delete(id: string): void {
    const deleted = this.repo.delete(id);
    if (!deleted) throw AppError.notFound('Task', id);
  }
}
