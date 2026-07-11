import { redirect } from "next/navigation";

/** Config legado removido — tudo em Integrações. */
export default function ConfigRedirectPage() {
  redirect("/dashboard/integracoes");
}
