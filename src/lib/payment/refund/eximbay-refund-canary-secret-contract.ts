export type EximbayRefundCanarySecretAuthority = Readonly<{
  resource: string;
  version: string;
}>;

const RESOURCE = /^projects\/[a-z][a-z0-9-]{4,28}[a-z0-9]\/secrets\/[A-Za-z][A-Za-z0-9_-]{0,254}$/u;
const VERSION = /^[1-9][0-9]*$/u;

export function exactEximbayRefundCanarySecretName(
  authority: EximbayRefundCanarySecretAuthority,
): string | null {
  if (!RESOURCE.test(authority.resource) || !VERSION.test(authority.version)) return null;
  return `${authority.resource}/versions/${authority.version}`;
}
