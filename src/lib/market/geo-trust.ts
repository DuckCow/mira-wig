export type GeoIpTrustMode = "none" | "vercel" | "cloudflare";

// Deployment trust assumption: Geo headers are read only when the operator
// explicitly declares which managed ingress overwrites them. Local, self-hosted,
// unknown, and unconfigured runtimes use `none` and ignore both header families.
export function configuredGeoIpTrustMode(env: NodeJS.ProcessEnv = process.env): GeoIpTrustMode {
  if (env.MIRA_GEOIP_TRUST_MODE === "vercel") return "vercel";
  if (env.MIRA_GEOIP_TRUST_MODE === "cloudflare") return "cloudflare";
  return "none";
}

export function readTrustedGeoCountry(
  headers: Pick<Headers, "get">,
  mode: GeoIpTrustMode,
): string | undefined {
  if (mode === "vercel") return normalizeCountry(headers.get("x-vercel-ip-country"));
  if (mode === "cloudflare") return normalizeCountry(headers.get("cf-ipcountry"));
  return undefined;
}

function normalizeCountry(value: string | null): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{2}$/u.test(normalized) ? normalized : undefined;
}
