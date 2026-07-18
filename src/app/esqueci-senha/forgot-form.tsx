"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  forgotPasswordAction,
  type ForgotResult,
} from "@/app/esqueci-senha/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotForm() {
  const [state, formAction, pending] = useActionState(
    forgotPasswordAction,
    undefined as ForgotResult | undefined
  );

  return (
    <form action={formAction} className="space-y-4">
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
      {state?.message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Enviando…" : "Enviar link"}
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          Voltar ao login
        </Link>
      </p>
    </form>
  );
}
