"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { TRACKER_SUBJECTS } from "@/lib/study-plan";

export type SettingsState = { error: string | null; success?: boolean };

export async function updateSettingsAction(
  _prevState: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const session = await auth();
  if (!session?.user) return { error: "Not logged in." };

  const preferredLayout =
    formData.get("preferredLayout") === "ONE_AT_A_TIME" ? "ONE_AT_A_TIME" : "ALL_AT_ONCE";
  const shuffleEnabled = formData.get("shuffleEnabled") === "on";
  const instantFeedback = formData.get("instantFeedback") === "on";

  await prisma.user.update({
    where: { id: session.user.id },
    data: { preferredLayout, shuffleEnabled, instantFeedback },
  });

  revalidatePath("/settings");
  return { error: null, success: true };
}

/** Weekly study targets per subject (hours in the form, minutes stored); 0/blank = no target. */
export async function updateWeeklyTargetsAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const session = await auth();
  if (!session?.user) return { error: "Not logged in." };
  const targets: Record<string, number> = {};
  for (const { slug } of TRACKER_SUBJECTS) {
    const raw = String(formData.get(slug) ?? "").trim();
    if (!raw) continue;
    const hours = Number(raw);
    if (!Number.isFinite(hours) || hours < 0 || hours > 80) return { error: "Hours must be between 0 and 80." };
    if (hours > 0) targets[slug] = Math.round(hours * 60);
  }
  await prisma.user.update({ where: { id: session.user.id }, data: { weeklyTargets: targets } });
  revalidatePath("/settings");
  revalidatePath("/calendar");
  revalidatePath("/daily");
  return { error: null, success: true };
}
