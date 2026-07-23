import type { VersionStatus } from "@/lib/version/types";

function versionTitle(status: VersionStatus): string {
  if (status.channel === "dev") return "Ambiente de desenvolvimento";
  const parts = [
    `Instalada: ${status.version}`,
    `Canal: ${status.channel}`,
  ];
  if (status.hubLatest) {
    parts.push(
      status.channel === "beta" && (status.versionsBehind ?? 0) > 0
        ? `Tip LATEST (referência): ${status.hubLatest}`
        : `Tip do canal: ${status.hubLatest}`
    );
  } else if (status.versionsBehind === null) {
    parts.push("Hub indisponível");
  }
  return parts.join(" · ");
}

export function VersionLabel({ status }: { status: VersionStatus }) {
  return (
    <p
      className="px-1 pt-1 text-[10px] leading-tight text-muted-foreground/80"
      title={versionTitle(status)}
    >
      {status.label}
    </p>
  );
}
