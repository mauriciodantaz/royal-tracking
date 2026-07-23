import { unstable_cache } from "next/cache";
import "server-only";

import { getAppVersion, getReleaseChannel } from "./channel";
import { fetchChannelVersions } from "./docker-hub";
import { formatVersionLabel } from "./label";
import { countVersionsBehind, maxSemVer, sameSemVer } from "./semver";
import type { VersionStatus } from "./types";

export type { VersionStatus };

async function loadVersionStatus(): Promise<VersionStatus> {
  const version = getAppVersion();
  const channel = getReleaseChannel();

  if (channel === "dev") {
    return {
      version,
      channel,
      versionsBehind: null,
      hubLatest: null,
      label: "Ambiente DEV",
    };
  }

  try {
    if (channel === "latest") {
      const remote = await fetchChannelVersions("latest");
      const tip = maxSemVer(remote);
      const behind = countVersionsBehind(version, remote);
      const onChannelTip = tip !== null && sameSemVer(version, tip);
      return {
        version,
        channel,
        versionsBehind: behind,
        hubLatest: tip,
        label: formatVersionLabel({
          version,
          channel,
          onChannelTip,
          versionsBehind: behind,
        }),
      };
    }

    // beta: badge when on beta tip; otherwise count behind vs LATEST stable tip
    const betaRemote = await fetchChannelVersions("beta");
    const tipBeta = maxSemVer(betaRemote);
    const onChannelTip = tipBeta !== null && sameSemVer(version, tipBeta);

    if (onChannelTip) {
      return {
        version,
        channel,
        versionsBehind: 0,
        hubLatest: tipBeta,
        label: formatVersionLabel({
          version,
          channel,
          onChannelTip: true,
          versionsBehind: 0,
        }),
      };
    }

    const stableRemote = await fetchChannelVersions("latest");
    const tipLatest = maxSemVer(stableRemote);
    const behind = countVersionsBehind(version, stableRemote);
    return {
      version,
      channel,
      versionsBehind: behind,
      hubLatest: tipLatest,
      label: formatVersionLabel({
        version,
        channel,
        onChannelTip: false,
        versionsBehind: behind,
      }),
    };
  } catch {
    return {
      version,
      channel,
      versionsBehind: null,
      hubLatest: null,
      label: formatVersionLabel({
        version,
        channel,
        onChannelTip: false,
        versionsBehind: null,
      }),
    };
  }
}

export const getVersionStatus = unstable_cache(
  loadVersionStatus,
  ["app-version-status"],
  { revalidate: 3600 }
);
