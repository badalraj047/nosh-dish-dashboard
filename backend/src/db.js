import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS dishes (
    dishId      TEXT    PRIMARY KEY CHECK (length(dishId) > 0),
    dishName    TEXT    NOT NULL,
    imageUrl    TEXT    NOT NULL,
    isPublished INTEGER NOT NULL CHECK (isPublished IN (0, 1)),
    version     INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1)
  );
`;

/** Opens (creating if needed) the SQLite database file and ensures the schema exists. */
export function openDb(dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');   // durable writes, readers don't block the writer
  db.exec('PRAGMA busy_timeout = 5000;');  // wait for the write lock instead of failing immediately
  db.exec(SCHEMA);
  return db;
}

/**
 * Runs fn inside a write transaction. BEGIN IMMEDIATE takes SQLite's write lock up front,
 * so a read -> check -> write sequence inside fn cannot interleave with another writer,
 * even one in a different process (e.g. a second server instance or the seed script).
 */
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* transaction already closed */ }
    throw err;
  }
}
