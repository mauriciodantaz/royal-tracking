import type { NextAuthConfig } from "next-auth";

import type { UserRole } from "@/lib/db/types";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const path = request.nextUrl.pathname;
      const isDashboard = path.startsWith("/dashboard");
      if (isDashboard) return isLoggedIn;
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.role = (user.role as UserRole | undefined) ?? "manager";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.email = token.email ?? session.user.email;
        session.user.role =
          token.role === "super_admin" ? "super_admin" : "manager";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
