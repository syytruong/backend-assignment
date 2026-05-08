import { z } from 'zod';

export const TaskStatus = ['todo', 'in_progress', 'done'] as const;
export const TaskPriority = ['low', 'medium', 'high'] as const;

export type TaskStatus = (typeof TaskStatus)[number];
export type TaskPriority = (typeof TaskPriority)[number];

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export const CreateTaskSchema = z.object({
  title: z.string().trim().min(1, 'title is required').max(200),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(TaskStatus).optional(),
  priority: z.enum(TaskPriority).optional(),
  dueDate: z.string().datetime({ offset: true }).optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export const UpdateTaskSchema = CreateTaskSchema.partial().refine(
  (obj) => Object.keys(obj).length > 0,
  { message: 'At least one field must be provided' },
);
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;

export const ListTasksQuerySchema = z.object({
  status: z.enum(TaskStatus).optional(),
  priority: z.enum(TaskPriority).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(['createdAt', 'updatedAt', 'priority']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type ListTasksQuery = z.infer<typeof ListTasksQuerySchema>;

export const TaskIdParamSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});
