"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Globe2,
  LayoutDashboard,
  Megaphone,
  Receipt,
  Settings,
  Activity,
  Menu,
} from "lucide-react";

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
  { href: "/dashboard/eventos", label: "Eventos", icon: Activity },
  { href: "/dashboard/faturamento", label: "Faturamento", icon: Receipt },
  { href: "/dashboard/campanhas", label: "Campanhas", icon: Megaphone },
  { href: "/dashboard/geo", label: "Geo", icon: Globe2 },
  { href: "/dashboard/config", label: "Configuração", icon: Settings },
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
    <Link href="/dashboard" className="flex items-center gap-2.5 px-1">
      <span className="flex size-8 items-center justify-center rounded-[var(--radius)] bg-primary/15 text-primary">
        <BarChart3 className="size-4" />
      </span>
      <div className="leading-tight">
        <p className="text-sm font-semibold tracking-tight">Tracking</p>
        <p className="text-xs text-muted-foreground">Server-side</p>
      </div>
    </Link>
  );
}

export function AppSidebar() {
  return (
    <aside className="glass sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r p-4 md:flex">
      <Brand />
      <Separator className="my-4" />
      <NavLinks />
      <div className="mt-auto flex items-center justify-between pt-4">
        <span className="text-xs text-muted-foreground">Tema</span>
        <ThemeToggle />
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
