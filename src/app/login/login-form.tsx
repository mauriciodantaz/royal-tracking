"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "./actions";

export function LoginForm({
  nextPath,
  resetOk,
}: {
  nextPath: string;
  resetOk?: boolean;
}) {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={nextPath || "/dashboard"} />
      {resetOk ? (
        <p className="text-sm text-muted-foreground" role="status">
          Senha definida. Entre com seu e-mail e a nova senha.
        </p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="voce@empresa.com"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {state?.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </Button>
      <p className="text-center text-sm">
        <Link
          href="/esqueci-senha"
          className="text-primary underline-offset-4 hover:underline"
        >
          Esqueci a senha
        </Link>
      </p>
    </form>
  );
}
