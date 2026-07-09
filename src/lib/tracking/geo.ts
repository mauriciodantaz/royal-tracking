import "server-only";

export type GeoInfo = {
  geo_country: string | null;
  geo_region: string | null;
  geo_city: string | null;
};

function isPrivateIp(ip: string): boolean {
  return (
    !ip ||
    ip === "0.0.0.0" ||
    ip === "::1" ||
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.16.") ||
    ip.startsWith("172.17.") ||
    ip.startsWith("172.18.") ||
    ip.startsWith("172.19.") ||
    ip.startsWith("172.2") ||
    ip.startsWith("172.3")
  );
}

/**
 * Geo from IP via public API (no native geoip dat files — Turbopack/standalone safe).
 * Failures return nulls; never block capture.
 */
export async function lookupGeo(ip: string): Promise<GeoInfo> {
  if (isPrivateIp(ip)) {
    return { geo_country: null, geo_region: null, geo_city: null };
  }

  try {
    const res = await fetch(
      `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
      {
        headers: { "User-Agent": "tracking-server/1.0" },
        signal: AbortSignal.timeout(2500),
      }
    );
    if (!res.ok) {
      return { geo_country: null, geo_region: null, geo_city: null };
    }
    const data = (await res.json()) as {
      country_code?: string;
      region?: string;
      city?: string;
      error?: boolean;
    };
    if (data.error) {
      return { geo_country: null, geo_region: null, geo_city: null };
    }
    return {
      geo_country: data.country_code ?? null,
      geo_region: data.region ?? null,
      geo_city: data.city ?? null,
    };
  } catch {
    return { geo_country: null, geo_region: null, geo_city: null };
  }
}
