import NextAuth, { type Session } from "next-auth";
import Google from "next-auth/providers/google";
import type { JWT } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { isAllowed, recordAccessRequest } from "@/lib/access";

/** How often a signed-in session re-checks that its email is still approved. */
const ACCESS_RECHECK_MS = 5 * 60_000;

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      // Only approved emails get in; anyone else is recorded so the admin can approve them.
      if (!(await isAllowed(user.email))) {
        await recordAccessRequest(user.email, user.name).catch(() => {});
        return "/login?error=NotApproved";
      }

      const isAdmin = user.email.toLowerCase() === process.env.ADMIN_EMAIL?.trim().toLowerCase();
      await prisma.user.upsert({
        where: { email: user.email },
        update: { name: user.name },
        create: {
          email: user.email,
          name: user.name,
          role: isAdmin ? "ADMIN" : "USER",
        },
      });

      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({ where: { email: user.email } });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
        }
        token.accessCheckedAt = Date.now();
        return token;
      }
      // Removed from the approved list? End the session (checked every few minutes).
      if (token.email && Date.now() - (token.accessCheckedAt ?? 0) > ACCESS_RECHECK_MS) {
        if (!(await isAllowed(token.email))) return null;
        token.accessCheckedAt = Date.now();
      }
      return token;
    },
    session({ session, token }: { session: Session; token: JWT }) {
      session.user.id = token.id;
      session.user.role = token.role;
      return session;
    },
  },
});
