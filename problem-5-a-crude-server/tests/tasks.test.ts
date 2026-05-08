import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { runMigrations } from '../src/db/migrate';
import { getDb, closeDb } from '../src/db/connection';

let app: Express;

beforeAll(() => {
  runMigrations();
  app = createApp();
});

beforeEach(() => {
  getDb().exec('DELETE FROM tasks');
});

afterAll(() => {
  closeDb();
});

describe('Tasks API', () => {
  describe('POST /api/v1/tasks', () => {
    it('creates a task with defaults', async () => {
      const res = await request(app)
        .post('/api/v1/tasks')
        .send({ title: 'Write spec' })
        .expect(201);

      expect(res.body.data).toMatchObject({
        title: 'Write spec',
        status: 'todo',
        priority: 'medium',
        description: null,
      });
      expect(res.body.data.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('rejects empty title', async () => {
      const res = await request(app)
        .post('/api/v1/tasks')
        .send({ title: '' })
        .expect(422);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects unknown enum values', async () => {
      await request(app)
        .post('/api/v1/tasks')
        .send({ title: 'x', status: 'banana' })
        .expect(422);
    });
  });

  describe('GET /api/v1/tasks', () => {
    beforeEach(async () => {
      await request(app).post('/api/v1/tasks').send({ title: 'A', priority: 'high' });
      await request(app).post('/api/v1/tasks').send({ title: 'B', priority: 'low', status: 'done' });
      await request(app).post('/api/v1/tasks').send({ title: 'C urgent thing', priority: 'medium' });
    });

    it('lists all tasks with pagination metadata', async () => {
      const res = await request(app).get('/api/v1/tasks').expect(200);
      expect(res.body.items).toHaveLength(3);
      expect(res.body.pagination).toEqual({ total: 3, limit: 20, offset: 0 });
    });

    it('filters by status', async () => {
      const res = await request(app).get('/api/v1/tasks?status=done').expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].title).toBe('B');
    });

    it('filters by priority', async () => {
      const res = await request(app).get('/api/v1/tasks?priority=high').expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].title).toBe('A');
    });

    it('searches by q (title substring)', async () => {
      const res = await request(app).get('/api/v1/tasks?q=urgent').expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].title).toBe('C urgent thing');
    });

    it('sorts by priority desc', async () => {
      const res = await request(app)
        .get('/api/v1/tasks?sort=priority&order=desc')
        .expect(200);
      expect(res.body.items.map((t: { priority: string }) => t.priority))
        .toEqual(['high', 'medium', 'low']);
    });

    it('rejects invalid limit', async () => {
      await request(app).get('/api/v1/tasks?limit=9999').expect(422);
    });
  });

  describe('GET /api/v1/tasks/:id', () => {
    it('returns the task', async () => {
      const created = await request(app).post('/api/v1/tasks').send({ title: 'X' });
      const res = await request(app)
        .get(`/api/v1/tasks/${created.body.data.id}`)
        .expect(200);
      expect(res.body.data.title).toBe('X');
    });

    it('returns 404 for missing id', async () => {
      const res = await request(app)
        .get('/api/v1/tasks/00000000-0000-0000-0000-000000000000')
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 422 for malformed id', async () => {
      await request(app).get('/api/v1/tasks/not-a-uuid').expect(422);
    });
  });

  describe('PATCH /api/v1/tasks/:id', () => {
    it('updates only provided fields', async () => {
      const created = await request(app)
        .post('/api/v1/tasks')
        .send({ title: 'Old', description: 'keep me' });

      const res = await request(app)
        .patch(`/api/v1/tasks/${created.body.data.id}`)
        .send({ title: 'New' })
        .expect(200);

      expect(res.body.data.title).toBe('New');
      expect(res.body.data.description).toBe('keep me'); // not clobbered
    });

    it('rejects empty body', async () => {
      const created = await request(app).post('/api/v1/tasks').send({ title: 'X' });
      await request(app)
        .patch(`/api/v1/tasks/${created.body.data.id}`)
        .send({})
        .expect(422);
    });

    it('returns 404 for missing id', async () => {
      await request(app)
        .patch('/api/v1/tasks/00000000-0000-0000-0000-000000000000')
        .send({ title: 'x' })
        .expect(404);
    });
  });

  describe('DELETE /api/v1/tasks/:id', () => {
    it('deletes the task', async () => {
      const created = await request(app).post('/api/v1/tasks').send({ title: 'X' });
      await request(app).delete(`/api/v1/tasks/${created.body.data.id}`).expect(204);
      await request(app).get(`/api/v1/tasks/${created.body.data.id}`).expect(404);
    });

    it('returns 404 for missing id', async () => {
      await request(app)
        .delete('/api/v1/tasks/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });

  describe('GET /health', () => {
    it('responds ok', async () => {
      const res = await request(app).get('/health').expect(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('unknown route', () => {
    it('returns 404', async () => {
      await request(app).get('/api/v1/nope').expect(404);
    });
  });
});
