import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-12">
      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-xl">Entrar</CardTitle>
          <p className="text-sm text-muted-foreground">
            Auth Supabase — implementação na Fase 4. Cadastro público
            desligado.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="voce@empresa.com"
              disabled
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              disabled
            />
          </div>
          <Button className="w-full" disabled>
            Entrar
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            render={<Link href="/dashboard" />}
          >
            Ir ao painel (dev)
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
