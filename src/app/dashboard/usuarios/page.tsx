import { redirect } from "next/navigation";

import { UsersClient } from "@/app/dashboard/usuarios/users-client";
import { auth } from "@/auth";
import { Card, CardContent } from "@/components/ui/card";
import { getStackAdminEmail } from "@/lib/auth/super-admin";
import { ensureDbReady } from "@/lib/db/boot";
import { query } from "@/lib/db/pool";
import type { UserRow } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "super_admin") {
    redirect("/dashboard");
  }

  let users: UserRow[] = [];
  let error: string | null = null;
  const stackAdminEmail = getStackAdminEmail();

  try {
    await ensureDbReady();
    const result = await query<UserRow>(
      `select * from users order by
         case when role = 'super_admin' then 0 else 1 end,
         created_at asc`
    );
    users = result.rows;
  } catch (e) {
    error = e instanceof Error ? e.message : "Erro ao carregar usuários";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="text-sm text-muted-foreground">
          Gestores com acesso ao painel. O super admin
          {stackAdminEmail ? (
            <>
              {" "}
              (
              <span className="font-mono text-xs">{stackAdminEmail}</span>)
            </>
          ) : null}{" "}
          é definido na instalação e não pode ser alterado aqui.
        </p>
      </div>

      {error ? (
        <Card className="glass border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : (
        <Card className="glass">
          <CardContent className="pt-6">
            <UsersClient users={users} stackAdminEmail={stackAdminEmail} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
