export type SemVer = { major: number; minor: number; patch: number };

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseSemVer(version: string): SemVer | null {
  const cleaned = version.trim().replace(/^v/i, "");
  const m = SEMVER_RE.exec(cleaned);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
  };
}

/** Negative if a < b, 0 if equal, positive if a > b. */
export function compareSemVer(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/**
 * How many unique remote SemVer versions are strictly greater than `current`.
 * `remoteVersions` may include suffixes; only valid X.Y.Z cores are counted.
 */
export function countVersionsBehind(
  current: string,
  remoteVersions: readonly string[]
): number {
  const currentParsed = parseSemVer(current);
  if (!currentParsed) return 0;

  const newer = new Set<string>();
  for (const raw of remoteVersions) {
    const parsed = parseSemVer(raw);
    if (!parsed) continue;
    if (compareSemVer(parsed, currentParsed) > 0) {
      newer.add(`${parsed.major}.${parsed.minor}.${parsed.patch}`);
    }
  }
  return newer.size;
}

/** Highest plain SemVer among `versions`, or null if none parse. */
export function maxSemVer(versions: readonly string[]): string | null {
  let best: SemVer | null = null;
  for (const raw of versions) {
    const parsed = parseSemVer(raw);
    if (!parsed) continue;
    if (!best || compareSemVer(parsed, best) > 0) {
      best = parsed;
    }
  }
  if (!best) return null;
  return `${best.major}.${best.minor}.${best.patch}`;
}

export function sameSemVer(a: string, b: string): boolean {
  const pa = parseSemVer(a);
  const pb = parseSemVer(b);
  if (!pa || !pb) return false;
  return compareSemVer(pa, pb) === 0;
}
