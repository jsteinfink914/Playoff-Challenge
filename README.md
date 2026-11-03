# Playoff Challenge

A standalone web app for a friends' NFL playoff fantasy competition. **Not** part of
The League site — separate repo, separate deploy, different group of people.

> **CURRENT STATE (Nov 2026): SHADOW MODE.** The shipped seed is the
> interactive shadow contest — favorites field, rounds mapped to NFL Weeks
> 9–11 — because `src/lib/shadow-data.json` is present. See "Shadow mode"
> below for Jake's playbook. The demo data (Jan 2026 playoff field) remains
> as the fallback when that file is absent.

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
| `/shadow` | Shadow mode — real Sleeper data + scoring pipeline on the current favorites field (see below) |
| `/admin` | Admin-key gated: enter stat lines (points computed automatically), set locks / repeat-doubler, contest tools (reseed) |

| Endpoint | Notes |
| --- | --- |
| `GET /api/pool` | Teams, player pool, locks, rules |
| `POST /api/entrants` | `{name, pin}` — claim a name (same name+PIN = sign back in) |
| `POST /api/roster` | PIN-checked, fully validated server-side, rejected after roster lock |
| `GET /api/roster?entrantId&pin` | Your own roster + 2x picks (PIN-checked) |
| `GET /api/leaderboard` | Pre-lock: names + submitted flags + per-round 2x-picked booleans (never which player). Post-lock: everything; a round's 2x identity is revealed only after that round's lock |
| `POST /api/doubler` | PIN-checked; roster + team-alive + round-lock + repeat-rule enforced |
| `POST /api/admin/scores` | Admin: `{playerId, round, statLine}` → points computed + stored |
| `POST /api/admin/settings` | Admin: lock times, `allowRepeatDoubler`, teams-by-round |
| `POST /api/admin/seed` | Admin: wipe + reseed the active contest (shadow while `shadow-data.json` exists, else demo) |
| `GET /api/cron/scores` | Automatic scoring (Vercel Cron, or admin key): pulls Sleeper stats for each round's mapped NFL week and upserts scores. `?week&round` with the key force-loads one week (backfill) |

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
then on `/admin` (key: `commish` locally) enter a stat line by hand — or post
real weekly scores with `npm run shadow:post` — and set the roster lock to a
past date to watch the leaderboard reveal.

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

## Shadow mode — the interactive test drive (Nov 2026)

For 2–3 weeks before the real contest, Jake plays a **live shadow contest
against himself** in the actual app: he impersonates ~2 entrants through the
real flow — claim name+PIN, build rosters in the normal builder, pick a 2x
each week, watch the real leaderboard move on real NFL games. The point is
proving the whole machinery (seed, locks, scoring feed, leaderboard) before
friends and money are involved.

**How it activates:** seeding loads the *active contest*, resolved by
`src/lib/server/contest.js`. When `src/lib/shadow-data.json` exists (it does —
committed), the seed is the shadow contest; delete that file and seeding falls
back to the demo contest exactly as before.

- **Field/pool:** the current projected playoff field — the 14 "favorites" if
  the season ended today (post-Week 8 picture: BUF DEN PIT JAX KC CIN NE /
  SF MIN NYG CAR CHI DET GB) — generated from Sleeper's players map by
  *current* team + position (never by name — Sleeper name lookups are
  ambiguous), ranked by cumulative season `pts_ppr`, capped per team at
  3 QB / 5 RB / 7 WR / 4 TE (minimum top 2 per position so a team never has a
  hole). 266 players.
- **Rounds are regular-season weeks:** WC = NFL Week 9, DIV = Week 10,
  CONF = Week 11, SB unused. Round ids stay WC/DIV/CONF/SB everywhere; the
  display labels (stored in settings at seed time, served by `/api/pool`) read
  "Week 9 · Shadow", "Week 10 · Shadow", "Week 11 · Shadow",
  "Super Bowl · unused". All 14 teams are eligible every shadow round —
  bye-week players simply score 0.
