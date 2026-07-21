import { unstable_cache } from "next/cache";
import "server-only";

import {
  channelLabel,
  getAppVersion,
  getReleaseChannel,
  type ReleaseChannel,
} from "./channel";
import { fetchChannelVersions } from "./docker-hub";
import { countVersionsBehind } from "./semver";
import type { VersionStatus } from "./types";

export type { VersionStatus };

function formatBehindLabel(
  version: string,
  channel: Exclude<ReleaseChannel, "dev">,
  behind: number | null
): string {
  const base = `v${version} · ${channelLabel(channel)}`;
  if (behind === null || behind <= 0) return base;
  if (behind === 1) return `${base} · 1 versão atrás`;
  return `${base} · ${behind} versões atrás`;
}

async function loadVersionStatus(): Promise<VersionStatus> {
  const version = getAppVersion();
  const channel = getReleaseChannel();

  if (channel === "dev") {
    return {
      version,
      channel,
      versionsBehind: null,
      label: "Ambiente DEV",
    };
  }

  try {
    const remote = await fetchChannelVersions(channel);
    const behind = countVersionsBehind(version, remote);
    return {
      version,
      channel,
      versionsBehind: behind,
      label: formatBehindLabel(version, channel, behind),
    };
  } catch {
    return {
      version,
      channel,
      versionsBehind: null,
      label: formatBehindLabel(version, channel, null),
    };
  }
}

export const getVersionStatus = unstable_cache(
  loadVersionStatus,
  ["app-version-status"],
  { revalidate: 3600 }
);
