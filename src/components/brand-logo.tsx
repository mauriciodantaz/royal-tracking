import Image from "next/image";

import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
  href?: string;
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
          "flex size-8 shrink-0 items-center justify-center rounded-[var(--radius)] bg-zinc-950 ring-1 ring-white/10",
          markClassName
        )}
      >
        <Image
          src="/logo.png"
          alt=""
          width={20}
          height={20}
          className="size-5"
          priority
        />
      </span>
      {showWordmark ? (
        <span className="leading-tight">
          <span className="block text-sm font-semibold tracking-tight">
            Royal Tracking
          </span>
          <span className="block text-xs text-muted-foreground">Server-side</span>
        </span>
      ) : null}
    </span>
  );
}
