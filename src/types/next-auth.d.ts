import type { DefaultSession } from "next-auth";

import type { UserRole } from "@/lib/db/types";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      role: UserRole;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role?: UserRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
  }
}
