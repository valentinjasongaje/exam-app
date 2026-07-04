# Exam App — schema + HTML→DB pipeline

> **New to this project (including fresh Claude Code sessions)?** Read
> [`CONTEXT.md`](./CONTEXT.md) first — it has the full backstory, every
> decision made and why, what's verified so far, and the next-steps roadmap.

This is phase 1 of the project: turning the scraped reviewer HTML files into
a clean relational database, ready for the Next.js app to sit on top of.


## What's here

```
prisma/schema.prisma      Postgres schema: Subject → Exam → Question → Choice,
                           plus User → Attempt → AttemptAnswer for stats/tracking.
scripts/parse-html.js     Cheerio parser: scraped HTML -> data/parsed/*.json
scripts/seed.js           Loads data/parsed/*.json into Postgres via Prisma.
scripts/verify-with-sqlite.js   Verification-only script, see note below.
data/raw/                 Your scraped HTML files go here.
data/parsed/              Parser output: one JSON file per exam, plus
                           images/ (re-hosted base64 images) and manifest.json.
```

## How the parsing works

Each scraped exam file has three linked parts, tied together by a numeric
`data-item` id: the live question cards (question text, choices), an answer
key table (correct answer text), and per-question solution blocks (often
empty, sometimes an explanation with text/images). The parser:

1. Reads every question card and pulls out the question text, choices (in
   A/B/C/D order), and any embedded base64 image.
2. Cross-references the answer-key table by `data-item` to find the correct
   answer text, then matches it against the four choices (whitespace-
   normalized) to mark `isCorrect`.
3. Pulls the explanation text/image out of the matching solution block, if
   present.
4. Decodes any base64 images and writes them to `data/parsed/images/`,
   named by content hash (so identical images aren't duplicated).
5. Infers a subject name from the exam title (e.g. "ECT Pre Board Exam 1" →
   subject "ECT") using pattern-stripping. **Check `data/parsed/manifest.json`
   after running this on your full file set** — with dozens of files the
   subject-name guessing may need a manual override for a few titles that
   don't match the common patterns (`... - Test NN`, `... Exam N`, etc). If
   you hit that, tell me the odd filenames and I'll add a mapping file.

Tested against both sample files: **100/100 questions parsed with 0
unmatched answers**, including a question with an embedded circuit-diagram
image.

## Running it

```bash
npm install

# 1. Parse: data/raw/*.html -> data/parsed/*.json
npm run parse

# 2. Point Prisma at your Postgres database (Neon/Supabase connection string)
cp .env.example .env   # then edit DATABASE_URL

# 3. Create the tables
npx prisma migrate dev --name init

# 4. Load the parsed content
npm run seed
```

## A note on `verify-with-sqlite.js`

The sandbox this was built in couldn't reach `binaries.prisma.sh` to
download Prisma's query engine, so I couldn't run `prisma migrate` /
`prisma studio` there to prove the pipeline end-to-end against a real
database. Instead, `scripts/verify-with-sqlite.js` recreates the same
tables in-memory using Node's built-in SQLite and runs the same
load-and-query logic `seed.js` does through Prisma — same schema shape,
same relations, same aggregate queries a stats dashboard would run. That
confirmed the design is sound (100 questions, 400 choices, every question
has exactly 4 choices and exactly 1 correct answer). It's not part of the
app — you won't need it once you run the real migration against Postgres
on your own machine, where the download won't be blocked.

## Next steps

- Add your remaining HTML files to `data/raw/` and re-run `npm run parse`
  — check the manifest for any subject-name misfires or unmatched answers
  before seeding.
- Once seeded, images in `data/parsed/images/` need to be uploaded
  somewhere durable (Vercel Blob / Supabase Storage) and `Question.imageUrl`
  updated to point at the hosted URL instead of the local path — I'd fold
  that into the seed script once we pick a storage provider.
- Then: Next.js app shell (auth, exam-taking flow, stats dashboard).
