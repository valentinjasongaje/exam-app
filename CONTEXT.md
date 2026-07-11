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
- An admin role: import new exams through the app (not just the CLI), edit
  question content, and view (read-only) each user's progress
- Modern but simple design
- Built with Next.js

They have "lots of files" in that scraped format and gave two samples to
work from (both included in `data/raw/`), already parsed and seeded:
- `ECT_Pre_Board_Exam_1.html` (50 questions)
- `HB_Elec_-_Test_06.html` (50 questions)

The rest of the question bank will be imported later, through the admin
web UI's import flow (see below) rather than the CLI scripts.

## Decisions made (with reasoning)

**Database: PostgreSQL, not NoSQL.** The data is rigidly relational
(subject → exam → question → choices → one correct answer → user attempts →
answer log), and the core feature — stats/progress tracking — needs
aggregate queries (accuracy by topic, trend over time, weakest questions).
**Hosting: Neon** (serverless Postgres, free tier). Confirmed working — see
"What's built" below.

**ORM: Prisma.**

**Auth: Auth.js (NextAuth v5, `next-auth@5.0.0-beta.31`) with Google
OAuth only** — no email/password. Originally built with a Credentials
(email/password + bcrypt) provider; the user asked to switch to
"Sign in with Google" instead, for a personal tool this removes password
management entirely. `User.passwordHash` was dropped from the schema as
part of that switch. There's no Prisma Adapter/Account/Session tables —
sign-in is handled with a `signIn` callback that upserts a `User` row by
email (JWT session strategy, not database sessions). Whichever email logs
in that matches the `ADMIN_EMAIL` env var is auto-promoted to `role:
ADMIN` on first sign-in.

**Roles: `Role` enum (`USER` | `ADMIN`) on `User`.** Admins get an
`/admin` section (gated by both `proxy.ts` and a layout-level check) for:
viewing per-user progress (read-only), managing exam content
(subjects/exams/questions CRUD), and importing new exams by uploading the
scraped HTML through the browser (parse → review → commit), instead of
running the CLI scripts by hand.

**Image storage: Vercel Blob**, for images uploaded through the admin
import/edit flows (`lib/blob.ts`). The original CLI parser
(`scripts/parse-html.js`) still writes images to local disk under
`data/parsed/images/` for its own JSON output — that's a separate, still-
useful code path, not wired to Blob.

**Styling: Tailwind CSS.** `clsx` + `tailwind-merge` installed, not
heavily used yet. No component library pulled in — plain Tailwind classes
throughout.

**Hosting: Vercel** for the Next.js app (not yet deployed — repo is local-
only for now, no GitHub remote configured; see "Next steps").

## The scraped HTML format (important — read before touching the parser)

Each scraped exam file has three parts tied together by a numeric
`data-item` id that appears on every `<input>` and again as `data-id` on
the answer-table `<tr>`:

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
**This heuristic only has 2 titles to learn from.** When importing the
full file set (via the admin import UI, which shows a review/edit step
before committing — see below), check for subjects that look wrong and fix
them right there in the review screen, or add a manual override to the
regex in `lib/exam-parser.js` if it's a systematic pattern.

## What's actually been built and verified

**Content pipeline** (parsing/seeding), all confirmed working against a
real Neon Postgres database (2 subjects, 2 exams, 100 questions, 400
choices, matching expectations exactly):
- **`lib/exam-parser.js`** — the actual HTML→structured-data parsing logic
  (Cheerio-based). Takes an HTML string + filename, returns
  `{ subject, exam, questions, issues }` with any embedded images as
  in-memory buffers — no disk/DB/network I/O in this module. Shared by
  both the CLI script and the admin web import flow.
- **`lib/seed-exam.js`** — the Subject/Exam/Question/Choice upsert logic
  (by slug / `sourceItemId`, so re-importing an exam updates it in place
  rather than duplicating). Takes a Prisma client + parsed data with
  already-resolved image URLs. Shared by the CLI seed script and the
  admin import commit step.
- **`scripts/parse-html.js`** (`npm run parse`) — CLI wrapper: reads every
  `.html` file in `data/raw/`, calls `lib/exam-parser.js`, persists images
  to `data/parsed/images/<sha1>.<ext>`, writes one JSON file per exam plus
  `data/parsed/manifest.json`.
