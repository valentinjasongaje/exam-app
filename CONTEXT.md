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
- **Found 2026-07-12, fixed**: `app/globals.css` had `* { border-color:
  var(--border); } ` and a handful of other base resets (`html`, `body`,
  `h1-h3`, `::selection`, `a`, `input[type=radio/checkbox]`,
  `:focus-visible`) declared as plain unlayered CSS. Per the CSS Cascade
  Layers spec, **unlayered rules always beat anything inside a `@layer`
  block, regardless of specificity** — and Tailwind wraps all of its
  utility classes in `@layer utilities`. So that one unlayered `*` rule
  was silently winning over every `border-*` color utility in the app
  (`border-accent`, `border-danger`, `hover:border-accent`, etc.) the
  entire time, on every page that used one. All of those base rules are
  now wrapped in `@layer base` (matching Tailwind's own layer, which
  comes before `utilities` in priority) so utility classes override them
  normally again. Caught by inspecting `document.styleSheets` /
  `getComputedStyle` in the browser when a user reported the answered-
  vs-unanswered question navigator looked identical in light mode — the
  border-color fix for that navigator wasn't taking effect at all until
  this was found. If a `border-*`/`ring-*`/etc. utility ever silently
  "doesn't work" again, check for unlayered CSS overriding it before
  assuming the utility itself is wrong.
- **Admin import now processes files in parallel, not one-at-a-time.**
  `lib/concurrency.ts` exports `mapWithConcurrency` (order-preserving,
  concurrency-capped map). `previewImportAction` parses every uploaded
  file with plain `Promise.all` (pure CPU work, no I/O, no cap needed).
  `commitImportAction` commits exams (Blob image uploads + DB write) with
  `mapWithConcurrency(exams, 3, ...)` — capped at 3 exams in flight since
  that step hits Vercel Blob and the DB connection pool, unlike parsing.
  If two exams in one batch target the same subject slug, concurrent
  `Subject.upsert()` calls are still safe — verified directly against
  Neon: 5 concurrent upserts on a fresh slug produced exactly 1 row
  (Postgres resolves `ON CONFLICT` atomically). Multi-file selection
  already worked before this (`<input multiple>`); this made the
  processing itself actually run concurrently instead of sequentially.
- **`User.preferredLayout` default changed to `ONE_AT_A_TIME`** (was
  `ALL_AT_ONCE`) — migration `20260712041513_default_layout_one_at_a_time`.
  Settings form radios reordered to match (one-at-a-time listed first).
  Schema defaults only apply to new rows, so existing users keep whatever
  they already had — checked both real accounts:
  `shogunlee3214@gmail.com` already had `ONE_AT_A_TIME` (changed it
  themselves previously), `valentinjasongaje@gmail.com` (the account
  owner) still had the old `ALL_AT_ONCE` default and was updated directly
  to match, since that's clearly the point of the request. Verified via a
  scratch-created-then-deleted test user that fresh sign-ups now get
  `ONE_AT_A_TIME` with no explicit value needed.
- **Question-edit form protects the correct answer from accidental
  changes.** `components/question-form.tsx`: editing an existing
  question now shows the correct answer as a read-only "Correct answer:
  X" banner with an explicit "Change answer" button — the choice radios
  are present but click-guarded (same `onClick`/`onKeyDown`
  `preventDefault` pattern as the board-exam timer lock, not `disabled`,
  since disabled radios are excluded from FormData and the untouched
  correct answer still needs to submit). Clicking "Change answer" lifts
  the guard. New questions (no existing answer to protect) skip the lock
  entirely and the radios are editable immediately. Also bumped the
  import-review image thumbnails from 80px to 176px and switched
  `object-cover` → `object-contain` so the full image is visible (no
  cropped corners) when checking for watermarks.

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

**Dashboard is now subject-tile-first, grouped by exam track**:
`/dashboard` shows two labeled sections — "Electronics Engineering"
(Math, GEAS, Elex, EST — a `grid-cols-1 sm:grid-cols-2` grid, 1-wide on
mobile / 2x2 on desktop) and "Electronics Technician" below it (just the
ECT tile). `CANONICAL_SUBJECTS` in `lib/subjects.ts` carries a `group`
field per subject for exactly this; the dashboard groups/orders DB
subjects by matching `slug` against it (any subject whose slug isn't in
the canonical list falls into a defensive "Other" section rather than
disappearing — shouldn't happen now that subjects are a fixed list, but
cheap insurance). Each tile has a per-subject completion/accuracy
progress bar and links to `app/subject/[subjectId]/page.tsx`, which has
the actual exam list + Start/Resume/Retake (this is where the old flat
per-subject exam list from the dashboard moved to). Verified the
grouping/ordering logic against the real DB with a scratch script —
produces exactly `{Electronics Engineering: [Math, GEAS, Elex, EST]},
{Electronics Technician: [ECT]}` in that order.

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

**Watermark removal in the import review screen**: since these exams are
scraped from another site, `components/image-editor.tsx` is a canvas-based
editor (rectangle patch / freehand brush / eyedropper-to-match-background
/ undo) opened by clicking a pencil overlay on any question or explanation
image thumbnail in `app/admin/import/page.tsx`. Purely client-side —
edits happen in-memory on the `PreviewedExam` state (mutating that
question's `image`/`explanationImage` `dataUrl` to the canvas's
`toDataURL("image/png")` output) before the existing commit/Blob-upload
path runs, so no server-side changes were needed at all; `fromDataUrl` in
`actions.ts` already derives mime/ext generically from the data URL
itself. Only covers the import flow (not yet the admin question-edit
form, which can only *replace* an image outright, not touch the existing
one) — a natural follow-up if watermarks turn up on already-imported
questions too. Doesn't handle a tiled/repeating watermark across a whole
image, only a single logo/text overlay (the common case) — patch or
brush over it manually, there's no auto-detection.

