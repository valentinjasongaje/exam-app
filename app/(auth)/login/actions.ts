"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";

export type LoginState = { error: string | null };

export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw err;
  }

  return { error: null };
}
