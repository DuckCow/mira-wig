export const CONTROL_POINT_TESSELLATION_BROWSER_ENGINE =
  "CHROMIUM_FAMILY" as const;

export type ControlPointTessellationBrowserProduct =
  | "CHROME"
  | "EDGE"
  | "OPERA"
  | "CHROMIUM";

export interface RawBrowserVersionBrand {
  readonly brand: string;
  readonly version: string;
}

export interface RawBrowserVersionEvidence {
  readonly userAgent: string;
  readonly userAgentDataBrands: readonly RawBrowserVersionBrand[] | null;
}

export interface ControlPointTessellationBrowserDeclaration {
  readonly browserEngine: typeof CONTROL_POINT_TESSELLATION_BROWSER_ENGINE;
  readonly declaredBrowserProduct: ControlPointTessellationBrowserProduct;
  readonly declaredBrowserMajor: number;
}

export interface AdmittedControlPointTessellationBrowser {
  readonly browserEngine: typeof CONTROL_POINT_TESSELLATION_BROWSER_ENGINE;
  readonly declaredBrowserProduct: ControlPointTessellationBrowserProduct;
  readonly declaredBrowserMajor: number;
  readonly actualBrowserProduct: ControlPointTessellationBrowserProduct;
  readonly actualBrowserMajor: number;
  readonly rawBrowserVersionEvidence: RawBrowserVersionEvidence;
}

interface BrowserConclusion {
  readonly product: ControlPointTessellationBrowserProduct;
  readonly major: number;
}

interface NavigatorCompatibility {
  readonly userAgent: string;
  readonly userAgentData?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (
    actual.length !== canonical.length ||
    actual.some((key, index) => key !== canonical[index])
  ) {
    throw new Error(`${label} has an unsupported shape.`);
  }
}

