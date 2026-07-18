"use client";

import { useActionState, useState, useTransition } from "react";

import {
  deleteUserAction,
  inviteUserAction,
  resendInviteAction,
  setUserActiveAction,
  type ActionResult,
} from "@/app/dashboard/usuarios/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { UserRow } from "@/lib/db/types";

type Props = {
  users: UserRow[];
  stackAdminEmail: string;
};

export function UsersClient({ users, stackAdminEmail }: Props) {
  const [inviteState, inviteAction, invitePending] = useActionState(
    inviteUserAction,
    undefined as ActionResult | undefined
  );
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(
    label: string,
    fn: () => Promise<ActionResult>
  ) {
    setFlash(null);
    startTransition(async () => {
      const result = await fn();
      setFlash(result.ok ? label : result.error);
    });
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-lg font-medium">Convidar gestor</h2>
        <p className="text-sm text-muted-foreground">
          O gestor recebe um e-mail com link para definir a senha (SMTP da stack).
        </p>
        <form action={inviteAction} className="grid max-w-lg gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" placeholder="Nome" />
          </div>
          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder="gestor@empresa.com"
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={invitePending}>
              {invitePending ? "Enviando…" : "Convidar"}
            </Button>
          </div>
        </form>
        {inviteState?.ok === false ? (
          <p className="text-sm text-destructive">{inviteState.error}</p>
        ) : null}
        {inviteState?.ok === true ? (
          <p className="text-sm text-muted-foreground">Convite enviado.</p>
        ) : null}
      </section>

      {flash ? (
        <p className="text-sm text-muted-foreground" role="status">
          {flash}
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Usuários</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pr-3">Nome</th>
                <th className="py-2 pr-3">E-mail</th>
                <th className="py-2 pr-3">Papel</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isStack = u.email === stackAdminEmail;
                const isSuper = u.role === "super_admin" || isStack;
                return (
                  <tr key={u.id} className="border-b border-border/40">
                    <td className="py-2 pr-3">{u.name ?? "—"}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{u.email}</td>
                    <td className="py-2 pr-3">
                      {isSuper ? "Super admin" : "Gestor"}
                    </td>
                    <td className="py-2 pr-3">
                      {!u.active
                        ? "Inativo"
                        : u.password_set_at || isSuper
                          ? "Ativo"
                          : "Convite pendente"}
                    </td>
                    <td className="py-2">
                      {isSuper ? (
                        <span className="text-xs text-muted-foreground">
                          Gerenciado pela stack
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {!u.password_set_at ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={pending}
                              onClick={() =>
                                run("Convite reenviado.", () =>
                                  resendInviteAction(u.id)
                                )
                              }
                            >
                              Reenviar convite
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() =>
                              run(
                                u.active ? "Usuário desativado." : "Usuário ativado.",
                                () => setUserActiveAction(u.id, !u.active)
                              )
                            }
                          >
                            {u.active ? "Desativar" : "Ativar"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={pending}
                            onClick={() => {
                              if (
                                !confirm(
                                  `Excluir ${u.email}? Esta ação não pode ser desfeita.`
                                )
                              ) {
                                return;
                              }
                              run("Usuário excluído.", () =>
                                deleteUserAction(u.id)
                              );
                            }}
                          >
                            Excluir
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