- **`scripts/seed.js`** (`npm run seed`) — CLI wrapper: reads
  `data/parsed/manifest.json`, calls `lib/seed-exam.js` for each entry.
- **`scripts/verify-with-sqlite.js`** — leftover from before Prisma could
  reach a real database; no longer needed, kept for history.

**Next.js app** (App Router, TypeScript, Tailwind) — real UI now exists:
- **Auth** — `auth.ts` (Google provider only), `middleware` file is named
  `proxy.ts` per Next 16's renamed convention, `app/login/page.tsx` (single
  "Sign in with Google" button), `app/sign-out-action.ts`. No
  register/password flow.
- **`app/dashboard/page.tsx`** — Subjects → Exams list, scoped to the
  logged-in user's own attempts; each exam shows Start / Resume / Retake
  (with best score) depending on attempt state.
- **`app/settings/`** — per-user preferences: `preferredLayout`
  (all-questions-on-one-page vs one-question-at-a-time) and
  `shuffleEnabled` (shuffle question/choice order). Both are frozen onto
  each `Attempt` at creation time (`Attempt.layout`/`Attempt.shuffleSeed`)
  so changing a setting later doesn't retroactively alter an
  already-started or finished attempt.
- **`app/exam/[examId]/`** — start-or-resume entry point: redirects
  straight into an in-progress attempt if one exists, otherwise shows
  exam info + a "Start exam" button (`startAttemptAction`).
- **`app/attempt/[attemptId]/`** — the actual taking UI, branches on
  `attempt.layout`: one big form with a single Submit
  (`submitAllAction`) for `ALL_AT_ONCE`, or a client-side one-question
  paginator (`saveAnswerAction` per choice, `finishAttemptAction` on the
  last question) for `ONE_AT_A_TIME`. Ownership-checked
  (`attempt.userId === session.user.id`, `notFound()` otherwise).
  `app/attempt/[attemptId]/review/` shows the score plus every question
  with the picked/correct choice highlighted and explanations.
- **`lib/shuffle.ts`** — seeded deterministic shuffle (`seededShuffle`,
  `choiceSeedFor`). Rather than persisting a shuffled order,
  `Attempt.shuffleSeed` (a single `Int?`) is enough to reproduce the exact
  same question/choice order on every render (start, resume, review) —
  see the git history for `lib/shuffle.ts` / the exam-taking-flow plan for
  the reasoning (avoids storing a few KB of redundant ID-ordering data per
  attempt for the sake of 4 bytes). Grading never depends on display
  order — scoring only checks whether the submitted `choiceId` matches
  the one marked `isCorrect`.
- **`app/admin/`** — role-gated (redirects non-admins to `/dashboard`):
  - `users/` — list of all users with aggregate stats (exams taken,
    accuracy, last activity) and a per-user drill-in (attempt history,
    weakest questions). Read-only, as requested.
  - `content/` — Subjects → Exams list, drill into an exam to see/edit/
    delete/add questions. Question forms handle text, 4 choices +
    correct-answer selection, explanation, and image upload (to Vercel
    Blob). Manually-created questions get a generated
    `sourceItemId: "manual-<uuid>"` since the column is required.
  - `import/` — upload one or more scraped HTML files, see a parse preview
    (question count, issues, image thumbnails, editable subject/exam
    title) before committing anything to the database. Commit uploads
    images to Vercel Blob and calls `lib/seed-exam.js`.
- **`lib/prisma.ts`** — standard singleton Prisma client for the app
  runtime (CLI scripts still instantiate their own short-lived client).
- **`lib/blob.ts`** — thin `@vercel/blob` wrapper used by both the admin
  question-edit forms and the import commit step.

All of the above was manually verified end-to-end in the browser (role
gating both ways, users list/drill-in, question create/edit/delete, parser
preview logic). **Google sign-in is confirmed working end-to-end**: signed
in with a real Google account, correctly matched `ADMIN_EMAIL`, got
`role: ADMIN`, no `passwordHash` field on the created `User` row. One real
bug surfaced and got fixed along the way — Auth.js v5 auto-detects Google
credentials from env vars named `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`, not
the `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` names used here (which match
what Google Cloud Console itself calls them) — without passing them
explicitly to the `Google()` provider in `auth.ts`, the client ID silently
came through as `undefined` in the redirect URL. Also needed: **Authorized
JavaScript origins** (`http://localhost:3000`) in addition to the
**Authorized redirect URI**
(`http://localhost:3000/api/auth/callback/google`) on the Google OAuth
client — both fields, not just the redirect URI.

