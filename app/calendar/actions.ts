"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { CalendarEventKind } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { addDays, isValidYmd, toDbDate, todayLocal } from "@/lib/study-plan";
import { loadOverrides } from "@/lib/calendar-data";
import {
  DND_END,
  DND_EVENT_TITLE,
  DND_START,
  dndNightPlan,
  isValidTime,
  ptkToFridayOverrides,
  templateBlocks,
  toMinutes,
  weekdayIndex,
  type OverrideInput,
} from "@/lib/schedule";

export type FormState = { error: string | null; success?: boolean };

const KINDS: CalendarEventKind[] = ["EVENT", "DEADLINE", "BUSY"];

async function requireUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function refresh() {
  revalidatePath("/calendar");
  revalidatePath("/tracker", "layout");
}

function blockExists(date: string, blockKey: string) {
  return isValidYmd(date) && templateBlocks(date).some((b) => b.key === blockKey);
}

// ---------- plan block adjustments ----------

export async function skipBlockAction(formData: FormData) {
  const userId = await requireUserId();
  if (!userId) return;
  const date = str(formData, "date");
  const blockKey = str(formData, "blockKey");
  if (!blockExists(date, blockKey)) return;
  await prisma.scheduleOverride.upsert({
    where: { userId_date_blockKey: { userId, date: toDbDate(date), blockKey } },
    create: { userId, date: toDbDate(date), blockKey, action: "SKIP" },
    update: { action: "SKIP", newDate: null, newStart: null, newEnd: null },
  });
  refresh();
}

export async function restoreBlockAction(formData: FormData) {
  const userId = await requireUserId();
  if (!userId) return;
  const date = str(formData, "date");
  const blockKey = str(formData, "blockKey");
  if (!isValidYmd(date)) return;
  await prisma.scheduleOverride.deleteMany({ where: { userId, date: toDbDate(date), blockKey } });
  refresh();
}

export async function moveBlockAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not logged in." };
  const date = str(formData, "date");
  const blockKey = str(formData, "blockKey");
  const newDate = str(formData, "newDate");
  const newStart = str(formData, "newStart");
  const newEnd = str(formData, "newEnd");

  if (!blockExists(date, blockKey)) return { error: "That block isn't on the plan for this day." };
  if (!isValidYmd(newDate)) return { error: "Pick a day to move it to." };
  if (!isValidTime(newStart) || !isValidTime(newEnd)) return { error: "Enter start and end times." };
  if (toMinutes(newEnd) <= toMinutes(newStart)) return { error: "End time must be after the start." };
  if (Math.abs(toDbDate(newDate).getTime() - toDbDate(date).getTime()) > 14 * 86_400_000)
    return { error: "Move it within two weeks of the original day." };

  await prisma.scheduleOverride.upsert({
    where: { userId_date_blockKey: { userId, date: toDbDate(date), blockKey } },
    create: { userId, date: toDbDate(date), blockKey, action: "MOVE", newDate: toDbDate(newDate), newStart, newEnd },
    update: { action: "MOVE", newDate: toDbDate(newDate), newStart, newEnd },
  });
  refresh();
  return { error: null, success: true };
}

/** One tap for the common case: PTK online class moves from Tuesday to Friday. */
export async function ptkToFridayAction(formData: FormData) {
  const userId = await requireUserId();
  if (!userId) return;
  const tuesday = str(formData, "tuesday");
  if (!isValidYmd(tuesday) || weekdayIndex(tuesday) !== 1) return;
  if (!blockExists(tuesday, "tue-ptk") || !blockExists(addDays(tuesday, 3), "fri-eve")) return;

  await prisma.$transaction(
    ptkToFridayOverrides(tuesday).map((o) =>
      prisma.scheduleOverride.upsert({
        where: { userId_date_blockKey: { userId, date: toDbDate(o.date), blockKey: o.blockKey } },
        create: {
          userId,
          date: toDbDate(o.date),
          blockKey: o.blockKey,
          action: "MOVE",
          newDate: toDbDate(o.newDate!),
          newStart: o.newStart,
          newEnd: o.newEnd,
        },
        update: { action: "MOVE", newDate: toDbDate(o.newDate!), newStart: o.newStart, newEnd: o.newEnd },
      })
    )
  );
  refresh();
}

export async function undoPtkToFridayAction(formData: FormData) {
  const userId = await requireUserId();
  if (!userId) return;
  const tuesday = str(formData, "tuesday");
  if (!isValidYmd(tuesday)) return;
  await prisma.scheduleOverride.deleteMany({
    where: {
      userId,
      OR: [
        { date: toDbDate(tuesday), blockKey: "tue-ptk" },
        { date: toDbDate(addDays(tuesday, 3)), blockKey: "fri-eve" },
      ],
    },
  });
  refresh();
}

// ---------- D&D night ----------

function upsertOverride(userId: string, o: OverrideInput) {
  const data = {
    action: o.action,
    newDate: o.newDate ? toDbDate(o.newDate) : null,
    newStart: o.newStart,
    newEnd: o.newEnd,
  };
  return prisma.scheduleOverride.upsert({
    where: { userId_date_blockKey: { userId, date: toDbDate(o.date), blockKey: o.blockKey } },
    create: { userId, date: toDbDate(o.date), blockKey: o.blockKey, ...data },
    update: data,
  });
}

