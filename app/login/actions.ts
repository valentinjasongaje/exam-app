"use server";

import { signIn } from "@/auth";

export async function googleSignInAction() {
  await signIn("google", { redirectTo: "/dashboard" });
}
