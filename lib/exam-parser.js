/**
 * Shared parsing logic for the scraped reviewer HTML format. Used by both
 * scripts/parse-html.js (CLI, persists images to data/parsed/images/) and
 * the admin web-upload import flow (persists images to Vercel Blob
 * instead). This module never touches the filesystem or a database — it
 * just turns an HTML string into structured data, with embedded images
 * returned as in-memory buffers for the caller to persist wherever it
 * wants.
 */

const crypto = require("crypto");
const cheerio = require("cheerio");
const slugify = require("slugify");

const EXT_BY_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/** Decode a base64 data URI into a buffer + metadata (no disk/network I/O). */
function decodeBase64Image(dataUri) {
  const match = /^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/s.exec(dataUri.trim());
  if (!match) return null;
  const [, mime, base64] = match;
  const ext = EXT_BY_MIME[mime.toLowerCase()] || "bin";
  const buffer = Buffer.from(base64, "base64");
  const hash = crypto.createHash("sha1").update(buffer).digest("hex").slice(0, 16);
  return { mime, ext, buffer, hash };
}

/**
 * Given a cheerio element, strip out the given child selectors, pull out
 * any base64 <img> tags (decoded but not persisted), and return the
 * remaining plain text plus the decoded images.
 */
function extractTextAndImages($, el, stripSelectors = []) {
  const $clone = $(el).clone();
  stripSelectors.forEach((sel) => $clone.find(sel).remove());

  const images = [];
  $clone.find('img[src^="data:image"]').each((_, img) => {
    const decoded = decodeBase64Image($(img).attr("src"));
    if (decoded) images.push(decoded);
  });
  $clone.find("img").remove();

  const text = $clone
    .text()
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

  return { text, images };
}

function deriveSubjectName(title) {
  const trailingPatterns = [
    /\s*-\s*Test\s*\d+\s*$/i,
    /\s*Pre[- ]?Board\s*Exam\s*\d+\s*$/i,
    /\s*Board\s*Exam\s*\d+\s*$/i,
    /\s*Exam\s*\d+\s*$/i,
    /\s*Quiz\s*\d+\s*$/i,
    /\s*Test\s*\d+\s*$/i,
  ];
  for (const pattern of trailingPatterns) {
    if (pattern.test(title)) return title.replace(pattern, "").trim();
  }
  return title.trim();
}

/**
 * Parse one scraped exam HTML document. `filename` is only used for
 * traceability (stored as Exam.sourceFile) and error messages.
 *
 * Returns { subject, exam, questions, issues } where each question's
 * `image`/`explanationImage` is either null or { mime, ext, buffer, hash }
 * — the caller decides how (and whether) to persist it.
 */
function parseExamHtml(html, filename) {
  const $ = cheerio.load(html);

  const title = ($("h1").first().text() || $("title").first().text() || filename).trim();
  const subjectName = deriveSubjectName(title);

  const issues = [];
  const questions = [];
  let examSourceTag = null;

  const cards = $("questions .card.card-widget, #question .card.card-widget").toArray();

  cards.forEach((card, index) => {
    const $card = $(card);
    const commentText = $card.find(".comment-text").first();
    const firstInput = $card.find("input.question-answer").first();
    const sourceItemId = firstInput.attr("data-item");
    const sourceTag = firstInput.attr("data-id");

    if (!sourceItemId) {
      issues.push({ type: "missing-item-id", cardIndex: index });
      return;
    }
    if (examSourceTag === null && sourceTag) examSourceTag = sourceTag;

    // Question stem: everything in .comment-text except the "Question N"
    // header and the choices form.
    const { text: questionText, images: questionImages } = extractTextAndImages(
      $,
      commentText,
      [".username", ".form-group"]
    );

    // Choices, in DOM order (always rendered A, B, C, D...).
    const choiceInputs = $card.find("input.question-answer").toArray();
    const choices = choiceInputs.map((input, i) => ({
      label: String.fromCharCode(65 + i),
      text: ($(input).attr("value") || "").trim(),
    }));

    // Cross-reference the answer-key table for the correct answer + solution.
    const row = $(`table#answer tr[data-id="${sourceItemId}"]`).first();
    let answerText = null;
    let explanation = null;
    let explanationImages = [];

    if (row.length) {
      answerText = row.find("td").eq(2).text().trim();

      const solutionBody = row.find(`#solution${sourceItemId} .card-body`).first();
      if (solutionBody.length) {
        const { text, images } = extractTextAndImages($, solutionBody);
        const cleanedText = text
          .split("\n")
          .filter((line) => line.trim().toLowerCase() !== "solution:")
          .join("\n")
          .trim();
        if (cleanedText || images.length) {
          explanation = cleanedText || null;
          explanationImages = images;
        }
      }
    } else {
      issues.push({ type: "no-answer-row", sourceItemId });
    }

    const normalize = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();

    let matchedChoice = null;
    if (answerText) {
      matchedChoice = choices.find(
        (c) => normalize(c.text) === normalize(answerText)
      );
      if (!matchedChoice) {
        issues.push({
          type: "answer-not-matched",
          sourceItemId,
          answerText,
          choiceTexts: choices.map((c) => c.text),
        });
      }
    }

    choices.forEach((c) => {
      c.isCorrect = !!matchedChoice && c.label === matchedChoice.label;
    });

    questions.push({
      order: index + 1,
      sourceItemId,
      text: questionText,
      image: questionImages[0] || null,
      choices,
      explanation,
      explanationImage: explanationImages[0] || null,
    });
  });

  const subjectSlug = slugify(subjectName, { lower: true, strict: true });
  const examSlug = slugify(title, { lower: true, strict: true });

  return {
    subject: { name: subjectName, slug: subjectSlug },
    exam: {
      title,
      slug: examSlug,
      sourceFile: filename,
      sourceTag: examSourceTag,
    },
    questions,
    issues,
  };
}

module.exports = { parseExamHtml, deriveSubjectName };
