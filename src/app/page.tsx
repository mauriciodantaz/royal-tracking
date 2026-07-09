import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-3">
        <p className="text-sm font-medium text-primary">Tracking</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Captura server-side com painel
        </h1>
        <p className="max-w-xl text-muted-foreground">
          Identify, eventos, CAPI Meta, GA4 e webhook de compra — com
          credenciais multi-conta no banco e dashboard autenticado.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button render={<Link href="/dashboard" />}>Abrir painel</Button>
        <Button variant="outline" render={<Link href="/login" />}>
          Entrar
        </Button>
      </div>
    </main>
  );
}
