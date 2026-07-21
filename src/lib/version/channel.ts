export type ReleaseChannel = "dev" | "beta" | "latest";

const VALID: ReadonlySet<string> = new Set(["dev", "beta", "latest"]);

export function getAppVersion(): string {
  const fromEnv = process.env.APP_VERSION?.trim();
  if (fromEnv) return fromEnv.replace(/^v/i, "");
  return "0.0.0";
}

export function getReleaseChannel(): ReleaseChannel {
  const raw = process.env.RELEASE_CHANNEL?.trim().toLowerCase();
  if (raw && VALID.has(raw)) return raw as ReleaseChannel;
  if (process.env.NODE_ENV !== "production") return "dev";
  return "latest";
}

export function channelLabel(channel: ReleaseChannel): string {
  switch (channel) {
    case "dev":
      return "DEV";
    case "beta":
      return "BETA";
    case "latest":
      return "LATEST";
    default: {
      const _exhaustive: never = channel;
      return _exhaustive;
    }
  }
}
