"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  setPasswordAction,
  type SetPasswordResult,
} from "@/app/definir-senha/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    setPasswordAction,
    undefined as SetPasswordResult | undefined
  );

  if (!token) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">Link inválido ou expirado.</p>
        <p className="text-center text-sm">
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Ir ao login
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-2">
        <Label htmlFor="password">Nova senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirmar senha</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </div>
      {state?.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Salvando…" : "Definir senha"}
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          Voltar ao login
        </Link>
      </p>
    </form>
  );
}
