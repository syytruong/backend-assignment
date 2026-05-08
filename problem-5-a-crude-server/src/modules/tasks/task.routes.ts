import { Router } from 'express';
import { TaskController } from './task.controller';
import { asyncHandler } from '../../utils/asyncHandler';

export function createTaskRouter(controller: TaskController = new TaskController()): Router {
  const router = Router();

  router.post('/', asyncHandler(controller.create));
  router.get('/', asyncHandler(controller.list));
  router.get('/:id', asyncHandler(controller.getById));
  router.patch('/:id', asyncHandler(controller.update));
  router.delete('/:id', asyncHandler(controller.delete));

  return router;
}