/** Office D&D game (Thu/Fri 8–11pm): mark the night busy and move that evening's drill to Saturday. */
export async function dndNightAction(formData: FormData) {
  const userId = await requireUserId();
  if (!userId) return;
  const day = str(formData, "day");
  if (!isValidYmd(day)) return;
  const plan = dndNightPlan(day, await loadOverrides(userId));
  if (!plan) return;

  const already = await prisma.calendarEvent.findFirst({
    where: { userId, date: toDbDate(day), title: DND_EVENT_TITLE, kind: "BUSY" },
  });

  await prisma.$transaction([
    ...(already
      ? []
      : [
          prisma.calendarEvent.create({
            data: { userId, date: toDbDate(day), title: DND_EVENT_TITLE, kind: "BUSY", start: DND_START, end: DND_END },
          }),
        ]),
    ...(plan.drill ? [upsertOverride(userId, plan.drill)] : []),
    ...(plan.skipSatEve ? [upsertOverride(userId, plan.skipSatEve)] : []),
  ]);
  refresh();
}

export async function undoDndNightAction(formData: FormData) {
  const userId = await requireUserId();
  if (!userId) return;
  const day = str(formData, "day");
  const wd = isValidYmd(day) ? weekdayIndex(day) : -1;
  if (wd !== 3 && wd !== 4) return;
  const saturday = addDays(day, 5 - wd);
  const drillKey = wd === 3 ? "thu-eve" : "fri-eve";

  await prisma.$transaction(async (tx) => {
    await tx.calendarEvent.deleteMany({
      where: { userId, date: toDbDate(day), title: DND_EVENT_TITLE, kind: "BUSY" },
    });
    await tx.scheduleOverride.deleteMany({
      where: { userId, date: toDbDate(day), blockKey: drillKey, action: "MOVE", newDate: toDbDate(saturday) },
    });
    // Bring Saturday's light review back unless the other night's drill is still parked there.
    const stillMovedIn = await tx.scheduleOverride.count({
      where: { userId, action: "MOVE", newDate: toDbDate(saturday), blockKey: { in: ["thu-eve", "fri-eve"] } },
    });
    if (stillMovedIn === 0) {
      await tx.scheduleOverride.deleteMany({
        where: { userId, date: toDbDate(saturday), blockKey: "sat-eve", action: "SKIP" },
      });
    }
  });
  refresh();
}

// ---------- one-off events ----------

export async function addEventAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not logged in." };
  const date = str(formData, "date");
  const title = str(formData, "title");
  const kind = (str(formData, "kind") || "EVENT") as CalendarEventKind;
  const start = str(formData, "start") || null;
  const end = str(formData, "end") || null;
  const note = str(formData, "note") || null;

  if (!isValidYmd(date)) return { error: "Pick a date." };
  if (!title) return { error: "Give the event a title." };
  if (title.length > 200) return { error: "Keep the title under 200 characters." };
  if (!KINDS.includes(kind)) return { error: "Pick a type." };
  if (start && !isValidTime(start)) return { error: "Start time looks wrong." };
  if (end && !isValidTime(end)) return { error: "End time looks wrong." };
  if (end && !start) return { error: "Add a start time, or clear the end time for an all-day event." };
  if (start && end && toMinutes(end) <= toMinutes(start)) return { error: "End time must be after the start." };

  await prisma.calendarEvent.create({
    data: { userId, date: toDbDate(date), title, kind, start, end, note },
  });
  refresh();
  return { error: null, success: true };
}

export async function deleteEventAction(formData: FormData) {
  const userId = await requireUserId();
  if (!userId) return;
  await prisma.calendarEvent.deleteMany({ where: { id: str(formData, "id"), userId } });
  refresh();
}

// ---------- spaced reviews ----------

export async function completeReminderAction(formData: FormData) {
  const userId = await requireUserId();
  if (!userId) return;
  await prisma.reviewReminder.updateMany({
    where: { id: str(formData, "id"), userId, doneAt: null },
    data: { doneAt: new Date() },
  });
  refresh();
}

export async function snoozeReminderAction(formData: FormData) {
  const userId = await requireUserId();
  if (!userId) return;
  await prisma.reviewReminder.updateMany({
    where: { id: str(formData, "id"), userId, doneAt: null },
    data: { dueDate: toDbDate(addDays(todayLocal(), 1)) },
  });
  refresh();
}

// ---------- Google Calendar feed ----------

export async function enableFeedAction() {
  const userId = await requireUserId();
  if (!userId) return;
  await prisma.user.update({
    where: { id: userId },
    data: { calendarToken: randomBytes(24).toString("base64url") },
  });
  revalidatePath("/calendar");
}

export async function disableFeedAction() {
  const userId = await requireUserId();
  if (!userId) return;
  await prisma.user.update({ where: { id: userId }, data: { calendarToken: null } });
  revalidatePath("/calendar");
}