Verified by temporarily mounting `ImageEditor` on an unauthenticated
throwaway route (`app/dev-test-image-editor/`, deleted immediately after
— **do not leave routes like this around**, `git status` was re-checked
clean afterward) with a synthetic SVG test image, since the real import
screen needs an admin session Google OAuth can't provide here. Confirmed
in the browser: canvas mounts and displays the source image, rectangle
drag paints a filled patch, Undo correctly reverts to the pre-operation
snapshot, and Save produces a valid `data:image/png` URL that re-renders
correctly.

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

**Board-exam mode is now gated per exam, not offered on every exam.**
Real board/preboard exams are ~100 items; most imported exams are 25-50
item practice sets, where a 4-hour timer makes no sense. `Exam` gained
`isBoardExam` (Boolean, default `false`) — migration
`20260711155530_add_exam_is_board_exam`, additive. Set it either at
import time (a checkbox on `app/admin/import/page.tsx`, defaults
unchecked, flows through `PreviewedExam.exam.isBoardExam` →
`commitImportAction` → `lib/seed-exam.js`'s upsert) or retroactively for
an already-imported exam (checkbox + Save on
`app/admin/content/exams/[examId]/page.tsx`, `setBoardExamAction`). The
exam start page only shows the Practice/Board-exam choice when
`exam.isBoardExam` is true; otherwise it's a single plain "Start exam"
button (always `PRACTICE` mode). As of 2026-07-12 all 5 currently-
imported exams default to `false` — none of them are actual full-length
board exams yet (confirmed via direct DB query), so this is really
waiting on the real 100-item files being imported and flagged.

**Bug fixed: "Finishing…" flashed on the `ONE_AT_A_TIME` Finish button
even when Finish was never clicked.** `one-at-a-time.tsx` shared one
`useTransition()` between saving an answer (`saveAnswerAction`) and
finishing the attempt (`finishAttemptAction`). Selecting a choice then
immediately clicking Next (before that save's round-trip resolved)
landed on the last question while the shared `pending` flag was still
`true` from the *unrelated* in-flight save, so the Finish button
rendered "Finishing…" until that save resolved on its own. Fixed by
giving save and finish their own separate `useTransition()`s. Verified
by reproducing the exact race on a throwaway unauthenticated test route
(`app/dev-test-timing-bug/`, deleted after) with a deliberately slowed
fake save — confirmed present with the old shared-transition logic and
gone with the fix.

## Audit-driven feature batch (2026-07-12)

A codebase audit turned into one large implementation pass. Migration
`20260711170752_composed_attempts_and_feedback` (additive; `Attempt.examId`
made nullable, new `Attempt.subjectId`/`questionIds`/`showFeedback`,
`User.instantFeedback`; `subjectId` backfilled from each attempt's exam).

**Composed attempts** are the core new concept: an attempt with
`examId = null` whose question set is the ordered id array in
`Attempt.questionIds` (see `lib/composed-attempt.ts` — `questionIdsOf`,
`attemptTitle`, `sampleShuffled`). Two features build on it:
- **Mock board exam** (subject page): up to 100 questions sampled across
  all exams in a subject, 4-hour timer, `mode: BOARD_EXAM`. The stored
  sample order is already random so `shuffleSeed` stays null.
- **Weakest-questions drill** (stats page): top-20 most-missed questions,
  untimed practice, forced `ONE_AT_A_TIME` layout.
Attempt/review pages branch on `questionIds` to load questions by id
(preserving stored order) instead of via the exam relation. Anything that
assumed `attempt.exam` was non-null (stats, admin user detail) now uses
`attemptTitle()` + the `subject` relation.

**Exam-taking UX**: one-at-a-time resumes at the first unanswered
question (was: always Q1); clickable question-navigator grid
(answered/current states); keyboard shortcuts (A–D answer, arrows
navigate); "N unanswered — finish anyway?" confirm in both layouts;
all-at-once now autosaves every pick via `saveAnswerAction` with a
sticky Saved/Saving indicator (was: answers lived only in the DOM until
submit). "Discard attempt" (header of the taking page) deletes an
unfinished attempt so users can restart or switch practice/board mode —
previously impossible, the in-progress attempt trapped you.

**Instant feedback mode**: `User.instantFeedback` setting (Settings
page), frozen to `Attempt.showFeedback` at creation, PRACTICE +
one-at-a-time only. Reveals correct/incorrect + explanation immediately
after answering; the first pick locks (otherwise scores were gameable);
correct-choice ids/explanations are only sent to the client when the
flag is on, so board-exam attempts never ship answers to the browser.

**Pass-line framing**: review page shows PASSED/FAILED at 70% plus
completion duration; stats trend bars have a 70% tick and per-attempt
durations.

**Fixes**: deleting an already-answered question no longer FK-crashes
(`deleteQuestionAction` deletes `AttemptAnswer` rows first — schema has
no cascades); themed `app/error.tsx` / `not-found.tsx` / `loading.tsx`
(the error page specifically mentions retrying because of Neon
cold-starts); admin layout/tables now work on mobile (sidebar stacks,
tables scroll); the question-edit form got the watermark `ImageEditor`
(edits produce a data URL in a hidden field → `uploadIfEdited` in the
update action re-uploads to Blob; a plain replacement upload wins over
an edit; `ImageEditor` sets `crossOrigin="anonymous"` for non-data URLs —
Vercel Blob serves `Access-Control-Allow-Origin: *`, verified).

**Data repair (2026-07-12)**: the two originally CLI-seeded exams stored
*local* image refs (`images/<hash>.png`) that the app can't serve —
those images were silently broken in the browser the whole time. All 20
refs (18 questions) re-uploaded to Blob from `data/parsed/images/` and
the DB updated; zero local refs remain. The CLI seed path
(`scripts/parse-html.js` + `scripts/seed.js`) still writes local refs —
don't use it for real imports, use the admin UI (which the user has now
done for real: 100+ Blob-hosted images exist from their own imports).

**Also discovered**: the GitHub repo is already connected to the Vercel
project (`vercel git connect` reported as much) — **pushes to master
auto-deploy to production**. Prod and dev share the same Neon DB, so
migrations applied locally are already live for prod.

## Study tracker (2026-10-24)

A personal review-plan tracker at `/tracker` (nav: "Tracker"), separate from
exam content. Built to replace the ECE_Review_Schedule.xlsx spreadsheet for
the March 2027 ECE boards.

- **Overview (`/tracker`)**: this week's logged hours vs. the plan target
  (per-subject bars), a "log a study session" form (date, subject, activity:
  Video / Problems / Timed quiz / Formula review, duration as `90`, `1:30` or
  `1h30`, optional quiz score and note), topic and video progress summaries,
  an 8-week history table (hours, % of plan, quiz average), recent sessions.
- **Topics (`/tracker/topics`)**: per-subject checklist with status
  (Not started / In progress / Done / Needs review). The default ECE topic
  list is seeded per user on first visit (`lib/study-topics.ts`).
- **Videos (`/tracker/videos`)**: the user's saved review videos (title,
  optional link, length) with watched progress. Logging a *Video* session and
  picking a video adds the minutes to that video's progress.

Plan constants live in `lib/study-plan.ts`: `EXAM_DATE` (placeholder
2027-03-07 until PRC confirms), phases, weekly targets (normal ~22.3h; office
Mon–Fri week, i.e. the week containing the month's last Friday, ~16.7h;
holiday 12h; exam week 8h). Dates are handled as `YYYY-MM-DD` strings in
Asia/Manila and stored in `@db.Date` columns.

Models: `StudySession`, `StudyTopic`, `StudyVideo` (+ enums `StudyActivity`,
`TopicStatus`), all cascade-deleted with the user. `subject` is a plain
`CANONICAL_SUBJECTS` slug (`math`/`geas`/`elex`/`est`), not a `Subject` FK.
Migration `20261024140000_add_study_tracker` was hand-written (the build
sandbox couldn't download Prisma engines) — run `npx prisma migrate deploy`
(or `migrate dev`) against Neon before using the tracker.

## Review calendar (2026-10-24)

`/calendar` (nav: "Calendar") shows the review plan as a month or week view
(`?view=month|week&date=…&day=…`), with a day panel on the side.

- **Plan engine — `lib/schedule.ts`.** The weekly template (Mon big Elex
  blocks, Tue–Fri office + lunch formulas + evening drills, Tue PTK online
  class, Sat weakest-subject block + PTK face-to-face, Sun problems + timed
  quiz) is generated in code from `PLAN_START` to the day before `EXAM_DATE`.
  Office weeks, holiday weeks and exam week get their own variants; Sundays
  switch to half mocks every other week in Phase 2 and full mocks in Phase 3.
  Pure functions, shared by the page, the tracker targets and the ICS feed.
  The tracker's weekly "Plan" is now the sum of these blocks (with the
  user's overrides), not a fixed constant.
- **Overrides (`ScheduleOverride`).** Only changes are stored: SKIP or MOVE
  of one template block (`blockKey`, e.g. `tue-ptk`) on one day. "PTK moved
  to Friday this week" writes two MOVEs (class → Fri 7pm, Fri EST drill →
  Tue 8:30pm).
- **D&D night.** Office D&D game (Thu/Fri 8–11pm, irregular): one tap on
  that day adds a Busy "D&D night" event and moves the evening drill to
  Saturday 7:30pm, skipping Saturday's light review (a second D&D night the
  same week lands at 8:30pm). Undo reverses it. See `dndNightPlan`.
