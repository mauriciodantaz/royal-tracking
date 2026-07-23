import type { ReleaseChannel } from "./channel";

function behindSuffix(behind: number): string {
  if (behind === 1) return "1 versão atrás";
  return `${behind} versões atrás`;
}

/**
 * Sidebar version label.
 * - tip latest → `versão 0.9.1 · LATEST`
 * - tip beta → `versão 0.9.1 · beta`
 * - behind → `versão 0.8.0 · N versões atrás` (no channel badge)
 * - hub unknown → `versão 0.9.1`
 */
export function formatVersionLabel(opts: {
  version: string;
  channel: Exclude<ReleaseChannel, "dev">;
  /** True when installed matches tip of the install's own channel. */
  onChannelTip: boolean;
  /** Null when Hub check failed / unavailable. */
  versionsBehind: number | null;
}): string {
  const base = `versão ${opts.version}`;
  if (opts.versionsBehind === null) return base;

  if (opts.channel === "latest") {
    if (opts.versionsBehind <= 0) return `${base} · LATEST`;
    return `${base} · ${behindSuffix(opts.versionsBehind)}`;
  }

  // beta: badge only on beta tip; otherwise diff vs LATEST tip
  if (opts.onChannelTip) return `${base} · beta`;
  if (opts.versionsBehind <= 0) return base;
  return `${base} · ${behindSuffix(opts.versionsBehind)}`;
}
