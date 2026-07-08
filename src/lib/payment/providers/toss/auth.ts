export function tossBasicAuthorization(secretKey: string): string {
  const normalized = secretKey.trim();
  if (!normalized) throw new Error("Toss secret key is required.");
  return `Basic ${Buffer.from(`${normalized}:`, "utf8").toString("base64")}`;
}
