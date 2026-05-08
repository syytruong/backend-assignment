import type { Request, Response } from 'express';
import { TaskService } from './task.service';
import {
  CreateTaskSchema,
  UpdateTaskSchema,
  ListTasksQuerySchema,
  TaskIdParamSchema,
} from './task.schema';

export class TaskController {
  constructor(private readonly service: TaskService = new TaskService()) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const input = CreateTaskSchema.parse(req.body);
    const task = this.service.create(input);
    res.status(201).json({ data: task });
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const query = ListTasksQuerySchema.parse(req.query);
    const result = this.service.list(query);
    res.status(200).json(result);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = TaskIdParamSchema.parse(req.params);
    const task = this.service.getById(id);
    res.status(200).json({ data: task });
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = TaskIdParamSchema.parse(req.params);
    const input = UpdateTaskSchema.parse(req.body);
    const task = this.service.update(id, input);
    res.status(200).json({ data: task });
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    const { id } = TaskIdParamSchema.parse(req.params);
    this.service.delete(id);
    res.status(204).send();
  };
}
