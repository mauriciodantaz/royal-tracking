import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { authConfig } from "@/auth.config";
import { ensureDbReady } from "@/lib/db/boot";
import { queryOne } from "@/lib/db/pool";
import type { UserRow } from "@/lib/db/types";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        await ensureDbReady();
        const email = parsed.data.email.trim().toLowerCase();
        const user = await queryOne<UserRow>(
          `select * from users where email = $1 limit 1`,
          [email]
        );
        if (!user || !user.active || !user.password_hash) return null;

        const ok = await bcrypt.compare(
          parsed.data.password,
          user.password_hash
        );
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          role: user.role,
        };
      },
    }),
  ],
  trustHost: true,
});
