# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server with hot reload (port 3001)
npm start            # Production server
cd server && npm run seed   # Seed test data
```

No build step — vanilla JS/CSS served directly. Frontend cache-busted via `?v=XXX` query params in `index.html`.

**Version bumping (required for any frontend change to reach users):**
- `sw.js`: `CACHE_NAME = 'pilote-vXXX'`
- `js/app.js`: `SW_VERSION = XXX`
- `index.html`: all `?v=XXX` on CSS/JS includes
- Driver app: `driver/sw.js` + `driver/index.html` (separate version track)

All three admin files must match. Forgetting any one causes stale cache on users' devices.

## Architecture

**Three apps, one server:**
- **Admin** (`/index.html`, `/js/`, `/css/`) — Fleet management dashboard
- **Driver** (`/driver/`) — Mobile-first PWA for chauffeurs
- **Monitor** (`/monitor/`) — Real-time GPS tracking dashboard

**Backend:** Express.js + MongoDB (Mongoose). JWT auth. Server entry: `server/index.js`.

**Frontend:** Vanilla JS SPA with hash-based routing. No framework, no bundler.

### Data Flow Pattern

```
Store.get('collection')     → synchronous read from in-memory cache
Store.add/update/delete()   → updates cache + fires background API call
Store.initialize()          → loads ALL data from GET /api/data into cache
```

`Store` is the single source of truth for the admin app. All pages read from it synchronously. The `/api/data` endpoint returns every collection in one response (chauffeurs, versements, planning, contraventions, etc.).

Driver app uses `DriverStore` — thin async wrapper around `fetch()` to `/api/driver/*`.

### Key Component APIs

**Modal** — single object argument:
```js
Modal.open({ title, body, footer, size, onConfirm, onCancel })
Modal.form(title, formHtml, onSubmit, size, onCancel)  // positional args
Modal.confirm(title, message, onConfirm)                // positional args
```
⚠️ `Modal.open()` takes ONE object. `Modal.form()` and `Modal.confirm()` take positional args. Mixing these up causes blank modals.

**FormBuilder:** `FormBuilder.build(fields)` → HTML string. `FormBuilder.getValues(container)` → object. `FormBuilder.validate(container, fields)` → boolean.

**Table:** `Table.create({ columns, data, ... })` → HTML string with sorting/pagination.

**Toast:** `Toast.success/error/warning/info(message)`

### Auth

- Admin: JWT in `localStorage('pilote_token')`, validated by `server/middleware/auth.js`
- Driver: separate JWT, validated by `server/middleware/driverAuth.js`
- Permissions: `user.permissions` object with boolean flags checked client-side

### Cron Jobs (started on server boot)

| Job | Interval | File |
|-----|----------|------|
| Yango sync | 1h | `server/utils/yango-cron.js` |
| Notifications | background | `server/utils/notification-cron.js` |
| Driving scores | 3am | `server/utils/behavior-cron.js` |
| Wave payments | 5min | `server/utils/wave-cron.js` |
| Recurring tasks | 30min | `server/utils/tache-cron.js` |

## Key Domain Concepts

- **Versement**: payment record from a driver. Has `statut` (valide/en_attente/partiel), `traitementManquant` (dette/perte), `manquant` (unpaid amount)
- **Redevance quotidienne**: daily quota each driver owes. Set per-chauffeur or overridden per-planning entry
- **Dette implicite**: driver was scheduled (planning) but has no versement → automatic debt
- **Dette explicite**: versement with `traitementManquant === 'dette'` and `manquant > 0`
- **Contravention debt detection**: `v.source === 'contravention'` OR `v.reference.startsWith('CHF')` OR `v.commentaire` contains "contravention"
- **Versement supprimé**: `statut === 'supprime'` MUST count as valid payment — excluding them causes phantom debts

## Deployment

- **Production**: Railway (auto-deploy from GitHub `main` branch)
- **URL**: `https://volt-vtc-production.up.railway.app`
- **Push command from worktree**: `git push origin claude/vibrant-cartwright:main`

## Language

The app UI is entirely in **French**. All labels, buttons, toasts, and comments use French text. Keep this consistent.
