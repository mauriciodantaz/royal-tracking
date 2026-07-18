import { BrandLogo } from "@/components/brand-logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/") ? params.next : "/dashboard";
  const resetOk = params.reset === "1";

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-6 px-4 py-12">
      <BrandLogo className="justify-center" />
      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-xl">Entrar</CardTitle>
          <p className="text-sm text-muted-foreground">
            Acesse o painel com e-mail e senha.
          </p>
        </CardHeader>
        <CardContent>
          <LoginForm nextPath={nextPath} resetOk={resetOk} />
        </CardContent>
      </Card>
    </main>
  );
}
