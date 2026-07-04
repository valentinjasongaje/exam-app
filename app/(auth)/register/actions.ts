"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/auth";

export type RegisterState = { error: string | null };

export async function registerAction(
  _prevState: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const name = String(formData.get("name") || "").trim() || null;

  if (!email || !password) return { error: "Email and password are required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "An account with that email already exists." };

  const passwordHash = await bcrypt.hash(password, 10);
  const isAdmin = email === process.env.ADMIN_EMAIL?.trim().toLowerCase();

  await prisma.user.create({
    data: { email, passwordHash, name, role: isAdmin ? "ADMIN" : "USER" },
  });

  await signIn("credentials", {
    email,
    password,
    redirectTo: isAdmin ? "/admin" : "/dashboard",
  });

  return { error: null };
}
