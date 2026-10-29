"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/access";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") throw new Error("Admin only.");
  return session.user;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function approveEmailAction(formData: FormData) {
  await requireAdmin();
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  if (!EMAIL.test(email)) return;
  await prisma.$transaction([
    prisma.allowedEmail.upsert({ where: { email }, create: { email }, update: {} }),
    prisma.accessRequest.deleteMany({ where: { email } }),
  ]);
  revalidatePath("/admin/users");
}

export async function dismissRequestAction(formData: FormData) {
  await requireAdmin();
  await prisma.accessRequest.deleteMany({ where: { email: normalizeEmail(String(formData.get("email") ?? "")) } });
  revalidatePath("/admin/users");
}

/** Removes access; a signed-in session for that email ends within about 5 minutes. */
export async function revokeEmailAction(formData: FormData) {
  const me = await requireAdmin();
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  if (email === me.email?.toLowerCase()) return; // can't lock yourself out
  await prisma.allowedEmail.deleteMany({ where: { email } });
  revalidatePath("/admin/users");
}
