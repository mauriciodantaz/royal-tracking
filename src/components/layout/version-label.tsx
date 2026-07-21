import type { VersionStatus } from "@/lib/version/types";

export function VersionLabel({ status }: { status: VersionStatus }) {
  return (
    <p
      className="px-1 pt-1 text-[10px] leading-tight text-muted-foreground/80"
      title={
        status.channel === "dev"
          ? "Ambiente de desenvolvimento"
          : `Canal ${status.channel}`
      }
    >
      {status.label}
    </p>
  );
}