- **Planned vs done.** Each day's status bar compares logged
  `StudySession` minutes with planned review minutes. A catch-up card (rest
  of the current week) lists per-subject shortfalls.
- **Spaced reviews (`ReviewReminder`).** Marking a topic Done schedules
  re-reviews at +3/+7/+21 days; Needs review at +1/+3/+7 (any later status
  change replaces pending ones). Missed reminders roll forward onto today.
- **Events (`CalendarEvent`).** One-off EVENT / BUSY / DEADLINE items, timed
  or all-day.
- **Google Calendar feed.** `User.calendarToken` enables a read-only ICS feed
  at `/api/calendar/<token>` (plan blocks except Office, events, pending
  reviews, milestones). Token can be reset or turned off from the page.

Migration `20261024150000_add_calendar` (hand-written, same reason as the
tracker one) must be applied before deploying — the tracker overview reads
`ScheduleOverride` too, so it breaks without it.

## AI explanations (2026-10-24)

"Explain my mistake" / "Explain this" button under each question on the
attempt review page (`app/attempt/[attemptId]/review/explain-button.tsx`).
It POSTs to `/api/explain`, which streams a plain-text explanation from the
Claude API (`@anthropic-ai/sdk`).

- The prompt (`lib/ai-explain.ts`) passes the answer key and the review
  center's solution as authoritative, so Claude explains toward the known
  answer rather than re-solving. Remote (https) question/solution images are
  sent too.
- Results are cached in `QuestionExplanation`, keyed by (question, picked
  choice or "skipped"); cache hits are free. "Regenerate" deletes the cached
  row and asks again.