- **Locks (seeded, UTC):** roster lock **and** WC 2x lock = Thu Nov 5 2026,
  8:00 PM ET (`2026-11-06T01:00:00Z`); DIV = `2026-11-13T01:00:00Z`;
  CONF = `2026-11-20T01:00:00Z`; SB placeholder `2027-02-01T00:00:00Z`.
  Repeat doublers allowed; scoring is the standard full-PPR config (Jake
  explicitly chose NOT to mirror his dynasty league's half-PPR/bonus system).

### Jake's playbook

**(a) Turn it on in production (once).** Set `ADMIN_KEY` in Vercel to your own
value (Project → Settings → Environment Variables) — production activation
depends on it, since the admin reseed is the wipe. Deploy, then open `/admin`,
log in, and hit **Reseed**. That wipes ALL existing entrants (the fake test
accounts), rosters, picks and scores, and loads the shadow pool + locks.

**(b) Enter your teams.** On `/enter`, claim your ~2 entrant names with PINs
and build both rosters **before Thu Nov 5, 8:00 PM ET** (the roster lock).
Set each entrant's Week 9 (WC) 2x pick on `/doubler` before the same lock;
Weeks 10/11 2x picks lock the following Thursdays at 8 PM ET.

**(c) Scores post themselves — automatic scoring via Vercel Cron.** The app
pulls its own scores now; nobody runs a script each week. `vercel.json`
schedules `GET /api/cron/scores` three times a week (times UTC):

| When | Cron (UTC) | Why |
|---|---|---|
| Sun 8:00 PM ET | `0 1 * * 1` (Mon 01:00 UTC) | in-progress pass — Sunday's games load as *partial* stats, so the leaderboard moves live Sunday night |
| Tue 7:00 AM ET | `0 12 * * 2` | final pass — after the Monday-night game, the week's numbers settle |
| Wed 7:00 AM ET | `0 12 * * 3` | stat-correction pass — catches Sleeper's midweek scoring corrections |

The endpoint reads the round→week mapping from `src/lib/server/contest.js`
(shadow: WC = Week 9, DIV = Week 10, CONF = Week 11), checks Sleeper's state,
and for each mapped round whose week has stats it fetches the week's lines,
skips all-zero lines (byes/DNPs), and upserts them through the same store
function the admin scores API uses — points computed server-side with the
contest scoring. Runs are **idempotent**: scores are upserts keyed by
(player, round), so later passes simply overwrite earlier partials; re-running
changes nothing unless Sleeper's numbers changed. It answers JSON —
`{ok, stateWeek, loaded: [{round, week, playersPosted}], skipped: [{round, reason}]}`
— so a run with nothing new to load is a visible no-op, not a silent one.

**Auth:** Vercel Cron invocations carry an `x-vercel-cron` header, which the
endpoint accepts; a manual hit must pass the admin key (`x-admin-key` header,
checked against the `ADMIN_KEY` env var). No new env vars. With the key you
can also force-load any week into any round — backfills and tests:
`GET /api/cron/scores?week=8&round=WC`.

**Manual fallback:** if cron ever misbehaves, the original loader still works
unchanged — it POSTs the same lines to `/api/admin/scores`:

```bash
APP_URL=https://playoff-challenge-brown.vercel.app ADMIN_KEY=<your key> \
  node scripts/post-week-scores.mjs --week 9 --round WC
# after Week 10:  --week 10 --round DIV
# after Week 11:  --week 11 --round CONF
```

(`--dry-run` previews without posting; `ADMIN_KEY` comes from the environment
only — never hardcode it.)

**(d) January swap.** When the real playoff field is set: regenerate/replace
`src/lib/shadow-data.json`'s field with the actual 14 playoff teams (or delete
the file and put the real field in `src/lib/seed.js`), set the rounds back to
the real WC/DIV/CONF/SB playoff weeks with real kickoff locks, reseed — and
edit the `roundWeeks` mapping in `src/lib/server/contest.js` to the
postseason weeks (`seasonType: 'post'`), so automatic scoring feeds the real
contest the same way.

### The read-only pipeline view (`/shadow`)

`/shadow` still renders `src/lib/shadow-data.json` directly (no DB): the pool
browser, the latest week's top scorers, and three auto-built sample rosters
(Chalk — greedy on season points; Second Helping — every team's top player
per position off the board; QB-or-Bust — best QBs first, then filled by
single-week ceiling), each proven legal with `validateRoster` and totaled by
`computeLeaderboard` itself. Refresh it with:

```bash
node scripts/refresh-shadow.mjs   # or: npm run shadow:refresh
```

The script fetches only completed weeks it hasn't seen (raw trimmed stats are
cached in `scripts/.cache/`, gitignored; delete it to force a full refetch),
rebuilds `src/lib/shadow-data.json`, prints a scoring-parity check vs
Sleeper's `pts_ppr`, and exits non-zero on any fetch or validation failure.
Commit the updated JSON, push (with Jake's approval), and Vercel redeploys.

**Scoring parity notes:** Sleeper charges pass INT at −1 (we charge −2) —
that explains QB deltas. `fum_lost` is taken **only** from Sleeper's
`fum_lost` field: a fumble that isn't lost costs 0 (the earlier fallback to
Sleeper's `fum` count wrongly charged Jaylen Warren −2 in Week 8 2026 for a
fumble he recovered; fixed — his Week 8 parity delta is now exactly 0).
A few fringe players show small residual deltas from Sleeper-only extras
outside the contest's 10-field stat line (e.g. special-teams TDs / fumble
recoveries Sleeper folds into `pts_ppr`); the contest scoring doesn't count
those, by design.

## Remaining before January

- [ ] Replace the shadow favorites field with the **real playoff field** once
      it's set (regenerate `src/lib/shadow-data.json` for the actual 14 teams,
      or delete it and put the real field in `src/lib/seed.js`), restore the
      real WC/DIV/CONF/SB rounds + kickoff locks, and reseed.
- [ ] **Automatic scoring** is built (`/api/cron/scores` + Vercel Cron,
      proven in shadow mode); for January, edit the `roundWeeks` mapping in
      `src/lib/server/contest.js` to the postseason weeks — admin entry and
      `scripts/post-week-scores.mjs` stay as the correction/fallback path.
- [ ] **Confirm the final scoring system** (full PPR? 4-pt pass TD?) and the
      **repeat-doubler rule** with the group; both are config, not code changes.
- [ ] Set the real lock times (roster lock = first Wild Card kickoff; each
      round's 2x lock = that round's first kickoff) via `/admin`.
- [ ] Set a real `ADMIN_KEY` and confirm the production `DATABASE_URL`.