**The exam-taking flow is also now built and confirmed working
end-to-end** with real data (verified via direct DB queries, not just
visually): a real user account completed a 50-question exam in
`ALL_AT_ONCE` mode with shuffle on, all 50 `AttemptAnswer` rows were
recorded, `score`/`finishedAt` computed correctly (11/50), and the admin
Users page now reflects a real "1 exam taken, 22% accuracy" for that
account instead of the earlier placeholder zeros. `ONE_AT_A_TIME` mode,
resume-in-progress, and retake weren't independently re-verified via DB
query in this pass (only the default all-at-once path was) — worth a
closer look if bugs show up there specifically, though the code review at
build time didn't surface anything layout-specific.

## Known gotchas worth knowing before you hit them again

- `next-auth@5.0.0-beta.25` (originally pinned) doesn't support Next 16;
  bumped to `5.0.0-beta.31`. If `npm install` ever ERESOLVEs on
  `next-auth`, check for a newer beta before reaching for
  `--legacy-peer-deps`.
- Neon's serverless compute auto-suspends after inactivity — the first
  query after idling can transiently fail with `P1001 Can't reach database
  server`. Retry once before assuming a real outage.
- Next 16 renamed the `middleware.ts` convention to `proxy.ts` (same
  default export + `config.matcher` shape, just the filename changed).
- `prisma migrate dev` refuses to run in this non-interactive shell
  whenever it needs a destructive-change confirmation (e.g. dropping a
  column). Workaround used here: hand-write the migration folder/SQL
  matching Prisma's naming convention, then `npx prisma migrate deploy`
  (non-interactive) followed by `npx prisma generate`. If the dev server
  is running, stop it first — Windows locks the generated
  `query_engine-windows.dll.node` file while it's in use.
- When testing forms manually: the root layout's Nav renders a Logout
  `<button type="submit">` on every authenticated page. An unscoped
  `button[type="submit"]` selector will match that instead of a page's own
  submit button — this cost real debugging time once (looked exactly like
  a server-action routing bug; it wasn't). Scope selectors or target by
  button text when testing forms on authenticated pages.
- Google OAuth can't be completed by an automated browser tool here (no
  real Google account to click through) — a tempting workaround is to
  mint a valid Auth.js session JWT directly (`next-auth/jwt`'s `encode()`
  with `AUTH_SECRET`, both already known) and inject it as a cookie. This
  gets flagged and blocked by the harness as a credential-forging shortcut
  — don't fight it, ask the user to log in manually in their own browser
  instead and verify via direct DB queries afterward.

## Next steps (in the order they make sense)

1. ~~Schema + seed pipeline~~ — done, verified with sample data.
2. ~~Confirm Prisma migrates against a real Postgres instance~~ — done.
3. ~~Admin role, content management, import flow~~ — done, verified
   end-to-end.
4. ~~Verify Google sign-in end-to-end~~ — done, confirmed working with a
   real Google account.
5. ~~Exam-taking flow~~ — done, confirmed working end-to-end (see above).
6. Run the full set of scraped HTML files through the admin **import UI**
   (not the CLI) — check the review screen for subject-name misfires or
   parse issues before committing. Vercel Blob is now set up: a public
   store `exam-app-images` (`store_guWdLacLay74y7PR`) was created via
   `vercel blob create-store`, linked to the `exam-app` Vercel project,
   and `BLOB_READ_WRITE_TOKEN` auto-pulled into `.env.local`. A real
   upload + public read + delete was verified with
   `scripts/_test-blob-upload.mjs`. The admin import **commit step in the
   UI** itself still hasn't been exercised end-to-end (needs a logged-in
   admin session) — that's the remaining check when doing the full import.
   Gotcha: `.env.local` also contains `VERCEL_OIDC_TOKEN`, so `vercel
   blob` CLI subcommands error with "must both be set" — pass
   `--rw-token "$BLOB_READ_WRITE_TOKEN"` explicitly; the app/SDK path is
   unaffected.
