import { transaction } from './db.js';

const COLUMNS = 'dishId, dishName, imageUrl, isPublished, version';

// SQLite has no boolean type; isPublished is stored as 0/1 and exposed as a boolean.
const toDish = (row) => (row ? { ...row, isPublished: row.isPublished === 1 } : null);

/** All SQL lives here. Every method is synchronous (node:sqlite is a synchronous driver). */
export function createDishRepository(db) {
  const selectAll = db.prepare(`SELECT ${COLUMNS} FROM dishes ORDER BY rowid`);
  const selectOne = db.prepare(`SELECT ${COLUMNS} FROM dishes WHERE dishId = ?`);
  // Compare-and-swap: the version check is part of the UPDATE itself, so the row is only
  // written if nobody has changed it since the client loaded `expectedVersion`.
  const updateIfVersion = db.prepare(`
    UPDATE dishes
       SET dishName = ?, isPublished = ?, version = version + 1
     WHERE dishId = ? AND version = ?
  `);
  // Seeding never touches an existing row, so reseeding keeps saved edits and versions.
  const insertIfMissing = db.prepare(`
    INSERT INTO dishes (${COLUMNS}) VALUES (?, ?, ?, ?, 1)
    ON CONFLICT (dishId) DO NOTHING
  `);

  return {
    list: () => selectAll.all().map(toDish),

    findById: (dishId) => toDish(selectOne.get(dishId)),

    /** Returns true if the row was updated, false if the version no longer matched. */
    updateIfVersionMatches(dishId, expectedVersion, { dishName, isPublished }) {
      const { changes } = updateIfVersion.run(dishName, isPublished ? 1 : 0, dishId, expectedVersion);
      return changes === 1;
    },

    /** Returns true if inserted, false if a dish with this id already existed. */
    insertIfMissing({ dishId, dishName, imageUrl, isPublished }) {
      const { changes } = insertIfMissing.run(dishId, dishName, imageUrl, isPublished ? 1 : 0);
      return changes === 1;
    },

    transaction: (fn) => transaction(db, fn),
  };
}