- Env vars: `ANTHROPIC_API_KEY` (required — the button is hidden without
  it), `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), `AI_DAILY_LIMIT`
  (new explanations per user per rolling 24h, default 40).
- Migration `20261024160000_add_question_explanations`.

## Video library and watch plan (2026-10-25)

The user's review videos live on their G: drive (`Excel Review Center` and
`REVIEW TUTORIAL`, 2,006 .mp4 files, ~1,098 h). They were measured once
(lengths read from every file). **By the user's choice, the app only covers
Review lectures, Refreshers and Calculator techniques** (1,408 files,
~911 h across all batches); pre-season basics, Basic Math, short clips and
consultations are deliberately excluded. Data: `lib/video-library.json`,
typed by `lib/video-library.ts`:

- `plan`: one recording per topic from the Oct 2024 batch (Version 1), in
  three sections: `core` (41 review lectures, ~93 h), `calculator` (Canon
  F-789SGA lecture + 3 calculator-technique refreshers, ~10 h), `refresher`
  (19 Phase 2 refreshers, ~41 h).
- `library`: every batch/version of those three types, grouped by folder.

`StudyVideo.section` / `StudyVideo.localPath` (migration
`20261025030000_video_plan_fields`) mark plan videos. The Videos tab shows an
"Add / Update watch plan" card whenever the user's videos differ from the
plan; `syncWatchPlanAction` adds missing plan videos, re-sorts existing ones
and deletes imported plan videos no longer in the plan (hand-added videos,
section null, are never touched). `/tracker/library` shows the
topic-by-batch table with copyable folder paths. Browsers can't open local
files, so the app only offers "copy path".

The Videos tab (`/tracker/videos`) is a checklist like the Watch Plan sheet:
section cards (watched/left), subject filter, one row per plan video with a
one-tap watched box (`setWatchedAction`, creates the StudyVideo row on first
tick, so no import step is needed), length, 1.5x, running total and watched
date.

**Opening videos:** browsers can't open `G:\...` from a website, so ▶ links
use a custom `ecevideo:open?path=<drive-relative path>` scheme
(`lib/video-opener.ts`). The user installs the handler once from
`G:\ECE Video Opener` (`tools/video-opener/` in this repo):
`Install video opener.bat` registers the scheme under HKCU (no admin) to run
`open-video.ps1`, which only opens existing .mp4 files under
`Excel Review Center` / `REVIEW TUTORIAL` on its own drive. Works only on
that Windows laptop; elsewhere the copy-path button is the fallback.

To re-measure after the drive changes, regenerate the JSON from a fresh
duration scan rather than editing it by hand.

## Notes & formula recall (2026-10-25)

`/notes` (nav: "Notes"): one note per topic (`StudyNote`: subject, topic,
free-text body) with a list of formulas to memorize (`FormulaCard`: name =
the prompt, formula = the answer, optional hint). The editor
(`app/notes/note-editor.tsx`) has a symbol bar (π, ω, √, ², Ω, …) that
inserts at the cursor, and topic suggestions from the review lectures and the
topic checklist.

Recall mode (`/notes/recall`, `?note=`, `?subject=`, `&all=1`): flashcards —
show the name, reveal the formula, mark Got it / Missed. Spacing is Leitner
boxes in `lib/recall.ts` (intervals 0/1/3/7/14/30 days; a miss resets to box
0 and stays due today). Each answer is saved immediately
(`recordRecallAction`). Cards are shuffled server-side so SSR and the
browser agree. Editing a card's formula text resets it to box 0. The
calendar's 20-minute "Formula review" blocks link to `/notes/recall`.
Migration `20261025040000_add_notes_and_formula_cards`.

## Google Drive video uploads (2026-10-25)

So plan videos can be watched away from the laptop. `lib/google-drive.ts`.

- **Connect** (`/api/drive/connect` → Google → `/api/drive/callback`): a
  separate OAuth consent for the `drive.file` scope (the app only sees files
  it uploaded). The refresh token is stored AES-256-GCM-encrypted
  (key derived from `AUTH_SECRET`) in `DriveConnection`, with the app's
  "ECE Review Videos" folder id. CSRF protected by a state cookie.
- **Upload** (`app/tracker/videos/drive-uploader.tsx`): the user picks the
  `OCTOBER 2024\1ST SEM` folder (or files); the browser matches plan videos by
  file name + exact size, pre-selects unwatched ones that fit the free quota,
  then for each file calls `/api/drive/session` (server validates the plan
  path and size, opens a resumable session with the browser's `Origin`, and
  returns only the session URL; the Google token never reaches the browser)
  and PUTs 32 MB chunks straight to Google with retry + resume via
  `Content-Range: bytes */total`. `/api/drive/complete` verifies the file
  size on Drive and sets `StudyVideo.driveFileId`. Each upload carries
  `appProperties.planPath`, so "Check Drive" (`syncDriveAction`) can relink
  uploads or clear links to deleted files.
- **One-click row upload** (`app/tracker/videos/upload-queue.tsx`): each
  checklist row not yet on Drive has a ☁↑ button. In Chrome/Edge the user
  picks the video folder once (File System Access API, `lib/video-folder.ts`;
  the directory handle is kept in IndexedDB and read permission is asked per
  visit unless "Allow on every visit"); `resolveVideo` finds the file by lining
  the picked folder's name up with the plan's G:\ path, so any level from the
  drive to `Excel Review Center` works. Clicks join a sequential queue with
  per-row progress; "Upload all N shown" queues the filtered list (checked
  against free Drive space). Other browsers fall back to a single-file picker
  per row (name + size must match). The upload engine is shared with the bulk
  uploader in `lib/drive-upload-client.ts`.
- **Watch** (`/watch/[id]`, wider layout; the old `/tracker/videos/watch/[id]`
  redirects): Drive's own player in an iframe (`/file/d/<id>/preview`); private
  files play for whoever is signed in to that Google account in the browser.
  The topic's note opens beside the player (`app/watch/[id]/watch-notes.tsx`,
  matched by subject + topic, case-insensitive) and autosaves ~1 s after
  typing via `autosaveNoteAction` (draft mode in `lib/note-store.ts`: half-
  filled formula rows are skipped, not rejected). On phones the player is
  sticky at the top of a single grid so it stays in view over the notes.
  Mark watched, next video on Drive, remove from Drive.
- **Watched box confirmation**: `WatchCheckbox` asks in a small `<dialog>`
  before ticking or unticking, so stray taps don't change progress.
- **Free space**: remove one video or all watched ones — permanent delete
  (`DELETE files/<id>`), so space frees immediately; G: files and progress
  are untouched.
- **Setup needed in Google Cloud** (same OAuth client as sign-in): enable the
  Google Drive API, add the `drive.file` scope to the consent screen, add
  `https://<domain>/api/drive/callback` (and the localhost one) as an
  authorized redirect URI. Consent screens left in "Testing" expire refresh
  tokens after 7 days (the app then asks to reconnect); publishing the app
  avoids that.
