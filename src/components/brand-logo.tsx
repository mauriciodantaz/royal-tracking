import { BarChart3 } from "lucide-react";

import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
};

export function BrandLogo({
  className,
  markClassName,
  showWordmark = true,
}: BrandLogoProps) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-[var(--radius)] bg-primary/15 text-primary ring-1 ring-primary/20",
          markClassName
        )}
      >
        <BarChart3 className="size-4" aria-hidden />
      </span>
      {showWordmark ? (
        <span className="leading-tight">
          <span className="block text-sm font-semibold tracking-tight text-foreground">
            Royal Tracking
          </span>
          <span className="block text-xs text-muted-foreground">Server-side</span>
        </span>
      ) : null}
    </span>
  );
}
