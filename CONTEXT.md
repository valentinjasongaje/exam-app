# Project context — read this first

This file exists so a fresh Claude Code session (or you) can pick this project
up without re-explaining anything. It captures the original ask, the
decisions made so far and why, what's actually been built and verified, and
what's left to do.

## The original ask

The person reviewed for a professional licensure exam in 2022 using a paid
online reviewer (my.excelreviewer.com — "Excel Review Center"). They wrote
their own scraper to pull the reviewer's quizzes/exams into static HTML
files (question + choices + answer key + solutions), so they'd have a
personal copy of the questionnaires. They now want to turn that pile of
scraped HTML files into a real web app:

- Login
- Take exams
- See stats / track progress over time
- Modern but simple design
- Built with Next.js
- Undecided on SQL vs NoSQL — asked for a recommendation

They have "lots of files" in that scraped format and gave two samples to
work from (both included in `data/raw/`):
- `ECT_Pre_Board_Exam_1.html` (50 questions)
- `HB_Elec_-_Test_06.html` (50 questions)

## Decisions made (with reasoning)

**Database: PostgreSQL, not NoSQL.** The data is rigidly relational
(subject → exam → question → choices → one correct answer → user attempts →
answer log), and the core feature — stats/progress tracking — needs
aggregate queries (accuracy by topic, trend over time, weakest questions).
That's what SQL is for; a document store would just mean reinventing joins.
Recommended hosting: **Neon** or **Supabase** (serverless Postgres, free
tier, plays well with Vercel).

**ORM: Prisma.** Chosen over Drizzle for better DX for a solo dev; either
would have worked.

**Auth: Auth.js (NextAuth v5)**, already added as a dependency
(`next-auth@5.0.0-beta.25`) plus `bcryptjs` for password hashing. Not yet
wired up.

**Styling: Tailwind CSS.** Already scaffolded via `create-next-app`.
`clsx` + `tailwind-merge` are installed for conditional class handling.
shadcn/ui components can be added as needed — not pulled in yet.

**Hosting: Vercel** for the Next.js app.

## The scraped HTML format (important — read before touching the parser)

Each exam file has three parts tied together by a numeric `data-item` id
that appears on every `<input>` and again as `data-id` on the answer-table
`<tr>`:

1. **Question cards** inside a custom `<questions>` tag — question text,
   4 choices as radio inputs (`value` attribute = choice text), sometimes
   an embedded base64 `<img>` in the question stem.
2. **Answer key table** (`<table id="answer">`) — one row per question,
   third `<td>` holds the correct answer as plain text (needs to be
   matched against the 4 choices, whitespace-normalized).
3. **Solution blocks** (`<div id="solution{itemId}">` inside the answer
   table rows) — often just empty `<br><br>`, sometimes real explanation
   text and/or a base64 image.

The exam title (`<h1>`) follows a `"{Subject} {Exam label}"` pattern, e.g.
"ECT Pre Board Exam 1" or "HB Elec - Test 06" — subject is derived by
stripping known trailing patterns (`- Test NN`, `Pre Board Exam N`, etc.).
**This heuristic only has 2 titles to learn from.** Once the full file set
is parsed, check `data/parsed/manifest.json` for subjects that look wrong
and either fix the regex in `scripts/parse-html.js` or add a manual
override — don't assume it's 100% right at scale.

## What's actually been built and verified

- **`prisma/schema.prisma`** — full schema: `Subject → Exam → Question →
  Choice`, plus `User → Attempt → AttemptAnswer` for tracking. Targets
  `postgresql` via `DATABASE_URL` env var. Not yet migrated against a real
  database (see caveat below).
- **`scripts/parse-html.js`** — Cheerio parser. Run with `npm run parse`.
  Reads every `.html` file in `data/raw/`, writes one JSON file per exam to
  `data/parsed/`, re-hosts embedded base64 images to
  `data/parsed/images/<sha1>.<ext>`, and writes `data/parsed/manifest.json`
  listing every parsed exam plus any issues (unmatched answers, missing
  ids, etc).
  - **Verified against both sample files: 100/100 questions parsed, 0
    unmatched answers**, including correctly extracting an embedded
    circuit-diagram image from a question.
