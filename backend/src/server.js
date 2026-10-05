import { config } from './config.js';
import { openDb } from './db.js';
import { createDishRepository } from './dishRepository.js';
import { createDishService } from './dishService.js';
import { createApp } from './app.js';

const db = openDb(config.dbPath);
const dishService = createDishService(createDishRepository(db));
const app = createApp({ dishService, corsOrigins: config.corsOrigins });

const server = app.listen(config.port, () => {
  console.log(`Dish API listening on http://localhost:${config.port} (db: ${config.dbPath})`);
});

// Close the HTTP server and the database cleanly on Ctrl+C / container stop.
function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  server.closeAllConnections();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
