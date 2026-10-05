// End-to-end: seed with the real CLI, save through a real server process, kill the process,
// start a new one and check the saved values are still there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = path.join(os.tmpdir(), `nosh-restart-${process.pid}-${Date.now()}.db`);
const port = 41000 + Math.floor(Math.random() * 2000);
const env = { ...process.env, DB_PATH: dbPath, PORT: String(port) };
const base = `http://127.0.0.1:${port}`;

function startServer() {
  const child = spawn(process.execPath, ['src/server.js'], { cwd: backendRoot, env });
  return new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => { if (String(chunk).includes('listening')) resolve(child); });
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`server exited early (code ${code})`)));
  });
}
const stopServer = (child) => new Promise((resolve) => { child.once('exit', resolve); child.kill(); });
const seed = () => execFileSync(process.execPath, ['src/seed.js'], { cwd: backendRoot, env, encoding: 'utf8' });

test('saved changes and versions survive a backend restart and a reseed', async (t) => {
  t.after(() => { for (const s of ['', '-wal', '-shm']) fs.rmSync(dbPath + s, { force: true }); });

  assert.match(seed(), /inserted: 5/);
  let server = await startServer();
  const res = await fetch(`${base}/dishes/3`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dishName: 'Rabdi (saved before restart)', isPublished: false, expectedVersion: 1 }),
  });
  assert.equal(res.status, 200);
  await stopServer(server); // hard kill: no graceful shutdown

  assert.match(seed(), /inserted: 0, already present \(left unchanged\): 5/);
  server = await startServer();
  try {
    const dishes = await (await fetch(`${base}/dishes`)).json();
    assert.equal(dishes.length, 5);
    const rabdi = dishes.find((d) => d.dishId === '3');
    assert.deepEqual(
      { dishName: rabdi.dishName, isPublished: rabdi.isPublished, version: rabdi.version },
      { dishName: 'Rabdi (saved before restart)', isPublished: false, version: 2 },
    );
  } finally {
    await stopServer(server);
  }
});