- **`scripts/seed.js`** — reads `data/parsed/manifest.json` and upserts
  everything into Postgres via Prisma (`npm run seed`). Idempotent —
  matches on slugs / `sourceItemId`, safe to re-run.
- **`scripts/verify-with-sqlite.js`** — verification-only script, not part
  of the app. See caveat below for why it exists.
- **`data/parsed/`** — already contains the two sample exams fully parsed
  and their extracted images, so you can inspect real output immediately
  without re-running anything.
- **Next.js app scaffold** — created via `create-next-app` (App Router,
  TypeScript, Tailwind, ESLint). `app/page.tsx` and `app/layout.tsx` are
  still the default template — **no actual app UI has been built yet.**
  Dependencies for the next phase (`next-auth`, `bcryptjs`, `clsx`,
  `tailwind-merge`, `lucide-react`) are installed but unused so far.

## Resolved: Prisma engine download was blocked only in the original sandbox

Prisma's CLI needs to download a query-engine binary from
`binaries.prisma.sh` the first time you run `prisma generate` or
`prisma migrate`. The sandboxed environment this project was originally
built in only allowed a fixed list of domains (npm, GitHub, PyPI, etc.) and
`binaries.prisma.sh` wasn't on it, so `npx prisma migrate dev` failed there
with a 403. `scripts/verify-with-sqlite.js` was written at the time to
prove the schema/seed logic without that binary (recreates the tables with
Node's built-in `node:sqlite`) — it's no longer needed but left in place.

**Confirmed 2026-07-04, on this machine, against a real Neon Postgres
project:** `npx prisma migrate dev --name init` ran cleanly, generated the
client, and `npm run seed` loaded both sample exams —
`prisma.subject/exam/question/choice.count()` reports 2 subjects, 2 exams,
100 questions, 400 choices, matching the parser's earlier verification
exactly. `DATABASE_URL` lives in `.env` (gitignored, not in this repo).

Two things worth knowing for next time:
- `next-auth@5.0.0-beta.25` (the version originally pinned in
  `package.json`) doesn't support Next 16, which is what `create-next-app`
  had scaffolded — peer dependency resolution failed on `npm install`.
  Bumped to `5.0.0-beta.31`, which added a `^16.0.0` peer range. If
  `npm install` ever fails with an ERESOLVE on `next-auth`, check whether
  a newer beta supports whatever Next version is in use before reaching
  for `--legacy-peer-deps`.
- Neon's serverless compute auto-suspends after inactivity. The very first
  query after a period of idleness can fail with `Can't reach database
  server` (P1001) — it's just Neon waking up, not a real outage. Retrying
  once resolves it.

## Next steps (in the order they were proposed)

1. ~~Schema + seed pipeline~~ — done, verified with sample data.
2. ~~Confirm Prisma actually migrates/generates against a real Postgres
   instance~~ — done, see above.
3. Run the full set of scraped HTML files through `npm run parse`, check
   `data/parsed/manifest.json` for issues, then `npm run seed`.
4. **Core app shell** — Auth.js wired up (email/password is enough for a
   personal tool), Tailwind/shadcn-based layout, dashboard skeleton.
5. **Exam-taking flow** — pick exam → answer questions → submit → see
   score/review with explanations.
6. **Stats/progress dashboard** — accuracy by topic, trend over time,
   weakest questions, streaks. This is why Postgres was chosen over NoSQL —
   lean on `GROUP BY`/joins here.
7. **Polish** — responsive design pass, maybe a "retry weak questions"
   mode.

## Repo layout

```
prisma/schema.prisma          Postgres schema
scripts/parse-html.js         HTML -> JSON parser
scripts/seed.js               JSON -> Postgres loader (Prisma)
scripts/verify-with-sqlite.js Verification-only, see caveat above
data/raw/                     Scraped HTML files (2 samples included)
data/parsed/                  Parser output — already run once, inspect freely
app/                          Next.js App Router — still default scaffold
README.md                     Shorter, pipeline-focused setup instructions
CONTEXT.md                    This file
```
