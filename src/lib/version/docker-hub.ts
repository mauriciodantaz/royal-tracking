import type { ReleaseChannel } from "./channel";
import { parseSemVer } from "./semver";

const HUB_REPO = "mauriciodantaz/royal-tracking";
const PAGE_SIZE = 100;
const MAX_PAGES = 20;

type HubTagsPage = {
  results?: Array<{ name?: string }>;
  next?: string | null;
};

function extractVersionFromTag(
  tag: string,
  channel: Exclude<ReleaseChannel, "dev">
): string | null {
  if (channel === "beta") {
    const m = /^(\d+\.\d+\.\d+)-beta$/.exec(tag);
    return m?.[1] ?? null;
  }
  // latest: plain X.Y.Z only (ignore -stable duplicates and floating tags)
  if (!parseSemVer(tag)) return null;
  return tag;
}

export async function fetchChannelVersions(
  channel: Exclude<ReleaseChannel, "dev">
): Promise<string[]> {
  const versions = new Set<string>();
  let url: string | null =
    `https://hub.docker.com/v2/repositories/${HUB_REPO}/tags?page_size=${PAGE_SIZE}&page=1`;

  for (let page = 0; page < MAX_PAGES && url; page++) {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      throw new Error(`Docker Hub tags HTTP ${res.status}`);
    }
    const data = (await res.json()) as HubTagsPage;
    for (const item of data.results ?? []) {
      const name = item.name?.trim();
      if (!name) continue;
      const version = extractVersionFromTag(name, channel);
      if (version) versions.add(version);
    }
    url = data.next ?? null;
  }

  return [...versions];
}
