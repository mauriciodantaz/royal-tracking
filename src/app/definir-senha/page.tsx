import { BrandLogo } from "@/components/brand-logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SetPasswordForm } from "./set-password-form";

export default async function DefinirSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = params.token?.trim() ?? "";

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-6 px-4 py-12">
      <BrandLogo className="justify-center" />
      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-xl">Definir senha</CardTitle>
          <p className="text-sm text-muted-foreground">
            Escolha uma senha para acessar o painel (mínimo 8 caracteres).
          </p>
        </CardHeader>
        <CardContent>
          <SetPasswordForm token={token} />
        </CardContent>
      </Card>
    </main>
  );
}