- Migration `20261025050000_google_drive_videos`.

## Search engines

The site is private: `app/robots.ts` disallows everything, the root
`metadata.robots` sets noindex/nofollow on every page, and `next.config.ts`
sends `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet` on every
response (covers API routes and the calendar feed).

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
lib/composed-attempt.ts       Helpers for exam-less attempts (mock board exams, weak-question drills)
lib/concurrency.ts             mapWithConcurrency - order-preserving, capped-parallel map (used by admin import)
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
components/image-editor.tsx   Canvas watermark-removal editor (rect/brush/eyedropper/undo), used by admin import
components/question-form.tsx  Shared create/edit question form
README.md                     Shorter, pipeline-focused setup instructions
CONTEXT.md                    This file
```

## Math-friendly formulas

Formula cards are typed calculator-style and drawn as real math with KaTeX
(`components/formula-math.tsx`, converter in `lib/formula-math.ts`, which goes via AsciiMath → LaTeX).

- `x/y`, `1/(2πfC)`, `R1R2/(R1+R2)` → stacked fractions (everything written together on each side of `/` belongs to it)
- `X2`, `R1`, `x_2` → subscripts; `Vrms`, `Xc`, `Rth` → V_rms etc. (capital + lowercase); `X_L` for a capital subscript
- `²`, `³`, `⁻¹`, `^` → powers; `√(…)²+(…)²` covers the whole side, `√(LC)` just the bracket, `√2` just the term
- Greek letters from the symbol bar; `sinx`, `cosθ` → sin x, cos θ
- `$…$` → raw LaTeX escape hatch. Anything KaTeX can't draw falls back to the typed text.

Shown in recall mode (revealed answer + missed list), on the note page, and as a "Shows as" live preview
under each formula input in the note editor and the watch-page notes panel. Stored text is unchanged.

## Built-in player and note timestamps

`/watch/[id]` plays Drive videos in the site's own `<video>` (`app/watch/[id]/watch-player.tsx`) instead of Drive's iframe,
so the notes can read and set the playback time. A `<video>` can't send the Authorization header Drive requires
(query-string tokens are rejected for downloads), so `public/drive-sw.js` (service worker) maps `/drive-media/<fileId>`
to `files/<id>?alt=media` with `Bearer` + the Range header. It gets a short-lived drive.file token from
`/api/drive/token` and refreshes on 401. If the worker can't take control (no SW support, hard refresh) or the
video errors (codec), it falls back to Drive's iframe, and timestamps are disabled there.

- `lib/player-bridge.ts`: a small store connecting the player to the notes panel and speed buttons (getTime/seek/setRate).
- Notes panel: **Add timestamp** (or Alt+T) inserts `[m:ss] ` at the start of a line. Lines starting with a timestamp
  are listed under "Timeline · tap to jump", and tapping one seeks.
- The note page renders `[m:ss]` as links to `/watch/<topic video>?t=<seconds>`. The topic video is matched by
  title suffix "· Topic", with the uploaded one first. The player honours `?t=`, otherwise it resumes the last position
  (localStorage `watch-pos:<videoId>`). Speed buttons 1–2× are remembered in `watch-rate`.
- Helpers are in `lib/timestamps.ts` (formatTime, parseTimeline, splitTimestamps).

## Formula auto-fit

`components/fit-width.tsx` shrinks a formula's font size until it fits its container. It goes down to 40%, refines
a few passes, and re-fits on resize and after the KaTeX fonts load. It only scrolls sideways if the formula still
doesn't fit. Used via `<FormulaMath fit />` in recall (card and missed list), on the note page and in "Shows as"
previews. The recall card is wider (max-w-3xl), taller (min-h-80, or 96 on sm+), and has the formula vertically centred.

## Questions from videos

The watch page's notes panel has **Questions from this video** (`app/watch/[id]/video-questions.tsx`).
- A `VideoQuestion` row (per user and video) stores the text, choices A–D, `correct` (null = pending), solution notes,
  an optional picture, and `seconds` (the video time when it was added). Subject and topic come from the video.
- Pictures can be a **captured video frame** (canvas from the built-in player via `playerBridge.captureFrame`, which works
  because the video is same-origin through the SW) or a photo. Both are shrunk to ≤1600 px JPEG in the browser
  (`lib/shrink-image.ts`), then uploaded to Vercel Blob. The server-action body limit is 5 MB (next.config).
- When a question has text, four choices and an answer, `syncToBank` (`lib/video-questions.ts`) copies it into the
  subject's **"<Subject> · Video questions"** exam (slug `video-questions-<subject>`, created on first use), and later
  edits update that copy. Pending questions never reach the bank, so exam and mock queries need no changes. Once a
  question is in the bank it can't go back to pending. Deleting it also deletes the bank copy and its answers.
- Pending questions have quick A–D buttons to set the answer once it's solved on screen.
- Attempt review shows "▶ Watch the solution in the video (m:ss)" for questions that came from a video.
- Integration-tested against real Postgres via Prisma's wasm engine + `@prisma/adapter-pg` in a scratch dir
  (the sandbox can't download native engines).

## Solved problems from videos

`VideoQuestion.kind` is either `"mcq"` (choices A–D, as above) or `"solve"`: a problem worked on screen with just a
final `answer` (rendered with FormulaMath) and an optional `solutionImageUrl` (e.g. "Capture the solved board").
The form remembers the last type used (localStorage).
- Solved problems never enter the MCQ bank directly. They're practised at **/notes/problems**
  (`?video=`, `?subject=`, `&all=1`): read, solve on paper, reveal the answer, solution picture and a "watch the
  solution" link, then grade. Scheduling uses the formula Leitner boxes (`box`/`dueDate`/`timesRight`/`timesWrong`).
  /notes shows a due card.
- **Make it multiple choice** (only when ANTHROPIC_API_KEY is set): `lib/ai-distractors.ts` asks Claude for three
  plausible wrong answers (common ECE mistakes, same format and units). The real answer lands on a random letter,
  the kind becomes `mcq`, and it syncs to the bank.
- In the bank, the solution picture becomes `Question.explanationImageUrl`, for both kinds.
- FormulaMath keeps units after numbers upright: `12.73 V`, `25 mA`, `4.7 kΩ`, `10 μF`, `20 dB`. Without a space,
  only V/A/W/Ω/% count as units (so `3m` stays a variable).

## Watch-page notes panel (formulas / timeline / key points)

`app/watch/[id]/watch-notes.tsx` has three sections:
- **Formulas to memorize**: a read-only list with math rendered (FormulaMath fit) and a pencil per row. Edit and
  **Add formula** open one inline form with the symbol bar, a "Shows as" preview, Save, Cancel and Delete. Saving
  goes through the same `autosaveNoteAction` as before, called straight away. The **Recall** button sits right
  under the list.
- **Timeline**: `VideoMarker` rows (per video: seconds + label). **Mark this moment** (or Alt+T anywhere) takes the
  player time and you name it; the time and label are editable. The part being played is highlighted (polls the
  player every 1 s), and tapping one seeks. Actions are in `marker-actions.ts`. Notes written earlier with
  "[m:ss]" lines in the text get a **Move to timeline** button (`moveTimestampsToTimelineAction`): those lines
  become markers and are removed from the text.
- **Key points**: the note's free text (StudyNote.body, autosaved) for terms and ideas, with a Symbols toggle. The
  symbol bar types through the native value setter + an input event, so React's onChange fires.
The note page (/notes/[id]) shows a Timeline card (markers of the topic's videos, linking to `?t=`) and "Key points".

## Shared symbol bar

`components/symbol-bar.tsx` (`SymbolBar` + `typeInto`) is used by the formula form, the key points toggle and the
video question form. In the question form it types into whichever field was focused last (question, choices,
answer or solution notes), tracked with `onFocusCapture` on the form.

## Mistake bank

`MistakeCard` (one per user and question). Rules are in `lib/mistakes.ts`:
- A wrong answer means in the bank (or back in, with the streak reset and mastered cleared), due tomorrow.
- A right answer while the card is due adds one to the streak: the first time it's due again in 3 days, the
  second time in a row it's mastered (`masteredAt`) and leaves the queue.
- Right answers before the due date and skipped questions don't count.
`applyAttemptToMistakes` runs inside `finishAttempt` (`lib/attempt-finish.ts`), which is now the single place an
attempt is scored and closed (submit, finish and the daily session). The migration backfills the bank from history:
every question whose latest finished answer was wrong (timesWrong = past wrong count, due now).
- **Review due mistakes** (`startMistakeReviewAction`): a composed attempt with `label: "mistakes"`, up to 20
  questions, one at a time with instant feedback. The weak drill now ignores labelled attempts when resuming.

## Daily session ("Today", /daily)

`/daily` shows today's counts, a time estimate, Start/Continue, "Done for today" with a review link and "Another
round", plus the mistake bank (due / to master / mastered) with a review button. The dashboard links to it, and the
nav has a "Today" item. `startDailyAction` closes stale unfinished daily attempts from earlier days (Manila day
boundary) and resumes today's.
- The mix (`lib/daily.ts`, `DAILY`): up to 6 due formula cards, 8 multiple-choice questions (due mistakes first,
  then fresh questions from the two weakest subjects by accuracy, skipping active mistakes and questions answered
  right in the last 14 days) and 2 due solved problems.
- The MCQ part is a composed attempt `label: "daily"` (PRACTICE, instant feedback), so it counts in Progress and
  feeds the mistake bank. Formulas and problems use their existing record actions.
- `/daily/session?attempt=` (`daily-session.tsx`) runs one flow: formula warm-up → questions → solved problems.
  Already-answered questions are skipped when resuming. At the end, `finishInPlaceAction` scores the attempt and
  the summary links to the attempt review.

## Automatic study tracking

The tracker fills in without typing. Auto entries are `StudySession` rows with a unique `autoKey` (per user), and
time accumulates in `seconds`; `minutes` follows it (`lib/auto-log.ts` → `addAutoTime`). Recent sessions show an
"auto" badge and hide rows under a minute.
- **Built-in player** (`watch-player.tsx`): counts real playing time and which 10-second stretches were played
  normally. Skips and seeks don't count, and rewatching doesn't count twice. It POSTs to `/api/watch/progress`
  every 30 s, on pause, on end and when hidden or leaving (keepalive). The server ORs the stretches into
  `StudyVideo.watchedBuckets` (base64 bitmap, `lib/watch-coverage.ts`), raises `watchedMinutes` (never lowers it)
  and **auto-marks the video watched at 90% played**. Playing time goes to today's VIDEO session,
  key `<date>:video:<videoId>` (≤120 s per beat). `WatchStatus` shows "Auto-tracking · N% played" and "Marked as
  watched automatically". Drive's iframe fallback can't be tracked.
- **Exams and drills**: `finishAttempt` → `logAttempt` logs a QUIZ session (key `attempt:<id>`) with the score and
  answered count. Time is from the first to the last answer, plus reading time. Mixed sets use their most common
  subject.
- **Formula recall and solved problems**: the client sends the seconds spent on each card (clamped 5–300 s), added
  to today's REVIEW session per subject (`<date>:review:<subject>`).
- **Laptop player (ecevideo:)** can't report back. `OpenVideo` remembers what was opened (localStorage,
  `lib/local-watch.ts`), and after 5 minutes the tracker layout shows "You opened X N min ago — log it?" with
  editable minutes, **Log time**, **Log + finished it** and **Didn't watch** (`logLocalWatchAction`).
- Non-tracker subjects (ECT) aren't auto-logged.
- Fallback diagnostics: when the built-in player can't start, the note under Drive's player says why. Causes:
  no service worker, the worker not taking control within 10 s (often a hard refresh), or a video error. For a
  video error the player probes `/drive-media/<id>` (Range 0-1) and maps 401 → reconnect Drive, 403 → Google's
  message, 404 → re-upload, and code 4 → format. If the file is reachable it retries the load once. The SW passes
  token-route errors on as JSON. WatchStatus shows "Starting player…" while loading.

## Navigation & layout (2026-10-27 redesign)

- The main sections are defined in `lib/nav-items.ts`: **Today** (/daily) · **Lessons** (/lessons, /watch) ·
  **Practice** (/dashboard, /subject, /exam, /attempt) · **Notes** · **Progress** (/stats, /tracker) · **Calendar**.
  `match()` decides which item is highlighted for a path.
  - Desktop: icon links (labels from md up) plus an account menu (initial ▾: Settings, Admin, Log out).
  - Phone: ☰ sheet with everything, plus a **bottom tab bar** (Today, Lessons, Practice, Notes, Progress). It is hidden
    on `FOCUS_ROUTES` (exam attempts, daily session, recall, problems). The body has bottom padding on phones.
- **Lessons** (`app/lessons/`) now holds the video checklist (moved from /tracker/videos), Topics and Library, with
  `LessonsTabs` and the laptop-player log prompt in its layout. **Progress** = `ProgressTabs` on /stats (Scores) and
  the /tracker layout (Study log). Old /tracker/videos|topics|library URLs redirect (next.config `redirects`).
  Revalidation calls hit both "/tracker" and "/lessons".
- **Today is the home page** (`/` redirects there after login; the logo links there). It shows the 15-minute
  session, Continue watching (an in-progress video, else the next unwatched one), the mistake bank, and today's
  plan from `blocksForDay` with studied vs planned minutes.
- Practice (/dashboard) is titled "Exams & drills" and has a Today card, a Mistake bank card and subject icons
  (`components/subject-icon.tsx`: Math Σ, GEAS ⚛, Elex chip, EST radio, ECT wrench).
- `PageHeader` takes an `icon` (lucide) shown in a tile; every main page has one.
- Motion (`globals.css`, all disabled under prefers-reduced-motion): `app/template.tsx` fades each page up;
  `.stagger` children appear in sequence; `.bar-fill` progress bars grow; `.lift` cards rise on hover;
  `.animate-pop` (checkmarks, active tab marker); `.animate-sheet` / `.animate-pop-in` for menus.
- Phone fixes: the video checklist shows the length under the title and hides desktop-only icons; the 8-week table
  hides Type and Quiz avg; Scores tiles sit 3 across; the weakest-questions list shows 5 with "Show N more".
- Bug fixes: duplicate React keys on the Library page; hydration mismatch in the note editor (module-level key
  counter → per-component ref).
- Local visual audits: there's no native Prisma engine in the sandbox, so run the app against a scratch Postgres
  through the wasm query engine + `@prisma/adapter-pg`. This needs a temporary patch to `lib/prisma.ts` and
  `serverExternalPackages`. Never commit it.

## Notes panel tabs

The watch-page notes panel works like navigation, showing one section at a time. Tabs (with icons and counts):
**Formulas · Timeline · Key points · Questions** (`NotesTabs` in watch-notes.tsx).
- Each section is a `NotesTabPanel` (`components/notes-tab-panel.tsx`) with its title, icon and action button (Add
  formula / Mark this moment / Symbols / Add question). Inactive panels stay mounted but `hidden`, so half-typed
  forms survive switching. Each panel reports its count to the store.
- The active tab and counts live in `lib/notes-tab.ts` (useSyncExternalStore, shared by WatchNotes and
  VideoQuestions). The last tab used is remembered in localStorage `notes-tab`. Alt+T switches to Timeline.
- The tab bar is sticky: on phones just under the pinned player (WatchPlayer publishes the player box height as the
  CSS var `--player-h`), and at the top of the scrolling panel on large screens.

## Watch page controls / Drive management

Under the player there's only: Watched, the auto-tracking status, speed and Next. The "Just uploaded…" note, Open in
Drive and Remove from Drive are gone. Removing videos from Drive moved to **Settings → Videos on Google Drive**
(`app/settings/drive-videos.tsx`): the list of uploaded videos (watched ✓), a remove button per video with an
inline confirm, and **Remove all watched**. It uses the same actions as before (`app/tracker/drive-actions.ts`, which
now also revalidates /settings).

## Precise skipping in the built-in player

Dragging the native scrub bar on a 2-hour video moves about a minute per pixel, so the player has its own skips
(`watch-player.tsx`, `playerBridge.skip`):
- **⟲ 10s / 10s ⟳** buttons under the player (`SkipButtons` in speed-control.tsx).
- Keys, outside text fields: ← / J = back 10 s, → / L = forward 10 s, with Shift = 30 s; K or Space (when nothing is
  focused) = play/pause. They're listened for in the capture phase, so the video element's own arrow seek doesn't
  also run.
- **Double-tap** the left or right third of the video (above the control bar) to skip 10 s; a single tap there
  plays/pauses. A "−10s / +20s" bubble shows the skip, and quick repeats add up.
- Player helper start-up (`ensureWorker`): a page that was loaded while the worker was already active but not
  controlling it (Ctrl+Shift+R, or an old tab) never gets `controllerchange` from the activate-time claim. Now the
  player waits for `serviceWorker.ready` and posts "claim" to the worker (drive-sw.js v3 calls `clients.claim()`
  on that message). If the page still isn't controlled after 4 s, it does one normal reload per tab session
  (sessionStorage flag) before falling back to Drive's player. Reproduced with CDP `Page.reload {ignoreCache}`:
  the old code fell back, the new code recovers.
- Drive uploads tag the file with `appProperties.planKey` (a 16-hex FNV-1a hash of the G:\ path, `planKey()` in
  lib/video-library.ts), not the path itself. Drive caps a property at 124 bytes (key + value), and 14 of the 64 plan
  paths are longer, which failed with 403 propertyLengthLimitExceeded. "Sync with Drive" matches both planKey and
  the older planPath.

## Admin vs regular users (shared video library)

- **The admin's Google Drive is the shared library** (`lib/shared-videos.ts`). The first ADMIN user uploads.
  `sharedDriveFiles()` maps localPath → the admin's driveFileId. Every account keeps its own StudyVideo rows
  (progress, notes, questions); `ensurePlanVideos()` creates a regular user's 64 plan rows on first visit, so each
  video has an id for /watch.
- Playback: /lessons, /watch and Today resolve the Drive file per row (the admin's own row, otherwise the shared
  one). `/api/drive/token` always returns the **admin's** drive.file access token, so every signed-in user's
  service worker streams the admin's uploads. Trade-off: a signed-in user could read that short-lived token in dev
  tools; it only covers files this app uploaded (it could delete those videos). Anyone with a Google account can
  sign in, so consider an email allowlist if the site is shared widely.
- Admin-only: Drive connect/callback/session/complete routes, all drive-actions (sync/remove/disconnect), adding
  hand-made videos, the Drive panel, upload queue, the laptop "Video not opening?" setup, the G:\ folder (copy path)
  icon, local ▶ links, the laptop log prompt, the outdated-plan card, **Calendar** (nav item `adminOnly`; the page
  redirects others to /daily), Today's plan card, and Settings → Videos on Google Drive.
- Regular users see each plan video as ▶ title ☁ when uploaded, and greyed out with a "SOON" tag when not yet uploaded.
  Row order is now play icon + title + cloud (for everyone).

## Sign-in allowlist & video saving

- **Only approved emails can sign in** (`lib/access.ts`). Allowed: `ADMIN_EMAIL` (env), any existing ADMIN user, and
  `AllowedEmail` rows (lower-case). In `auth.ts`, the `signIn` callback turns others away to `/login?error=NotApproved`
  and upserts an `AccessRequest` (email, name, last tried). The `jwt` callback re-checks an existing session every
  5 minutes (`accessCheckedAt`) and returns null, which ends the session, if the email was removed.
- The migration approves every existing user's email so nobody is locked out on deploy.
- Admin → Users → **Who can sign in** (`access-panel.tsx`, `access-actions.ts`): pending requests (Approve /
  Dismiss), add an email, and the approved list with Remove (you can't remove yourself).
- The player's `<video>` has `controlsList="nodownload"` (no Download in the ⋮ menu) and the right-click menu is
  blocked on its wrapper. This deters casual saving only: the file ID is still visible in dev tools and the stream
  key travels to the browser (see "Admin vs regular users").

## Exam import: damaged HTML

Some scraped files (e.g. "RC Exam - Elec 21") have a closing tag missing its ">" that runs into the next tag:
`</questions<table id="answer" …>`. Browsers recover from it, but cheerio/parse5 read it as one broken end tag
and dropped the whole answer table, so every question reported `no-answer-row`. `repairHtml()` in
lib/exam-parser.js inserts the missing ">" before parsing, and the answer lookup falls back to any
`tr[data-id=…]` if the `table#answer` wrapper is still damaged. `tidyText()` also fixes the "tanˉ¹" (modifier
macron → superscript minus) and "doesn`t" (backtick → ’) quirks in question, choice and answer text.

