import express, { type Express } from 'express';
import morgan from 'morgan';
import { createTaskRouter } from './modules/tasks/task.routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { config } from './config';

export function createApp(): Express {
  const app = express();

  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false }));

  if (config.nodeEnv !== 'test') {
    app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
  }

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use('/api/v1/tasks', createTaskRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
