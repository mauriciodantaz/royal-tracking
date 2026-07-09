import "server-only";

import geoip from "geoip-lite";

export type GeoInfo = {
  geo_country: string | null;
  geo_region: string | null;
  geo_city: string | null;
};

export function lookupGeo(ip: string): GeoInfo {
  if (!ip || ip === "0.0.0.0" || ip === "::1" || ip.startsWith("127.")) {
    return { geo_country: null, geo_region: null, geo_city: null };
  }
  const hit = geoip.lookup(ip);
  if (!hit) {
    return { geo_country: null, geo_region: null, geo_city: null };
  }
  return {
    geo_country: hit.country || null,
    geo_region: hit.region || null,
    geo_city: hit.city || null,
  };
}
