import {
  AppSidebar,
  MobileHeader,
} from "@/components/layout/app-shell";
import { auth } from "@/auth";
import { getPlatformName } from "@/lib/env";
import { getVersionStatus } from "@/lib/version/status";

/** Painel lê Postgres em runtime — nunca prerender no build (sem host postgres). */
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const showUsersNav = session?.user?.role === "super_admin";
  const versionStatus = await getVersionStatus();
  const platformName = getPlatformName();

  return (
    <div className="flex min-h-svh w-full">
      <AppSidebar
        showUsersNav={showUsersNav}
        versionStatus={versionStatus}
        platformName={platformName}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader
          showUsersNav={showUsersNav}
          versionStatus={versionStatus}
          platformName={platformName}
        />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
