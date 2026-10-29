import { prisma } from "@/lib/prisma";

/**
 * Who may sign in: the admin (ADMIN_EMAIL, or anyone already an ADMIN) and
 * emails the admin approved. Everyone else is turned away at sign-in and
 * recorded as an access request the admin can approve.
 */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function isAllowed(email: string) {
  const e = normalizeEmail(email);
  if (e === process.env.ADMIN_EMAIL?.trim().toLowerCase()) return true;
  const [allowed, admin] = await Promise.all([
    prisma.allowedEmail.findUnique({ where: { email: e } }),
    prisma.user.findFirst({ where: { email: { equals: e, mode: "insensitive" }, role: "ADMIN" }, select: { id: true } }),
  ]);
  return !!allowed || !!admin;
}

export async function recordAccessRequest(email: string, name: string | null | undefined) {
  const e = normalizeEmail(email);
  await prisma.accessRequest.upsert({
    where: { email: e },
    create: { email: e, name: name ?? null },
    update: { lastTriedAt: new Date(), ...(name ? { name } : {}) },
  });
}
