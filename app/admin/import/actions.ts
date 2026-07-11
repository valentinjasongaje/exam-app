"use server";

import crypto from "crypto";
import { parseExamHtml } from "@/lib/exam-parser";
import { seedExam } from "@/lib/seed-exam";
import { uploadImage } from "@/lib/blob";
import { prisma } from "@/lib/prisma";

type RawImage = { mime: string; ext: string; buffer: Buffer; hash: string } | null;

export type PreviewedImage = { mime: string; dataUrl: string } | null;

export type PreviewedQuestion = {
  order: number;
  sourceItemId: string;
  text: string;
  choices: { label: string; text: string; isCorrect: boolean }[];
  explanation: string | null;
  image: PreviewedImage;
  explanationImage: PreviewedImage;
};

export type PreviewedExam = {
  subject: { name: string; slug: string };
  exam: {
    title: string;
    slug: string;
    sourceFile: string;
    sourceTag: string | null;
    isBoardExam: boolean;
  };
  questions: PreviewedQuestion[];
  issues: unknown[];
};

export type PreviewState = { exams: PreviewedExam[]; error: string | null };

function toDataUrl(image: RawImage): PreviewedImage {
  if (!image) return null;
  return {
    mime: image.mime,
    dataUrl: `data:${image.mime};base64,${image.buffer.toString("base64")}`,
  };
}

/** Parses uploaded HTML files in-memory. Nothing is written to the database yet. */
export async function previewImportAction(
  _prevState: PreviewState,
  formData: FormData
): Promise<PreviewState> {
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length === 0) return { exams: [], error: "Choose at least one HTML file." };

  const exams: PreviewedExam[] = [];
  for (const file of files) {
    const html = await file.text();
    const parsed = parseExamHtml(html, file.name);
    exams.push({
      subject: parsed.subject,
      exam: { ...parsed.exam, isBoardExam: false },
      issues: parsed.issues,
      questions: parsed.questions.map(
        (q: {
          order: number;
          sourceItemId: string;
          text: string;
          choices: { label: string; text: string; isCorrect: boolean }[];
          explanation: string | null;
          image: RawImage;
          explanationImage: RawImage;
        }) => ({
          order: q.order,
          sourceItemId: q.sourceItemId,
          text: q.text,
          choices: q.choices,
          explanation: q.explanation,
          image: toDataUrl(q.image),
          explanationImage: toDataUrl(q.explanationImage),
        })
      ),
    });
  }

  return { exams, error: null };
}

function fromDataUrl(image: PreviewedImage) {
  if (!image) return null;
  const match = /^data:(.+?);base64,([\s\S]+)$/.exec(image.dataUrl);
  if (!match) return null;
  const [, mime, base64] = match;
  const ext = mime.split("/")[1] || "bin";
  return { mime, ext, buffer: Buffer.from(base64, "base64") };
}

export type CommitResult = { exam: string; subject: string; questionCount: number };

/**
 * Uploads any images to Vercel Blob and upserts the (possibly
 * admin-edited) exam data into the database via lib/seed-exam.js —
 * the same upsert-by-slug/sourceItemId semantics the CLI seed script
 * uses, so re-importing an already-imported exam updates it in place.
 */
export async function commitImportAction(exams: PreviewedExam[]): Promise<CommitResult[]> {
  const results: CommitResult[] = [];

  for (const parsed of exams) {
    const questions = await Promise.all(
      parsed.questions.map(async (q) => {
        const image = fromDataUrl(q.image);
        const explanationImage = fromDataUrl(q.explanationImage);
        const [imageUrl, explanationImageUrl] = await Promise.all([
          image
            ? uploadImage(
                image.buffer,
                `${q.sourceItemId}-${crypto.randomUUID()}.${image.ext}`,
                image.mime
              )
            : null,
          explanationImage
            ? uploadImage(
                explanationImage.buffer,
                `${q.sourceItemId}-explanation-${crypto.randomUUID()}.${explanationImage.ext}`,
                explanationImage.mime
              )
            : null,
        ]);

        return {
          order: q.order,
          sourceItemId: q.sourceItemId,
          text: q.text,
          choices: q.choices,
          explanation: q.explanation,
          imageUrl,
          explanationImageUrl,
        };
      })
    );

    const result = await seedExam(prisma, {
      subject: parsed.subject,
      exam: parsed.exam,
      questions,
    });
    results.push(result);
  }

  return results;
}
