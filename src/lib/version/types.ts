import type { ReleaseChannel } from "./channel";

export type VersionStatus = {
  version: string;
  channel: ReleaseChannel;
  /** Null when DEV or when remote check failed / skipped. */
  versionsBehind: number | null;
  label: string;
};
