"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Cable,
  FileText,
  Globe2,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Receipt,
  Menu,
  Users,
} from "lucide-react";

import { logoutAction } from "@/app/login/actions";
import { BrandLogo } from "@/components/brand-logo";
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

const NAV = [
  { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
  { href: "/dashboard/integracoes", label: "Integrações", icon: Cable },
  { href: "/dashboard/leads", label: "Leads", icon: Users },
  { href: "/dashboard/formularios", label: "Formulários", icon: FileText },
  { href: "/dashboard/eventos", label: "Eventos", icon: Activity },
  { href: "/dashboard/faturamento", label: "Faturamento", icon: Receipt },
  { href: "/dashboard/campanhas", label: "Campanhas", icon: Megaphone },
  { href: "/dashboard/geo", label: "Geo", icon: Globe2 },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => {
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

export function AppSidebar() {
  return (
    <aside className="glass sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r p-4 md:flex">
      <Brand />
      <Separator className="my-4" />
      <NavLinks />
      <div className="mt-auto space-y-3 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Tema</span>
          <ThemeToggle />
        </div>
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
      </div>
    </aside>
  );
}

export function MobileHeader() {
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
          <SheetContent side="left" className="w-72 gap-0 p-4">
            <SheetHeader className="mb-4 space-y-0 p-0 text-left">
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <NavLinks />
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