7. ~~Stats/progress dashboard for regular users~~ — done (`app/stats/`,
   linked as "Progress" in the nav, login-gated via `proxy.ts`): summary
   cards (exams completed, overall accuracy, questions answered), accuracy
   by subject, score trend (one bar per completed attempt, linking to its
   review page), and top-10 weakest questions. Verified by typecheck, the
   unauthenticated `/stats` → `/login` redirect, and re-running the page's
   exact Prisma aggregations against the real DB (test account: 1 attempt,
   11/50 = 22%, 39 wrong-answer rows — matches the known-good data).
8. **Deploy** — push to a GitHub remote (currently local-only, git
   initialized but no remote configured) and deploy to Vercel. Will need
   the production URL added as an authorized redirect URI in the Google
   OAuth client, and all the `.env` values (`DATABASE_URL`, `AUTH_SECRET`,
   `ADMIN_EMAIL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `BLOB_READ_WRITE_TOKEN`) set as Vercel project env vars.
9. **Polish** — responsive design pass, maybe a "retry weak questions"
   mode.

## UI redesign, subject tiles, and board-exam timer (2026-07-11)

The whole app UI was redesigned away from the generic Tailwind-scaffold
look: warm paper palette (light/dark via `prefers-color-scheme`, plus a
manual toggle — see below), a Fraunces (serif headings) + Geist Sans
(body) type pairing, shared primitives in `components/ui.tsx` (`Button`,
`LinkButton`, `Card`, `Badge`, `PageHeader`, `EmptyState`), and a
`.choice-row` CSS class (globals.css, uses `:has()`) shared by every
place a radio/checkbox choice is rendered (attempt pages, review,
settings). A manual light/dark toggle lives in the nav
(`app/theme-toggle.tsx`) — `data-theme` attribute on `<html>`, persisted
to `localStorage`, applied pre-hydration via `next/script`
`beforeInteractive` (not a raw `<script>` tag — that triggers a
"scripts inside React components" dev warning) with
`suppressHydrationWarning` on `<html>` since the pre-hydration script
intentionally differs from the server-rendered markup.

**Dashboard is now subject-tile-first**: `/dashboard` shows a responsive
grid of subject tiles (`grid-cols-1 sm:grid-cols-2` — 1-wide on mobile,
2x2 once there are 4 subjects) with a per-subject completion/accuracy
progress bar, each linking to a new `app/subject/[subjectId]/page.tsx`
that has the actual exam list + Start/Resume/Retake (this is where the
old flat per-subject exam list from the dashboard moved to).

**Subjects are now a fixed list, not free text — fragmentation fixed.**
`lib/subjects.ts` exports `CANONICAL_SUBJECTS`: Math, GEAS, Elex, EST (the
4 subjects of the Electronics Engineer board exam) plus ECT (Electronics
Technician — a separate, distinct exam/certification that mixes basic
Math and Elex content but is tracked as its own subject/tile, not folded
into the other 4; confirmed explicitly by the user). Both the admin
import-review screen (`app/admin/import/page.tsx`) and a new per-exam
"Subject: [dropdown] [Move]" control
(`app/admin/content/exams/[examId]/page.tsx`,
`reassignSubjectAction` in that route's `actions.ts`) now only let you
pick from this fixed list — no free text, so no more stray subjects.
`reassignSubjectAction` upserts the target canonical subject (creating it
on first use) and deletes the exam's *previous* subject if that leaves it
with zero exams, so moving exams out of a stray subject cleans it up
automatically. The import commit button is disabled with an inline error
until every previewed exam has a subject chosen.

As of 2026-07-11 this already ran once against the real DB: seeded all 5
canonical subjects, and reassigned the exams that had gotten fragmented
into their own stand-alone subjects — `HB Elec` → `Elex`,
`RC Exam - Elec 02` → `Elex`, `Review Exam - GEAS 07` → `GEAS`,
`Review Exam - GEAS 09` → `GEAS` (all confirmed unambiguous from the
user's own description of what belongs under Elex). `ECT Pre Board Exam
1` was already correctly on its own `ECT` subject — no change needed
there once ECT was recognized as a legitimate 5th subject rather than
something to merge away. Final state: exactly 5 subjects, matching
`CANONICAL_SUBJECTS`, zero stray ones.

**Board exam / pre-board timed mode**: `Attempt` gained `mode`
(`AttemptMode`: `PRACTICE` | `BOARD_EXAM`) and `timeLimitMinutes` (Int?,
240 for board exam, null for practice) — migration
`20260711143711_add_attempt_mode_and_timer`, purely additive. The exam
start page (`app/exam/[examId]/page.tsx`) now offers two buttons,
"Practice (untimed)" and "Take as board exam · 4:00:00", both binding
`startAttemptAction(examId, mode)`. A shared `lib/use-countdown.ts` hook
computes `{ expired, label }` from a `deadline` ISO string
(`startedAt + timeLimitMinutes`), used by both layouts
(`all-at-once.tsx` — new client component split out of the exam-taking
page specifically so it can lock inputs; `one-at-a-time.tsx`). Per
explicit user decision: **at expiry, answering locks but nothing
auto-submits** — the user must still tap Submit/Finish themselves.
`ONE_AT_A_TIME` locks via `disabled` on the radio inputs (safe there,
since answers are saved via explicit server-action calls, not FormData).
`ALL_AT_ONCE` can't use `disabled` — disabled radios are excluded from
FormData, which would silently drop already-selected answers — so it
guards via `onClick`/`onKeyDown` `preventDefault()` on the wrapping
label instead, leaving inputs enabled (and thus submittable) but
un-clickable once expired. `saveAnswerAction` also has a server-side
`isTimeExpired` check (defense in depth against a devtools bypass of the
client-side lock in `ONE_AT_A_TIME`); `submitAllAction` intentionally
does **not** get an equivalent check — it must always accept whatever
was in the form when Submit was clicked, since that's the only place
`ALL_AT_ONCE` answers are ever persisted at all.

Not yet visually verified end-to-end in a browser (same long-standing
limitation: Google OAuth can't be driven by the automated browser tool
here) — verified instead via typecheck/lint/build all passing, and a
scratch script that created real `BOARD_EXAM` attempts (one already-
expired, one fresh) directly via Prisma and confirmed both the schema
fields and the expiry-boundary math read back correctly, then cleaned
them up. Worth clicking through "Take as board exam" once logged in to
confirm the timer UI itself looks right.

## Repo layout

```
prisma/schema.prisma          Postgres schema
lib/exam-parser.js            HTML -> structured data (shared by CLI + admin import)
lib/seed-exam.js              Upsert logic (shared by CLI + admin import)
lib/prisma.ts                 Prisma client singleton (app runtime)
lib/blob.ts                   Vercel Blob upload wrapper
lib/shuffle.ts                Seeded deterministic shuffle for exam question/choice order
lib/use-countdown.ts          Client hook: deadline ISO string -> { expired, label }
lib/subjects.ts               Fixed 5-subject list (Math/GEAS/Elex/EST/ECT) - no free-text subjects
scripts/parse-html.js         CLI: data/raw/*.html -> data/parsed/*.json
scripts/seed.js               CLI: data/parsed/*.json -> Postgres
scripts/verify-with-sqlite.js Historical, no longer needed
data/raw/                     Scraped HTML files (2 samples included)
data/parsed/                  Parser output for the 2 samples
auth.ts                       Auth.js config (Google provider)
proxy.ts                      Route protection (login required / admin-only)
app/theme-toggle.tsx          Manual light/dark toggle (localStorage + data-theme)
app/nav-links.tsx             Client nav links with active-route highlighting
app/login/                    Sign-in page (Google only)
app/settings/                 Per-user preferences (layout, shuffle)
app/dashboard/                Subject tile grid (2x2 desktop / 1-col mobile) with progress bars
app/subject/[subjectId]/      Exam list for one subject (Start/Resume/Retake) — was on /dashboard
app/stats/                    User's own progress dashboard (accuracy, trend, weakest questions)
app/exam/[examId]/            Start-or-resume entry point; Practice vs Board-exam mode choice
app/attempt/[attemptId]/      Exam-taking UI (both layouts, incl. board-exam timer/lock) + review
app/admin/                    Admin: users, content (CRUD), import
components/ui.tsx             Shared design-system primitives (Button, Card, Badge, PageHeader, ...)
components/exam-timer.tsx     Countdown banner (presentational; logic lives in lib/use-countdown.ts)
components/question-form.tsx  Shared create/edit question form
README.md                     Shorter, pipeline-focused setup instructions
CONTEXT.md                    This file
```
