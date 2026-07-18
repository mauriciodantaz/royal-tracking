import { BrandLogo } from "@/components/brand-logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotForm } from "./forgot-form";

export default function EsqueciSenhaPage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-6 px-4 py-12">
      <BrandLogo className="justify-center" />
      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-xl">Esqueci a senha</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enviaremos um link por e-mail para gestores. O super admin da stack
            não usa este fluxo.
          </p>
        </CardHeader>
        <CardContent>
          <ForgotForm />
        </CardContent>
      </Card>
    </main>
  );
}
