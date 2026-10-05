# Nosh: Dish Dashboard (draft editing and safe updates)

A dish-management dashboard. Edits stay local as drafts until the user saves. The backend validates
every save and uses optimistic concurrency (a version number) so that a stale draft can never
overwrite a newer saved change.

| Part     | Tech |
|----------|------|
| Frontend | React 19 + Vite |
| Backend  | Node.js + Express 5 |
| Database | SQLite file database through Node's built-in `node:sqlite` (persistent, nothing native to compile) |
| Tests    | `node:test` (backend API) · Vitest + Testing Library (frontend draft logic and card) |

**Optional bonus (external updates): implemented** with polling every 5 s (see [Bonus](#optional-bonus-external-updates)).

### What the dashboard offers

- **Drafts you can see:** edited cards get an amber outline, an **Unsaved changes** badge, and "Saved value: …"
  hints under each changed field. The header counts unsaved drafts, and clicking the counter shows only those dishes.
- **Search and filters:** search by name or ID (press <kbd>/</kbd> to jump there, <kbd>Esc</kbd> to clear), plus filter chips
  **All / Published / Unpublished / Unsaved** with counts. Filtering only *hides* cards, so a draft is never lost by filtering.
- **Keyboard:** <kbd>Enter</kbd> or <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>S</kbd> saves the card you are editing.
- **Warnings before saving:** if you publish a dish with an empty name, or whose image URL is not http(s), the card warns you before
  you save. The backend is still the authority and rejects it with a 400 if you save anyway.
- **Safe conflict handling:** a stale save is rejected (409). The card explains what changed, keeps your draft, and offers
  **Reload latest** with an inline "Discard your unsaved changes?" confirmation (**Yes, discard and reload** / **Keep my draft**).
- **Clear feedback:** "Saving…", "✓ Saved as vN", **Retry save** after network errors, a live sync indicator
  ("Live · synced 10:21" or "Can't reach server · retrying"), placeholder cards while loading, and error and empty states.
- **Phone, tablet and desktop layouts**, light and dark mode (follows the OS), an accessible switch for **Published**,
  visible focus rings, reduced-motion support, and a warning before closing the tab with unsaved drafts.

---

## Prerequisites

- **Node.js 22.13 or newer** (Node 24 LTS recommended) and npm. The backend uses the built-in
  `node:sqlite` module, so there is no native add-on to compile and no separate database server to install.
  Node 22 may print an `ExperimentalWarning` for SQLite; it is harmless.
- Optional: `curl` for the API examples. Git Bash is easiest on Windows; in PowerShell use `curl.exe`, not `curl`.

## Setup and run

```bash
git clone <repo-url> nosh-dish-dashboard
cd nosh-dish-dashboard

# 1) Backend: install, seed, start (http://localhost:4000)
cd backend
cp .env.example .env        # optional: the defaults are identical
npm install
npm run seed                # idempotent, safe to rerun
npm start

# 2) Frontend, in a second terminal (http://localhost:5173)
cd frontend
cp .env.example .env        # optional
npm install
npm run dev
```

Open http://localhost:5173.

| Command (in `backend/`) | What it does |
|---|---|
| `npm run seed` | Loads `seed/dishes.json` (the supplied JSON, unchanged) into `data/dishes.db` |
| `npm run seed -- <file.json>` | Seeds another file (path relative to `backend/`) |
| `npm run seed:fixtures` | Adds 3 **test-only** dishes with bad image URLs (see [verification](#3-publish-validation-empty-name-and-invalid-image-url)) |
| `npm start` / `npm run dev` | Starts the API (`dev` restarts on file changes) |
| `npm test` | Runs the automated API, concurrency, seed and restart tests |

To start from an empty database, stop the backend, delete `backend/data/`, and run `npm run seed` again.

### Environment variables

`backend/.env.example`
```ini
PORT=4000
DB_PATH=./data/dishes.db                                 # relative to backend/
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173  # comma-separated
```

`frontend/.env.example`
```ini
VITE_API_URL=http://localhost:4000
```

There are no secrets. Both `.env` files are optional because these values are the defaults.

### How seeding works

`npm run seed` validates each record and runs `INSERT ... ON CONFLICT(dishId) DO NOTHING` inside one
transaction. New dishes get `version = 1`. Existing rows are never modified, so rerunning the seed
creates no duplicates (`dishId` is the primary key) and keeps saved edits and versions. Example output on a rerun:

```
inserted: 0, already present (left unchanged): 5, skipped (invalid): 0
```

---

## API

Base URL `http://localhost:4000`. All responses are JSON.

### `GET /dishes`

```bash
curl http://localhost:4000/dishes
```
```json
[
  { "dishId": "1", "dishName": "Jeera Rice", "imageUrl": "https://nosh-assignment.s3.ap-south-1.amazonaws.com/jeera-rice.jpg", "isPublished": true, "version": 1 },
  ...
]
```

### `PATCH /dishes/:dishId`

The body must contain exactly these fields: `dishName` (string), `isPublished` (boolean) and
`expectedVersion` (positive integer, the version the draft was loaded from). The name is trimmed before it is stored.
`isPublished` is stored as the explicit value sent; it is never toggled.

```bash
curl -X PATCH http://localhost:4000/dishes/2 \
  -H "Content-Type: application/json" \
  -d '{"dishName":"Paneer Curry","isPublished":true,"expectedVersion":1}'
```
**200**, the saved dish with its version incremented:
```json
{ "dishId": "2", "dishName": "Paneer Curry", "imageUrl": "https://...paneer-tikka.jpg", "isPublished": true, "version": 2 }
```

Sending the same request again (still `expectedVersion: 1`) returns **409**, and nothing is overwritten:
```json
{ "code": "VERSION_CONFLICT",
  "error": "This dish was updated by someone else. Reload to see the latest version.",
  "current": { "dishId": "2", "dishName": "Paneer Curry", "isPublished": true, "version": 2, "imageUrl": "..." } }
```

| Status | `code` | When |
|---|---|---|
| 200 | – | Saved. Returns the saved dish with `version + 1` |
| 400 | `VALIDATION_FAILED` | Wrong or missing types, unknown fields, `dishName` over 120 characters, bad `dishId` format, or publishing with an empty (trimmed) name or a non-http(s) `imageUrl`. `details: [{ field, message }]` |
| 400 | `MALFORMED_JSON` | The body is not valid JSON |
| 404 | `DISH_NOT_FOUND` | No dish with that `dishId` |
| 409 | `VERSION_CONFLICT` | `expectedVersion` differs from the stored version. Returns `current` |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 10 kB |
| 500 | `INTERNAL_ERROR` | Unexpected failure (logged on the server; no internals leaked) |

Checks run in this order: format of id and body (400), then existence (404), then version (409),
then publish rules (400). The last three run inside one write transaction. **No failed request
changes the stored dish.**

More examples:
```bash
# 400: publish with a blank name
curl -X PATCH localhost:4000/dishes/1 -H "Content-Type: application/json" -d '{"dishName":"   ","isPublished":true,"expectedVersion":1}'
# 400: wrong types
curl -X PATCH localhost:4000/dishes/1 -H "Content-Type: application/json" -d '{"dishName":5,"isPublished":"yes","expectedVersion":"1"}'
# 404: unknown dish
curl -X PATCH localhost:4000/dishes/999 -H "Content-Type: application/json" -d '{"dishName":"x","isPublished":false,"expectedVersion":1}'
```
PowerShell equivalent of a PATCH:
```powershell
Invoke-RestMethod -Method Patch -Uri http://localhost:4000/dishes/2 -ContentType 'application/json' -Body '{"dishName":"Paneer Curry","isPublished":true,"expectedVersion":1}'
```

---

## Architecture

```
backend/
  seed/dishes.json         supplied seed data (unchanged)
  seed/test-fixtures.json  test-only dishes with invalid/broken image URLs
  src/config.js            env loading (.env), paths resolved from backend/
  src/db.js                open SQLite (WAL, busy_timeout), schema, transaction helper
  src/dishRepository.js    all SQL: list, find, compare-and-swap update, insert-if-missing
  src/validation.js        pure validation: id, PATCH body, publish rules, http(s) URL check
  src/dishService.js       update use case: validate, then 404 / 409 / rules / CAS in one transaction
  src/app.js               Express routes: map service results to HTTP status, error handler
  src/server.js            wiring + graceful shutdown
  src/seedDishes.js        idempotent seed logic;  src/seed.js = CLI
  test/api.test.js         API, validation, conflict, concurrency, seed tests
  test/restart.test.js     real process: seed, save, kill, restart, reseed, verify

frontend/src/
  api.js                     fetch wrappers: { ok, status, data }, NetworkError, 10 s timeout
  utils.js                   shared UI helpers (http(s) URL check, name limit, labels)
  hooks/useDishes.js         saved dishes from the server: initial load, polling, merge by version
  hooks/useDishDraft.js      per-dish draft state: base/draft, save, discard, conflict, reload
  components/DishCard.jsx    one dish: form, unsaved indicators, warnings, error/conflict notices, inline confirm
  components/DishImage.jsx   image with broken/invalid URL fallback
  components/Toolbar.jsx     search box + filter chips
  components/SyncStatus.jsx  live / disconnected indicator
  App.jsx                    page: loading / error / empty states, filtering, shortcuts, beforeunload guard
  __tests__/                 Vitest: draft hook, merge-by-version, DishCard conflict flow
```

Each layer has one job. Routes know HTTP and nothing about SQL. The service knows the rules and nothing about HTTP.
The repository is the only file with SQL in it. Everything is synchronous on the backend (`node:sqlite`), so a request's database
work cannot interleave with another request's.

### Frontend draft model

Each card keeps two values:

- **`base`**: the saved values the card last loaded, including `version`. This version is sent as `expectedVersion`.
- **`draft`**: the user's local edits, held only in React state. Nothing is sent until **Save**.

`isDirty = draft differs from base`. A dirty card gets an amber border, an **Unsaved changes** badge,
"Saved value: …" hints under each changed field, and a header counter. A `beforeunload` prompt warns before a refresh discards drafts.

| Action / result | What happens |
|---|---|
| **Discard** | `draft = base`. Clears errors and any conflict notice |
| **Save → 200** | `base = draft = response` (new version). The unsaved indicator clears and "Saved as vN" shows |
| **Save → 400** | Draft kept. The server's messages are listed. The user can correct and save again |
| **Save → network error / 5xx / timeout** | Draft kept, inputs stay editable, and the button becomes **Retry save** |
| **Save → 409** | Draft kept untouched. A notice shows the newer saved version, and Save is disabled. **Reload latest (discards your draft)** asks inline first ("Yes, discard and reload" / "Keep my draft"). Nothing is retried automatically |
| Save in progress | Save, Discard, Reload and the inputs are disabled |

---

## Design decision: optimistic concurrency with a compare-and-swap inside a write transaction

The core requirement is that the version check and the write must be atomic. The update is a single
compare-and-swap statement:

```sql
UPDATE dishes SET dishName = ?, isPublished = ?, version = version + 1
 WHERE dishId = ? AND version = ?      -- expectedVersion
```

If another save got there first, the `WHERE` matches nothing (`changes = 0`). The request becomes a 409, and
the stored row is untouched. No separate read-then-write step can race. The service also wraps the lookup, the
version check, the publish-rule check and this statement in `BEGIN IMMEDIATE … COMMIT`. That takes SQLite's write lock
first, so the dish the rules are validated against is exactly the dish being updated, even if another process (a second API
instance or the seed script) writes to the same file.

Why optimistic rather than pessimistic locking: dashboard edits are long-lived drafts that may sit for minutes.
Holding locks while a user types would block everyone. With a version number, nobody waits, and a conflict is
detected only at save time, where the user can decide what to do.

Tested: 25 parallel PATCHes with the same `expectedVersion` return exactly one 200 and 24 409s. A second
database connection with a stale version also gets a conflict (`backend/test/api.test.js`).

---

## Verification of the acceptance checks

Automated (backend): `cd backend && npm test` runs 14 tests, all passing on Node 24.

```
✔ GET /dishes returns every dish with boolean isPublished and version 1
✔ PATCH saves the trimmed name and explicit status, increments version
✔ stale expectedVersion -> 409 with current dish, nothing overwritten
✔ publishing with an empty / whitespace name -> 400, nothing changed
✔ publishing a dish whose imageUrl is not http(s) -> 400, nothing changed
✔ an unpublished dish may be saved even with an invalid imageUrl
✔ wrong or missing field types -> 400, nothing changed
✔ malformed JSON and non-JSON bodies -> 400
✔ unknown dishId -> 404, malformed dishId -> 400, unknown route -> 404
✔ concurrent saves with the same expectedVersion: exactly one wins
✔ version check is enforced by the database across separate connections
✔ reseeding inserts nothing new and keeps saved edits
✔ seed skips invalid records
✔ saved changes and versions survive a backend restart and a reseed   (spawns and kills the real server)
```

The tests use throwaway databases in the OS temp directory and never touch `backend/data/dishes.db`.

Automated (frontend): `cd frontend && npm test` runs 12 Vitest tests, all passing, with the API mocked.

```
✓ mergeNewer: a stale poll response never rolls a dish back to an older version
✓ mergeNewer: newer versions replace older ones and the server list decides membership and order
✓ useDishDraft: edits stay local until Save; Discard restores the loaded values
✓ useDishDraft: Save sends the draft with the originally loaded version and applies the saved result
✓ useDishDraft: marks the request in progress so the UI can disable Save
✓ useDishDraft: 409 keeps the draft untouched, never retries, and reload loads the newer version
✓ useDishDraft: 400 shows the server messages and keeps the draft for correction
✓ useDishDraft: network failure keeps the draft and a retry can succeed
✓ useDishDraft: newer saved data replaces a clean card but never a draft
✓ DishCard: shows unsaved state and the saved value while editing
✓ DishCard: warns before saving a published dish without a name
✓ DishCard: conflict: reload asks inline first and "Keep my draft" keeps it
```

I also ran the manual steps below in the browser against a freshly seeded database.

### 1. Setup and reseeding
1. Follow [Setup and run](#setup-and-run). The seed output says `inserted: 5`.
2. Edit and save a dish in the UI (for example Jeera Rice becomes "Jeera Rice Bowl", v2).
3. Run `npm run seed` again. The output says `inserted: 0, already present (left unchanged): 5`.
   `curl localhost:4000/dishes` still shows "Jeera Rice Bowl" at v2, and there are still 5 dishes.

### 2. Drafts, discard and persistence
1. Change a dish's name and untick **Published**. The card turns amber, shows **Unsaved changes** and
   "Saved value: …" hints, and the header shows "1 unsaved draft".
2. `curl localhost:4000/dishes` still shows the old values. Nothing is sent before Save.
3. Click **Discard**. The original values come back and the indicators clear.
4. Edit again and click **Save**. The card shows "Saved as v2" and the header version becomes v2.
5. Refresh the browser. The saved values stay.
6. Restart the backend (Ctrl+C, then `npm start`) and refresh. The values and version stay
   (automated in `test/restart.test.js`, which hard-kills the process).

### 3. Publish validation: empty name and invalid image URL
- **Empty name:** clear a published dish's name (or type only spaces), keep **Published** ticked, and click Save.
  The UI shows *"A published dish must have a non-empty name"*. The draft is kept, and `curl` shows the stored dish unchanged
  (same name, same version).
- **Invalid image URL, verified with test data.** The supplied dishes all have valid https URLs, and the API
  cannot change `imageUrl`, so test-only fixtures supply bad URLs:
  ```bash
  cd backend && npm run seed:fixtures      # adds 3 unpublished test dishes (ids start with "test-")
  ```
  | dishId | imageUrl | Expected |
  |---|---|---|
  | `test-invalid-url` | `not-a-valid-url` | publish: **400** |
  | `test-ftp-url` | `ftp://example.com/dish.jpg` | publish: **400** |
  | `test-broken-image` | `https://example.com/this-image-does-not-exist.jpg` | publish: **200** (valid http(s) URL; reachability is not checked), and the UI shows the image fallback |

  ```bash
  curl -X PATCH localhost:4000/dishes/test-invalid-url -H "Content-Type: application/json" \
    -d '{"dishName":"Test: invalid image URL","isPublished":true,"expectedVersion":1}'
  # 400 {"code":"VALIDATION_FAILED","error":"Validation failed",
  #      "details":[{"field":"imageUrl","message":"A published dish must have a valid http/https imageUrl"}]}
  curl localhost:4000/dishes      # test-invalid-url is still isPublished:false, version:1
  ```
  In the UI, ticking **Published** on "Test: non-http image URL" and saving shows the same message, and the draft is kept.
  To remove the fixtures, delete `backend/data/` and run `npm run seed`.

### 4. Two tabs, one stale draft
1. Open http://localhost:5173 in **tab A** and **tab B**.
2. In tab B, change Rabdi's name to "Rabdi from tab B". Don't save.
3. In tab A, change Rabdi's name to "Rabdi from tab A" and **Save** (v1 becomes v2).
4. Back in tab B: within 5 s, or immediately on switching tabs, the card shows *"Newer saved data is
   available (v2: 'Rabdi from tab A')"*. The draft is untouched.
5. Click **Save** in tab B. The response is **409**, and the card shows *"Not saved: this dish was changed by another update"*
   with the v2 values. B's draft stays in the input, and Save is disabled.
6. `curl localhost:4000/dishes` shows "Rabdi from tab A", v2. A's update is intact.
7. **Reload latest (discards your draft)** asks inline first. **Keep my draft** keeps it, and **Yes, discard and reload**
   loads v2. **Discard** also drops the draft.

### 5. Failed save and retry
1. Edit a dish, then stop the backend (Ctrl+C).
2. Click **Save**. The card shows *"Could not reach the server. Your draft is kept; retry when the backend is
   reachable."* The input stays editable, the button becomes **Retry save**, and the header shows "Can't reach server · retrying every 5 s".
   (Alternative: DevTools, Network, Offline.)
3. Start the backend again and click **Retry save**. The save succeeds and the header returns to "Live".
4. Invalid input and unknown ids: see the curl examples in [API](#api). They return 400 `VALIDATION_FAILED` and 404 `DISH_NOT_FOUND`.

### 6. UI states
- **Loading:** a spinner while the first request is in flight.
- **Error:** start the frontend with the backend stopped. You get "Couldn't load dishes" and a **Try again** button.
- **Empty:** point `DB_PATH` at a new file without seeding. You get "No dishes yet. Seed the database with `npm run seed`".
- **Broken image:** the fixture dishes above show the "Image unavailable" placeholder.
- **Responsive:** the grid collapses to one column on phones (checked at 375 px). Dark mode follows the OS.

---

## Optional bonus: external updates

**Implemented, using polling.** With the dashboard open, run:
```bash
curl -X PATCH localhost:4000/dishes/5 -H "Content-Type: application/json" \
  -d '{"dishName":"Alfredo Pasta (edited via curl)","isPublished":false,"expectedVersion":1}'
```
The Alfredo Pasta card updates by itself within 5 s, with no refresh.

- **Update delay:** at most about 5 s plus request time. `GET /dishes` is polled every **5 s**
  (`POLL_INTERVAL_MS` in `useDishes.js`). Returning to the tab (`visibilitychange`) or coming back online (`online` event)
  triggers an immediate poll.
- **Cards with a draft** are never replaced in the background. They show "Newer saved data is available (vN …)"
  with a **Load latest (discards your draft)** button that asks for confirmation inline. Cards without a draft follow the latest saved data automatically.
- **Out-of-order safety:** incoming data is merged per dish **by version**, keeping the higher one, so a slow poll
  that started before a save can never roll a dish back to an older version.
- **Timer and connection cleanup:** polling is a `setTimeout` chain, so the next request is scheduled only after the previous one finishes
  and requests never overlap. Each request has an `AbortController`. The `useEffect` cleanup sets a `stopped` flag, clears the timer,
  aborts the in-flight request and removes the `online`/`visibilitychange` listeners, so nothing leaks on unmount (or under StrictMode's double mount).
- **Temporary disconnection:** a failed poll keeps the last good data on screen and shows "Can't reach server ·
  retrying every 5 s". Polling continues, and the next success clears the warning. Drafts are unaffected. Each request times out after 10 s.
- Direct database edits that don't bump `version` are not detected, which the brief allows.

---

## Known limitations

- **Polling, not push.** Simple and robust, but up to about 5 s of delay and one request every 5 s per open tab.
  SSE would be the next step for many concurrent viewers.
- **Drafts are in memory only.** A refresh or closing the tab discards them. A `beforeunload` prompt warns,
  and no server-side draft store was required. Drafts could be persisted to `localStorage` keyed by `dishId` and `version`.
- **No "overwrite anyway" or merge on conflict.** The user reloads (losing the draft) and re-applies the changes manually.
  That is a deliberate choice to never silently overwrite. The draft stays visible to copy from before reloading.
- **Unpublished dishes may have an empty name.** The brief requires a non-empty name only for published dishes, and
  the backend enforces exactly that.
- **No end-to-end browser tests.** The frontend draft logic and the card are unit-tested with Vitest, and the backend has API tests.
  The full two-tab and backend-down flows were verified manually (steps above). Playwright would be the next step.
- **Filters use saved values.** A card filtered by Published/Unpublished moves only after a successful save, not while
  you are editing its draft.
- **SQLite** is a single file on one machine: fine for this scope, not a multi-node production database.
  `node:sqlite` is new in Node and needs Node ≥ 22.13.
- **No authentication, pagination, image upload, or dish creation and deletion** (out of scope). The fixture seed is the
  only way to add test dishes.
- **CORS** allows only the origins in `CORS_ORIGIN`. The Vite dev server uses `strictPort`, so it fails clearly if
  port 5173 is taken instead of silently moving to a port the API would reject.

## Time spent

Approximately **_X_ hours** (fill in before submitting).

## AI and reused-code disclosure

- **AI assistance:** this project was built with an AI coding assistant (Claude by Anthropic, used through Claude Code).
  It helped write and refactor the backend and frontend code, the tests and this README, and helped run the
  verification steps. I reviewed the code, ran it locally, and can explain and modify every part of it, including the
  draft state and conflict handling.
- **Libraries:** Express, cors, React, React DOM, Vite and @vitejs/plugin-react; for tests, Vitest,
  @testing-library/react and jsdom (see `package.json` files); plus Node's built-in `node:sqlite` and `node:test`.
- **Reused code:** no substantial code was copied from other repositories or tutorials.
- **Seed data:** `backend/seed/dishes.json` is the JSON supplied in the assignment, unchanged.
