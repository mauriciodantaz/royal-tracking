import type { ReleaseChannel } from "./channel";

export type VersionStatus = {
  version: string;
  channel: ReleaseChannel;
  /** Null when DEV or when remote check failed / skipped. */
  versionsBehind: number | null;
  /** Tip SemVer used for comparison (channel tip, or LATEST tip when beta is behind). */
  hubLatest: string | null;
  label: string;
};
