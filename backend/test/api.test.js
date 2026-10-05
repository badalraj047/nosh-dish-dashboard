import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db.js';
import { createDishRepository } from '../src/dishRepository.js';
import { createDishService } from '../src/dishService.js';
import { createApp } from '../src/app.js';
import { seedDishes } from '../src/seedDishes.js';

const SEED = [
  { dishId: '1', dishName: 'Jeera Rice', imageUrl: 'https://example.com/jeera.jpg', isPublished: true },
  { dishId: '2', dishName: 'Paneer Tikka', imageUrl: 'https://example.com/paneer.jpg', isPublished: false },
  { dishId: 'bad-url', dishName: 'Bad URL', imageUrl: 'not-a-valid-url', isPublished: false },
  { dishId: 'ftp-url', dishName: 'FTP URL', imageUrl: 'ftp://example.com/x.jpg', isPublished: false },
];

const tmpDbPath = () => path.join(os.tmpdir(), `nosh-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
const removeDb = (p) => { for (const s of ['', '-wal', '-shm']) fs.rmSync(p + s, { force: true }); };

function startApi(dbPath) {
  const db = openDb(dbPath);
  const repo = createDishRepository(db);
  const server = createApp({ dishService: createDishService(repo) }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const stop = () => new Promise((resolve) => { server.close(() => { db.close(); resolve(); }); server.closeAllConnections(); });
  return { db, repo, base, stop };
}

const send = (base, method, url, body, headers = { 'Content-Type': 'application/json' }) =>
  fetch(base + url, { method, headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('Dish API', () => {
  const dbPath = tmpDbPath();
  let api;
  const patch = (id, body) => send(api.base, 'PATCH', `/dishes/${id}`, body);
  const stored = (id) => api.repo.findById(id);

  before(() => {
    api = startApi(dbPath);
    seedDishes(api.repo, SEED);
  });
  after(async () => { await api.stop(); removeDb(dbPath); });

  test('GET /dishes returns every dish with boolean isPublished and version 1', async () => {
    const res = await fetch(`${api.base}/dishes`);
    assert.equal(res.status, 200);
    const dishes = await res.json();
    assert.equal(dishes.length, SEED.length);
    assert.deepEqual(dishes[0], { ...SEED[0], version: 1 });
    assert.ok(dishes.every((d) => d.version === 1 && typeof d.isPublished === 'boolean'));
  });

  test('PATCH saves the trimmed name and explicit status, increments version', async () => {
    let res = await patch('2', { dishName: '  Paneer Curry  ', isPublished: true, expectedVersion: 1 });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { dishId: '2', dishName: 'Paneer Curry', imageUrl: SEED[1].imageUrl, isPublished: true, version: 2 });

    // Sending the same status again keeps it (explicit value, not a toggle).
    res = await patch('2', { dishName: 'Paneer Curry', isPublished: true, expectedVersion: 2 });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).isPublished, true);
    assert.deepEqual(stored('2'), { ...SEED[1], dishName: 'Paneer Curry', isPublished: true, version: 3 });
  });

  test('stale expectedVersion -> 409 with current dish, nothing overwritten', async () => {
    const before = stored('2');
    const res = await patch('2', { dishName: 'Stale draft', isPublished: false, expectedVersion: 1 });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.code, 'VERSION_CONFLICT');
    assert.deepEqual(body.current, before);
    assert.deepEqual(stored('2'), before);
  });

  test('publishing with an empty / whitespace name -> 400, nothing changed', async () => {
    const before = stored('1');
    for (const dishName of ['', '   ']) {
      const res = await patch('1', { dishName, isPublished: true, expectedVersion: before.version });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.code, 'VALIDATION_FAILED');
      assert.match(body.details[0].message, /non-empty name/);
    }
    assert.deepEqual(stored('1'), before);
  });

  test('publishing a dish whose imageUrl is not http(s) -> 400, nothing changed', async () => {
    for (const id of ['bad-url', 'ftp-url']) {
      const before = stored(id);
      const res = await patch(id, { dishName: 'Valid name', isPublished: true, expectedVersion: 1 });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.deepEqual(body.details, [{ field: 'imageUrl', message: 'A published dish must have a valid http/https imageUrl' }]);
      assert.deepEqual(stored(id), before);
    }
  });

  test('an unpublished dish may be saved even with an invalid imageUrl', async () => {
    const res = await patch('bad-url', { dishName: 'Renamed draft dish', isPublished: false, expectedVersion: 1 });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).version, 2);
  });

  test('wrong or missing field types -> 400, nothing changed', async () => {
    const before = stored('1');
    const v = before.version;
    const bodies = [
      { dishName: 5, isPublished: true, expectedVersion: v },
      { dishName: 'x', isPublished: 'true', expectedVersion: v },
      { dishName: 'x', isPublished: true, expectedVersion: String(v) },
      { dishName: 'x', isPublished: true, expectedVersion: 1.5 },
      { dishName: 'x', isPublished: true, expectedVersion: 0 },
      { dishName: 'x', isPublished: true },
      { dishName: 'x'.repeat(121), isPublished: true, expectedVersion: v },
      { dishName: 'x', isPublished: true, expectedVersion: v, imageUrl: 'https://evil.example' },
      [],
    ];
    for (const body of bodies) {
      const res = await patch('1', body);
      assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
      assert.equal((await res.json()).code, 'VALIDATION_FAILED');
    }
    assert.deepEqual(stored('1'), before);
  });

  test('malformed JSON and non-JSON bodies -> 400', async () => {
    let res = await send(api.base, 'PATCH', '/dishes/1', '{"dishName": ');
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, 'MALFORMED_JSON');
    res = await send(api.base, 'PATCH', '/dishes/1', 'dishName=x', { 'Content-Type': 'text/plain' });
    assert.equal(res.status, 400);
  });

  test('unknown dishId -> 404, malformed dishId -> 400, unknown route -> 404', async () => {
    let res = await patch('does-not-exist', { dishName: 'x', isPublished: false, expectedVersion: 1 });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).code, 'DISH_NOT_FOUND');
    res = await patch('bad%20id!', { dishName: 'x', isPublished: false, expectedVersion: 1 });
    assert.equal(res.status, 400);
    res = await fetch(`${api.base}/nope`);
    assert.equal(res.status, 404);
  });

  test('concurrent saves with the same expectedVersion: exactly one wins', async () => {
    const { version } = stored('1');
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) => patch('1', { dishName: `Concurrent ${i}`, isPublished: false, expectedVersion: version })),
    );
    const statuses = results.map((r) => r.status);
    assert.equal(statuses.filter((s) => s === 200).length, 1);
    assert.equal(statuses.filter((s) => s === 409).length, 24);
    const winner = await results[statuses.indexOf(200)].json();
    assert.deepEqual(stored('1'), winner);
    assert.equal(winner.version, version + 1);
  });

  test('version check is enforced by the database across separate connections', () => {
    const otherDb = openDb(dbPath);
    try {
      const serviceA = createDishService(api.repo);
      const serviceB = createDishService(createDishRepository(otherDb));
      const { version } = serviceB.listDishes().find((d) => d.dishId === '2');
      assert.equal(serviceA.updateDish('2', { dishName: 'From A', isPublished: true, expectedVersion: version }).type, 'ok');
      const resultB = serviceB.updateDish('2', { dishName: 'From B', isPublished: false, expectedVersion: version });
      assert.equal(resultB.type, 'conflict');
      assert.equal(resultB.current.dishName, 'From A');
    } finally {
      otherDb.close();
    }
  });
});

describe('Seeding and persistence', () => {
  test('reseeding inserts nothing new and keeps saved edits', async () => {
    const dbPath = tmpDbPath();
    let api = startApi(dbPath);
    try {
      assert.equal(seedDishes(api.repo, SEED).inserted, SEED.length);
      await send(api.base, 'PATCH', '/dishes/1', { dishName: 'Edited', isPublished: false, expectedVersion: 1 });
      await api.stop();

      // "Restart": a fresh connection to the same database file.
      api = startApi(dbPath);
      const summary = seedDishes(api.repo, SEED);
      assert.deepEqual(summary, { inserted: 0, unchanged: SEED.length, skipped: [] });
      const dishes = await (await fetch(`${api.base}/dishes`)).json();
      assert.equal(dishes.length, SEED.length);
      assert.deepEqual(dishes[0], { ...SEED[0], dishName: 'Edited', isPublished: false, version: 2 });
    } finally {
      await api.stop();
      removeDb(dbPath);
    }
  });

  test('seed skips invalid records', () => {
    const db = openDb(':memory:');
    try {
      const summary = seedDishes(createDishRepository(db), [
        { dishId: 7, dishName: 'Numeric id', imageUrl: 'https://example.com/a.jpg', isPublished: true },
        { dishId: '8', dishName: '', imageUrl: 'https://example.com/a.jpg', isPublished: true },
        { dishId: '9', dishName: 'No status', imageUrl: 'https://example.com/a.jpg' },
      ]);
      assert.equal(summary.inserted, 1);
      assert.equal(summary.skipped.length, 2);
    } finally {
      db.close();
    }
  });
});