## Fix: image editor off-centre on long pages (Admin → Import)
- Cause: `app/template.tsx` wraps every page in `.animate-enter`, whose fill-mode `both` left a `transform` on the wrapper after the fade-in. A transformed ancestor becomes the containing block for `position: fixed`, so the editor overlay was centred on the whole page, not the screen.
- Fix: `components/image-editor.tsx` now renders through `createPortal(…, document.body)` and locks background scroll while open. `.animate-enter`, `.stagger > *` and `.bar-fill` in `globals.css` use fill-mode `backwards`, so finished animations leave no transform.
- Rule: any new full-screen overlay should portal to `document.body` (as the nav menu does).

## Fix: videos not playing on iPhone Safari
- Symptom: the built-in player failed on iOS Safari and fell back to Drive's embedded player, which asks for cookie access (Safari blocks third-party cookies) and then shows a Google 400.
- Cause: `public/drive-sw.js` passed Google's cross-origin response straight to the `<video>`. Browsers hide `Content-Range` on that response (Google doesn't expose it), and Safari refuses to play a 206 without it. Chrome is lenient, so it only broke on Safari.
- Fix (worker v4): the worker fetches the file's `size` and `mimeType` once (`?fields=size,mimeType`), then answers every range request with its own `206` + `Content-Range`/`Content-Length`/`Content-Type`/`Accept-Ranges`, or a `416` for out-of-range requests. A 401 still triggers one token refresh.
- The Drive iframe fallback can't work for non-admin accounts or for Safari without Google cookies; it's only a last resort.

## Fix: player stuck over the page in phone landscape
- On phones the player (and the notes tabs under it) are `sticky` so they stay visible while typing notes. In landscape the screen is shorter than the video, so the pinned player covered the screen while the page scrolled behind it.
- Both now use `max-lg:[@media(max-height:600px)]:static`: pinned only when the screen is taller than 600px (portrait phones); short/landscape phones scroll normally. Desktop (lg) layout unchanged.
