import { LinksClient } from "@/app/dashboard/links/links-client";
import { ensureDbReady } from "@/lib/db/boot";
import { listTrackedLinks } from "@/lib/tracking/tracked-links";

export const dynamic = "force-dynamic";

function publicBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    ""
  );
}

export default async function LinksPage() {
  let links: Awaited<ReturnType<typeof listTrackedLinks>> = [];
  let error: string | null = null;
  try {
    await ensureDbReady();
    links = await listTrackedLinks();
  } catch (e) {
    error = e instanceof Error ? e.message : "Erro ao carregar links";
  }

  return (
    <LinksClient
      links={links}
      baseUrl={publicBaseUrl()}
      error={error}
    />
  );
}
