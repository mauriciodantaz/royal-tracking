import {
  AppSidebar,
  MobileHeader,
} from "@/components/layout/app-shell";
import { auth } from "@/auth";

/** Painel lê Postgres em runtime — nunca prerender no build (sem host postgres). */
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const showUsersNav = session?.user?.role === "super_admin";

  return (
    <div className="flex min-h-svh w-full">
      <AppSidebar showUsersNav={showUsersNav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader showUsersNav={showUsersNav} />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
