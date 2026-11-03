# Playoff Challenge

A standalone web app for a friends' NFL playoff fantasy competition. **Not** part of
The League site — separate repo, separate deploy, different group of people.

> **DEMO STATE:** The app currently ships with demo data — the Jan 2026 playoff
> field (2025 season) — and demo lock times set in the future so it can be tried
> end to end. See "Remaining before January" below.

## The format (implemented as specified)

- Each entrant picks **exactly one player from each of the 14 playoff teams**:
  a 14-man roster of **3 QB / 4 RB / 4 WR / 3 TE** (no K/DEF). Validation is
  enforced in the UI *and* server-side — an invalid roster cannot be saved.
- Points accumulate across all four playoff rounds (Wild Card, Divisional,
  Conference, Super Bowl). Most total points wins.
- Each round, each entrant chooses **one player from their own roster** to score
  **double** that round (the "2x pick"). His team must be playing that round.
  Picks are changeable until that round's lock time.
- Default rule: the same player **may** be doubled in multiple rounds
  (`allow_repeat_doubler`, admin-configurable).
- Rosters are **hidden until the roster lock** — before it, the leaderboard shows
  only names and who's submitted. After it, full rosters, per-round points, and
  2x badges are public.
- No accounts/passwords: entrants claim a name with a 4–8 digit PIN
  (stored as a salted SHA-256 hash) and use name+PIN to come back.

## Scoring (default: full PPR)

Defined once in `src/lib/config.js`: pass yd 0.04, pass TD 4, INT −2,
rush yd 0.1, rush TD 6, reception 1, rec yd 0.1, rec TD 6, fumble lost −2,
2-pt conversion 2. All points math flows through `computePoints()` in
`src/lib/core.js`.

## Stack

- **SvelteKit** (Svelte 5 + Vite 6), mirroring the League site's stack.
- **Adapter: `@sveltejs/adapter-vercel`** — it installed cleanly and matches how
  Jake's other sites deploy. The Vercel runtime is pinned to `nodejs22.x` in
  `svelte.config.js` because the local build machine runs Node 24, which this
  adapter version rejects as an implicit default. (`@sveltejs/adapter-node` is
  the drop-in fallback.)
- **Database:** same pattern as the League site — Postgres via `pg` Pool using
  `DATABASE_URL` (SSL `rejectUnauthorized: false`) when set. When `DATABASE_URL`
  is **not** set, it falls back to a local SQLite file (`data/app.db`) via
  `node:sqlite`, so the app runs locally with zero setup. The SQLite fallback is
  for local dev only — Vercel's filesystem is ephemeral, so production **must**
  set `DATABASE_URL`. SQL is written portably (TEXT ids, JSON as TEXT, ISO
  timestamps) and a `query()` wrapper translates `$n` placeholders for SQLite.
- **No Tailwind** — plain CSS in `src/app.css` (dark theme, mobile-friendly) to
  keep the build lean.
- Core contest logic (`validateRoster`, `computePoints`, `computeLeaderboard`)
  lives in pure functions in `src/lib/core.js`, shared by the API routes and the
  unit tests.

## Pages & API

| Page | What it does |
| --- | --- |
| `/` | Leaderboard — WC/DIV/CONF/SB columns + Total, 2x badges, expandable rosters (after lock) |
| `/enter` | Claim name+PIN, roster builder grouped by team with live position counters |
| `/doubler` | Weekly 2x pick — only your players whose teams are alive that round |
| `/admin` | Admin-key gated: enter stat lines (points computed automatically), set locks / repeat-doubler, demo tools |

| Endpoint | Notes |
| --- | --- |
| `GET /api/pool` | Teams, player pool, locks, rules |
| `POST /api/entrants` | `{name, pin}` — claim a name (same name+PIN = sign back in) |
| `POST /api/roster` | PIN-checked, fully validated server-side, rejected after roster lock |
| `GET /api/roster?entrantId&pin` | Your own roster + 2x picks (PIN-checked) |
| `GET /api/leaderboard` | Pre-lock: names + submitted flags only. Post-lock: everything |
| `POST /api/doubler` | PIN-checked; roster + team-alive + round-lock + repeat-rule enforced |
| `POST /api/admin/scores` | Admin: `{playerId, round, statLine}` → points computed + stored |
| `POST /api/admin/settings` | Admin: lock times, `allowRepeatDoubler`, teams-by-round |
| `POST /api/admin/seed` | Admin: wipe + reseed demo data |
| `POST /api/admin/seed-scores` | Admin: load sample WC stat lines for demoing |

Admin auth: `x-admin-key` header (or `adminKey` in the body) checked against
`ADMIN_KEY`.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173 — SQLite fallback, no env needed
npm test           # unit tests for the core logic (node --test)
npm run build      # production build (adapter-vercel)
```

Try it: claim a name on `/enter`, build a roster, set a 2x pick on `/doubler`,
then on `/admin` (key: `commish` locally) load the sample scores and set the
roster lock to a past date to watch the leaderboard reveal. Or with the dev
server running: `npm run demo:scores` loads the sample stat lines from the CLI.

## Environment variables

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. Unset → local SQLite file (dev only). |
| `ADMIN_KEY` | Admin key for `/admin` and `/api/admin/*`. Defaults to `commish` — **change it in production**. |

See `.env.example`.

## Deploy

1. Create a GitHub repo and push (Jake approves pushes first — nothing is pushed
   automatically).
2. Import the repo in Vercel, same as the other sites (framework preset:
   SvelteKit; the build uses `@sveltejs/adapter-vercel`).
3. Provision a Postgres database the same way the League site does and set
   `DATABASE_URL` in the Vercel project env vars.
4. Set `ADMIN_KEY` to a real value in Vercel env vars.
5. Tables are created idempotently on first request and the pool/settings seed
   automatically if empty — no migrations to run.

## Remaining before January

- [ ] Replace the demo pool in `src/lib/seed.js` with the **real playoff field**
      once it's set (teams, seeds, player pool), and set `teams_by_round` for
      the actual bracket (admin settings can override without a redeploy).
- [ ] Hook up the **stats feed** (nflverse / Sleeper unofficial stats, re-scored
      with `computePoints`) to replace manual admin stat entry — admin entry
      stays as the correction/fallback path.
- [ ] **Confirm the final scoring system** (full PPR? 4-pt pass TD?) and the
      **repeat-doubler rule** with the group; both are config, not code changes.
- [ ] Set the real lock times (roster lock = first Wild Card kickoff; each
      round's 2x lock = that round's first kickoff) via `/admin`.
- [ ] Set a real `ADMIN_KEY` and confirm the production `DATABASE_URL`.
