// Usage: npm run seed                 (loads seed/dishes.json)
//        npm run seed -- <file.json>   (loads another file, path relative to backend/)
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { openDb } from './db.js';
import { createDishRepository } from './dishRepository.js';
import { seedDishes } from './seedDishes.js';

const file = process.argv[2] ? path.resolve(process.argv[2]) : config.defaultSeedFile;
if (!fs.existsSync(file)) {
  console.error(`Seed file not found: ${file}`);
  process.exit(1);
}

const db = openDb(config.dbPath);
try {
  const records = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { inserted, unchanged, skipped } = seedDishes(createDishRepository(db), records);
  console.log(`Seeded ${path.relative(process.cwd(), file) || file} into ${config.dbPath}`);
  console.log(`  inserted: ${inserted}, already present (left unchanged): ${unchanged}, skipped (invalid): ${skipped.length}`);
  for (const reason of skipped) console.warn(`  skipped: ${reason}`);
} catch (err) {
  console.error(`Seeding failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
