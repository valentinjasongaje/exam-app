#!/usr/bin/env node
/**
 * VERIFICATION-ONLY SCRIPT — not part of the app.
 *
 * This sandbox can't reach binaries.prisma.sh, so the Prisma CLI can't
 * download its query engine here. To still prove the schema + seed
 * logic are correct, this script recreates the same tables in raw
 * SQLite (Node's built-in node:sqlite) and runs the same load-and-query
 * logic seed.js does via Prisma. When you run this for real, `npx
 * prisma migrate dev` + `npm run seed` against Postgres replace this.
 */

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const PARSED_DIR = path.join(__dirname, "..", "data", "parsed");
const db = new DatabaseSync(":memory:");

db.exec(`
  CREATE TABLE subjects (id INTEGER PRIMARY KEY, name TEXT, slug TEXT UNIQUE);
  CREATE TABLE exams (
    id INTEGER PRIMARY KEY, subject_id INTEGER, title TEXT, slug TEXT UNIQUE,
    source_file TEXT, source_tag TEXT,
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
  );
  CREATE TABLE questions (
    id INTEGER PRIMARY KEY, exam_id INTEGER, "order" INTEGER, text TEXT,
    image_url TEXT, explanation TEXT, explanation_image_url TEXT, source_item_id TEXT,
    FOREIGN KEY (exam_id) REFERENCES exams(id),
    UNIQUE (exam_id, source_item_id)
  );
  CREATE TABLE choices (
    id INTEGER PRIMARY KEY, question_id INTEGER, label TEXT, text TEXT, is_correct INTEGER,
    FOREIGN KEY (question_id) REFERENCES questions(id),
    UNIQUE (question_id, label)
  );
`);

const manifest = JSON.parse(fs.readFileSync(path.join(PARSED_DIR, "manifest.json"), "utf-8"));

const insertSubject = db.prepare(
  "INSERT INTO subjects (name, slug) VALUES (?, ?) ON CONFLICT(slug) DO UPDATE SET name=excluded.name RETURNING id"
);
const insertExam = db.prepare(
  `INSERT INTO exams (subject_id, title, slug, source_file, source_tag) VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(slug) DO UPDATE SET title=excluded.title RETURNING id`
);
const insertQuestion = db.prepare(
  `INSERT INTO questions (exam_id, "order", text, image_url, explanation, explanation_image_url, source_item_id)
   VALUES (?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(exam_id, source_item_id) DO UPDATE SET text=excluded.text RETURNING id`
);
const insertChoice = db.prepare(
  `INSERT INTO choices (question_id, label, text, is_correct) VALUES (?, ?, ?, ?)
   ON CONFLICT(question_id, label) DO UPDATE SET text=excluded.text, is_correct=excluded.is_correct`
);

for (const entry of manifest) {
  const data = JSON.parse(fs.readFileSync(path.join(PARSED_DIR, entry.file), "utf-8"));

  const subjectId = insertSubject.get(data.subject.name, data.subject.slug).id;
  const examId = insertExam.get(
    subjectId,
    data.exam.title,
    data.exam.slug,
    data.exam.sourceFile,
    data.exam.sourceTag
  ).id;

  for (const q of data.questions) {
    const questionId = insertQuestion.get(
      examId,
      q.order,
      q.text,
      q.imageUrl,
      q.explanation,
      q.explanationImageUrl,
      q.sourceItemId
    ).id;

    for (const c of q.choices) {
      insertChoice.run(questionId, c.label, c.text, c.isCorrect ? 1 : 0);
    }
  }
}

console.log("=== Integrity checks ===\n");

const subjectCount = db.prepare("SELECT COUNT(*) AS n FROM subjects").get().n;
const examCount = db.prepare("SELECT COUNT(*) AS n FROM exams").get().n;
const questionCount = db.prepare("SELECT COUNT(*) AS n FROM questions").get().n;
const choiceCount = db.prepare("SELECT COUNT(*) AS n FROM choices").get().n;
console.log(`Subjects: ${subjectCount}, Exams: ${examCount}, Questions: ${questionCount}, Choices: ${choiceCount}`);

// Every question should have exactly 4 choices and exactly 1 correct choice.
const badChoiceCounts = db
  .prepare(
    `SELECT q.id, COUNT(*) as n FROM questions q JOIN choices c ON c.question_id = q.id
     GROUP BY q.id HAVING n != 4`
  )
  .all();
console.log(`Questions without exactly 4 choices: ${badChoiceCounts.length}`);

const badCorrectCounts = db
  .prepare(
    `SELECT q.id, SUM(c.is_correct) as n FROM questions q JOIN choices c ON c.question_id = q.id
     GROUP BY q.id HAVING n != 1`
  )
  .all();
console.log(`Questions without exactly 1 correct choice: ${badCorrectCounts.length}`);

// Sample: per-subject question counts (the kind of aggregate query the
// real app's stats dashboard will run against Postgres).
console.log("\nPer-subject breakdown:");
db.prepare(
  `SELECT s.name, e.title, COUNT(q.id) as questions
   FROM subjects s
   JOIN exams e ON e.subject_id = s.id
   JOIN questions q ON q.exam_id = e.id
   GROUP BY e.id`
)
  .all()
  .forEach((row) => console.log(`  - ${row.name} / ${row.title}: ${row.questions} questions`));

// Sample question with a joined correct-answer lookup — same shape as
// what an exam review page needs.
console.log("\nSample question with correct answer:");
const sample = db
  .prepare(
    `SELECT q.text, q.image_url, c.text as correct_answer
     FROM questions q JOIN choices c ON c.question_id = q.id AND c.is_correct = 1
     WHERE q.image_url IS NOT NULL LIMIT 1`
  )
  .get();
console.log(sample);

db.close();
console.log("\nVerification complete.");
