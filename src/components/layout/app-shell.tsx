"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bug,
  Cable,
  FileText,
  Filter,
  LayoutDashboard,
  Link2,
  LogOut,
  Megaphone,
  Receipt,
  Menu,
  UserCog,
  Users,
} from "lucide-react";

import { logoutAction } from "@/app/login/actions";
import { BrandLogo } from "@/components/brand-logo";
import { VersionLabel } from "@/components/layout/version-label";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { VersionStatus } from "@/lib/version/types";

const NAV_BASE = [
  { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
  { href: "/dashboard/integracoes", label: "Integrações", icon: Cable },
  { href: "/dashboard/leads", label: "Leads", icon: Users },
  { href: "/dashboard/links", label: "Links", icon: Link2 },
  { href: "/dashboard/formularios", label: "Formulários", icon: FileText },
  { href: "/dashboard/regras", label: "Regras", icon: Filter },
  { href: "/dashboard/eventos", label: "Eventos", icon: Activity },
  { href: "/dashboard/faturamento", label: "Faturamento", icon: Receipt },
  { href: "/dashboard/campanhas", label: "Campanhas", icon: Megaphone },
] as const;

const REPORT_BUG_URL =
  "https://github.com/mauriciodantaz/royal-tracking/issues/new";

function NavLinks({
  onNavigate,
  showUsersNav,
}: {
  onNavigate?: () => void;
  showUsersNav: boolean;
}) {
  const pathname = usePathname();
  const items = showUsersNav
    ? [
        ...NAV_BASE,
        { href: "/dashboard/usuarios", label: "Usuários", icon: UserCog },
      ]
    : [...NAV_BASE];

  return (
    <nav className="flex flex-col gap-1">
      {items.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/dashboard"
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-[var(--radius)] px-3 text-sm font-medium transition-colors",
              active
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="px-1">
      <BrandLogo />
    </Link>
  );
}

export function AppSidebar({
  showUsersNav,
  versionStatus,
}: {
  showUsersNav: boolean;
  versionStatus: VersionStatus;
}) {
  return (
    <aside className="glass sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r p-4 md:flex">
      <Brand />
      <Separator className="my-4" />
      <NavLinks showUsersNav={showUsersNav} />
      <div className="mt-auto space-y-3 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Tema</span>
          <ThemeToggle />
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground"
          render={
            <a
              href={REPORT_BUG_URL}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          <Bug className="size-4" />
          Reportar bug
        </Button>
        <form action={logoutAction}>
          <Button
            type="submit"
            variant="ghost"
            className="w-full justify-start gap-2 text-muted-foreground"
          >
            <LogOut className="size-4" />
            Sair
          </Button>
        </form>
        <VersionLabel status={versionStatus} />
      </div>
    </aside>
  );
}

export function MobileHeader({
  showUsersNav,
  versionStatus,
}: {
  showUsersNav: boolean;
  versionStatus: VersionStatus;
}) {
  return (
    <header className="glass sticky top-0 z-40 flex h-14 items-center justify-between border-b px-3 md:hidden">
      <Brand />
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <Sheet>
          <SheetTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Abrir menu" />
            }
          >
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent
            side="left"
            className="flex h-full w-72 flex-col gap-0 p-4"
          >
            <SheetHeader className="mb-4 space-y-0 p-0 text-left">
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <NavLinks showUsersNav={showUsersNav} />
            <div className="mt-auto space-y-2 pt-6">
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 text-muted-foreground"
                render={
                  <a
                    href={REPORT_BUG_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                <Bug className="size-4" />
                Reportar bug
              </Button>
              <form action={logoutAction}>
                <Button
                  type="submit"
                  variant="ghost"
                  className="w-full justify-start gap-2 text-muted-foreground"
                >
                  <LogOut className="size-4" />
                  Sair
                </Button>
              </form>
              <VersionLabel status={versionStatus} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
