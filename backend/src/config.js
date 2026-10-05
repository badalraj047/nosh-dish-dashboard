import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Backend root (the folder containing package.json). Relative paths resolve from here,
// so `npm start` / `npm run seed` behave the same regardless of the current directory.
export const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Load backend/.env if present. Variables already set in the environment take precedence.
const envFile = path.join(BACKEND_ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const resolveFromRoot = (p) => (p === ':memory:' ? p : path.resolve(BACKEND_ROOT, p));

export const config = {
  port: Number(process.env.PORT) || 4000,
  dbPath: resolveFromRoot(process.env.DB_PATH || './data/dishes.db'),
  // Comma-separated list of allowed browser origins for CORS.
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  defaultSeedFile: path.join(BACKEND_ROOT, 'seed', 'dishes.json'),
};
