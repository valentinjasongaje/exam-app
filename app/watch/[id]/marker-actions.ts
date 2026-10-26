"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseTime } from "@/lib/timestamps";

export type Marker = { id: string; seconds: number; label: string };
type Result = { error: string } | { marker: Marker };

const clean = (label: string) => label.trim().replace(/^[-–—:·]\s*/, "").slice(0, 300);

async function userId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

function refresh(videoId: string) {
  revalidatePath(`/watch/${videoId}`);
  revalidatePath("/notes", "layout");
}

export async function addMarkerAction(videoId: string, seconds: number, label: string): Promise<Result> {
  const uid = await userId();
  if (!uid) return { error: "Not logged in." };
  const video = await prisma.studyVideo.findFirst({ where: { id: videoId, userId: uid }, select: { id: true } });
  if (!video) return { error: "Video not found." };
  const text = clean(label);
  if (!text) return { error: "Write what this part is about." };
  const m = await prisma.videoMarker.create({
    data: { userId: uid, videoId, seconds: Math.max(0, Math.floor(seconds)), label: text },
  });
  refresh(videoId);
  return { marker: { id: m.id, seconds: m.seconds, label: m.label } };
}

export async function updateMarkerAction(id: string, seconds: number, label: string): Promise<Result> {
  const uid = await userId();
  if (!uid) return { error: "Not logged in." };
  const text = clean(label);
  if (!text) return { error: "Write what this part is about." };
  const found = await prisma.videoMarker.findFirst({ where: { id, userId: uid } });
  if (!found) return { error: "Not found." };
  const m = await prisma.videoMarker.update({ where: { id }, data: { seconds: Math.max(0, Math.floor(seconds)), label: text } });
  refresh(found.videoId);
  return { marker: { id: m.id, seconds: m.seconds, label: m.label } };
}

export async function deleteMarkerAction(id: string) {
  const uid = await userId();
  if (!uid) return;
  const found = await prisma.videoMarker.findFirst({ where: { id, userId: uid } });
  if (!found) return;
  await prisma.videoMarker.delete({ where: { id } });
  refresh(found.videoId);
}

const LINE = /^\s*\[((?:\d{1,2}:)?\d{1,2}:\d{2})\]\s*(.*)$/;

/**
 * One-time cleanup for notes written before the timeline existed: lines that
 * start with "[m:ss]" move from the note's text into this video's timeline.
 * Returns the new markers and note text.
 */
export async function moveTimestampsToTimelineAction(videoId: string, noteId: string) {
  const uid = await userId();
  if (!uid) return { error: "Not logged in." } as const;
  const [video, note] = await Promise.all([
    prisma.studyVideo.findFirst({ where: { id: videoId, userId: uid }, select: { id: true } }),
    prisma.studyNote.findFirst({ where: { id: noteId, userId: uid } }),
  ]);
  if (!video || !note) return { error: "Not found." } as const;

  const keep: string[] = [];
  const found: { seconds: number; label: string }[] = [];
  for (const line of note.body.split("\n")) {
    const m = line.match(LINE);
    if (m) found.push({ seconds: parseTime(m[1]), label: m[2] });
    else keep.push(line);
  }
  const items = found.map((f) => ({ ...f, label: clean(f.label) || "(no title)" }));
  if (items.length === 0) return { error: "No timestamped lines found." } as const;

  const body = keep.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  await prisma.$transaction([
    prisma.videoMarker.createMany({ data: items.map((f) => ({ userId: uid, videoId, seconds: f.seconds, label: f.label })) }),
    prisma.studyNote.update({ where: { id: note.id }, data: { body } }),
  ]);
  const markers = await prisma.videoMarker.findMany({ where: { userId: uid, videoId }, orderBy: { seconds: "asc" } });
  refresh(videoId);
  return { markers: markers.map((m) => ({ id: m.id, seconds: m.seconds, label: m.label })), body } as const;
}