function major(value: string, label: string): number {
  if (!/^[0-9]+(?:\.[0-9]+)*$/.test(value)) {
    throw new Error(`${label} is unparseable.`);
  }
  const parsed = Number(value.split(".")[0]);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} major is invalid.`);
  }
  return parsed;
}

function uniqueMajor(values: readonly number[], label: string): number {
  const unique = [...new Set(values)];
  if (unique.length !== 1) throw new Error(`${label} has conflicting majors.`);
  return unique[0];
}

function wrapperConclusion(
  edge: readonly number[],
  opera: readonly number[],
  label: string,
): BrowserConclusion | null {
  if (edge.length > 0 && opera.length > 0) {
    throw new Error(`${label} contains conflicting wrapper products.`);
  }
  if (edge.length > 0) return { product: "EDGE", major: uniqueMajor(edge, label) };
  if (opera.length > 0) return { product: "OPERA", major: uniqueMajor(opera, label) };
  return null;
}

function selectConclusion(
  evidence: ReadonlyMap<ControlPointTessellationBrowserProduct, readonly number[]>,
  label: string,
): BrowserConclusion | null {
  const edge = evidence.get("EDGE") ?? [];
  const opera = evidence.get("OPERA") ?? [];
  const wrapper = wrapperConclusion(edge, opera, label);
  if (wrapper !== null) return wrapper;
  const chrome = evidence.get("CHROME") ?? [];
  if (chrome.length > 0) {
    return { product: "CHROME", major: uniqueMajor(chrome, label) };
  }
  const chromium = evidence.get("CHROMIUM") ?? [];
  if (chromium.length > 0) {
    return { product: "CHROMIUM", major: uniqueMajor(chromium, label) };
  }
  return null;
}

function add(
  evidence: Map<ControlPointTessellationBrowserProduct, number[]>,
  product: ControlPointTessellationBrowserProduct,
  version: string,
  label: string,
): void {
  const current = evidence.get(product) ?? [];
  current.push(major(version, label));
  evidence.set(product, current);
}

function isGreaseBrand(brand: string): boolean {
  return /^not[ ./;?_=():-]*a[ ./;?_=():-]*brand$/i.test(brand.trim());
}

function conclusionFromBrands(
  brands: readonly RawBrowserVersionBrand[] | null,
): BrowserConclusion | null {
  if (brands === null) return null;
  const evidence = new Map<ControlPointTessellationBrowserProduct, number[]>();
  for (const entry of brands) {
    const normalized = entry.brand.trim().toLowerCase();
    if (normalized === "microsoft edge") {
      add(evidence, "EDGE", entry.version, "Microsoft Edge UAData");
    } else if (normalized === "opera") {
      add(evidence, "OPERA", entry.version, "Opera UAData");
    } else if (normalized === "google chrome") {
      add(evidence, "CHROME", entry.version, "Google Chrome UAData");
    } else if (normalized === "chromium") {
      add(evidence, "CHROMIUM", entry.version, "Chromium UAData");
    } else if (!isGreaseBrand(entry.brand)) {
      throw new Error(`UAData contains unsupported browser product ${entry.brand}.`);
    }
  }
  return selectConclusion(evidence, "UAData");
}

function tokenVersions(userAgent: string, token: string): readonly string[] {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(
    `(?:^|[\\s(])${escaped}(?:/([^\\s()]*))?(?=$|[\\s)])`,
    "g",
  );
  return [...userAgent.matchAll(expression)].map((match) => {
    const version = match[1];
    if (version === undefined || !/^[0-9]+(?:\.[0-9]+)*$/.test(version)) {
      throw new Error(`${token} user-agent token is malformed.`);
    }
    return version;
  });
}

function rejectUnsupportedWrappers(userAgent: string): void {
  const unsupported = /(?:^|[\s(])(Vivaldi|Brave|YaBrowser)(?:\/[^\s()]*)?(?=$|[\s)])/i.exec(
    userAgent,
  );
  if (unsupported !== null) {
    throw new Error(`User agent contains unsupported browser product ${unsupported[1]}.`);
  }
}

function conclusionFromUserAgent(userAgent: string): BrowserConclusion | null {
  rejectUnsupportedWrappers(userAgent);
  const evidence = new Map<ControlPointTessellationBrowserProduct, number[]>();
  for (const version of tokenVersions(userAgent, "Edg")) {
    add(evidence, "EDGE", version, "Edge user agent");
  }
  for (const version of tokenVersions(userAgent, "OPR")) {
    add(evidence, "OPERA", version, "Opera user agent");
  }
  for (const version of tokenVersions(userAgent, "Chrome")) {
    add(evidence, "CHROME", version, "Chrome user agent");
  }
  for (const version of tokenVersions(userAgent, "Chromium")) {
    add(evidence, "CHROMIUM", version, "Chromium user agent");
  }
  return selectConclusion(evidence, "user agent");
}

function validateBrand(value: unknown, index: number): RawBrowserVersionBrand {
  if (!isRecord(value)) throw new Error(`UAData brand ${index} must be an object.`);
  exactKeys(value, ["brand", "version"], `UAData brand ${index}`);
  if (
    typeof value.brand !== "string" || value.brand.trim().length === 0 ||
    typeof value.version !== "string" || value.version.trim().length === 0
  ) {
    throw new Error(`UAData brand ${index} must retain nonempty text.`);
  }
  return Object.freeze({ brand: value.brand, version: value.version });
}

export function validateRawBrowserVersionEvidence(
  value: unknown,
): RawBrowserVersionEvidence {
  if (!isRecord(value)) throw new Error("Browser version evidence must be an object.");
  exactKeys(value, ["userAgent", "userAgentDataBrands"], "browser version evidence");
  if (typeof value.userAgent !== "string" || value.userAgent.trim().length === 0) {
    throw new Error("Browser userAgent must be nonempty.");
  }
  let brands: readonly RawBrowserVersionBrand[] | null = null;
  if (value.userAgentDataBrands !== null) {
    if (!Array.isArray(value.userAgentDataBrands)) {
      throw new Error("userAgentDataBrands must be an array or null.");
    }
    brands = Object.freeze(value.userAgentDataBrands.map(validateBrand));
  }
  return Object.freeze({ userAgent: value.userAgent, userAgentDataBrands: brands });
}

export function captureRawBrowserVersionEvidence(
  navigatorValue: NavigatorCompatibility = navigator,
): RawBrowserVersionEvidence {
  let brands: unknown = null;
  if (isRecord(navigatorValue.userAgentData)) {
    brands = navigatorValue.userAgentData.brands ?? null;
  }
  return validateRawBrowserVersionEvidence({
    userAgent: navigatorValue.userAgent,
    userAgentDataBrands: brands,
  });
}

export function deriveBrowserVersionConclusion(
  value: unknown,
): BrowserConclusion {
  const raw = validateRawBrowserVersionEvidence(value);
  const userAgentData = conclusionFromBrands(raw.userAgentDataBrands);
  const userAgent = conclusionFromUserAgent(raw.userAgent);
  if (userAgentData !== null && userAgent !== null && (
    userAgentData.product !== userAgent.product ||
    userAgentData.major !== userAgent.major
  )) {
    throw new Error("UAData and user-agent browser conclusions conflict.");
  }
  const conclusion = userAgentData ?? userAgent;
  if (conclusion === null) throw new Error("Recognized browser product evidence is missing.");
  return conclusion;
}

export function admitControlPointTessellationBrowser(
  declaration: ControlPointTessellationBrowserDeclaration,
  rawValue: unknown,
): AdmittedControlPointTessellationBrowser {
  if (declaration.browserEngine !== CONTROL_POINT_TESSELLATION_BROWSER_ENGINE) {
    throw new Error("S2 requires the Chromium-family browser engine.");
  }
  if (!Number.isSafeInteger(declaration.declaredBrowserMajor) ||
      declaration.declaredBrowserMajor <= 0) {
    throw new Error("declaredBrowserMajor must be a positive safe integer.");
  }
  const rawBrowserVersionEvidence = validateRawBrowserVersionEvidence(rawValue);
  const actual = deriveBrowserVersionConclusion(rawBrowserVersionEvidence);
  if (
    actual.product !== declaration.declaredBrowserProduct ||
    actual.major !== declaration.declaredBrowserMajor
  ) {
    throw new Error("S2_BROWSER_ADMISSION_MISMATCH");
  }
  return Object.freeze({
    browserEngine: CONTROL_POINT_TESSELLATION_BROWSER_ENGINE,
    declaredBrowserProduct: declaration.declaredBrowserProduct,
    declaredBrowserMajor: declaration.declaredBrowserMajor,
    actualBrowserProduct: actual.product,
    actualBrowserMajor: actual.major,
    rawBrowserVersionEvidence,
  });
}
