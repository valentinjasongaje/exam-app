"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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
