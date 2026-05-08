import { createApp } from './app';
import { config } from './config';
import { runMigrations } from './db/migrate';
import { closeDb } from './db/connection';

function start(): void {
  runMigrations();

  const app = createApp();
  const server = app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Tasks API listening on http://localhost:${config.port} (${config.nodeEnv})`);
  });

  const shutdown = (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`\nReceived ${signal}, shutting down...`);
    server.close((err) => {
      if (err) {
        // eslint-disable-next-line no-console
        console.error('Error during server close:', err);
        process.exit(1);
      }
      closeDb();
      process.exit(0);
    });

    // Hard timeout — if connections refuse to drain in 10s, force-exit.
    setTimeout(() => {
      // eslint-disable-next-line no-console
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
