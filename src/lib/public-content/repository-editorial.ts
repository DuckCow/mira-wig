import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const PILOT_CONTENT_IDENTITY = "lpc-a1-editorial-pilot";
const PILOT_FAMILY = "GUIDE";
const PILOT_LOCALE = "ko";
const PILOT_REVISION = "r1";

export interface LpcA1EditorialPilot {
  readonly contentIdentity: typeof PILOT_CONTENT_IDENTITY;
  readonly family: typeof PILOT_FAMILY;
  readonly locale: typeof PILOT_LOCALE;
  readonly revision: typeof PILOT_REVISION;
  readonly sourceLocale: typeof PILOT_LOCALE;
  readonly sourceRevision: null;
  readonly title: string;
  readonly summary: string;
  readonly body: string;
  readonly revisionDigest: string;
}

interface LpcA1Manifest {
  readonly contentIdentity: typeof PILOT_CONTENT_IDENTITY;
  readonly family: typeof PILOT_FAMILY;
  readonly locale: typeof PILOT_LOCALE;
  readonly revision: typeof PILOT_REVISION;
  readonly sourceLocale: typeof PILOT_LOCALE;
  readonly sourceRevision: null;
  readonly title: string;
  readonly summary: string;
}

export class RepositoryEditorialManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryEditorialManifestError";
  }
}

export async function loadLpcA1EditorialPilot(): Promise<LpcA1EditorialPilot> {
  const manifestPath = join(
    process.cwd(),
    "content/editorial/guides/lpc-a1-editorial-pilot/ko/r1/manifest.json",
  );
  const bodyPath = join(
    process.cwd(),
    "content/editorial/guides/lpc-a1-editorial-pilot/ko/r1/body.md",
  );
  const [manifestBytes, bodyBytes] = await Promise.all([
    readFile(manifestPath),
    readFile(bodyPath),
  ]);
  const manifest = parseLpcA1Manifest(decodeManifest(manifestBytes));
  const revisionDigest = createHash("sha256")
    .update(manifestBytes)
    .update(Buffer.from([0]))
    .update(bodyBytes)
    .digest("hex");

  return {
    ...manifest,
    body: bodyBytes.toString("utf8"),
    revisionDigest,
  };
}

export function parseLpcA1Manifest(input: unknown): LpcA1Manifest {
  if (!isRecord(input)) failManifest("Manifest must be an object.");
  if (input.contentIdentity !== PILOT_CONTENT_IDENTITY) {
    failManifest(`contentIdentity must be ${PILOT_CONTENT_IDENTITY}.`);
  }
  if (input.family !== PILOT_FAMILY) failManifest(`family must be ${PILOT_FAMILY}.`);
  if (input.locale !== PILOT_LOCALE) failManifest(`locale must be ${PILOT_LOCALE}.`);
  if (input.revision !== PILOT_REVISION) failManifest(`revision must be ${PILOT_REVISION}.`);
  if (input.sourceLocale !== PILOT_LOCALE) {
    failManifest(`sourceLocale must be ${PILOT_LOCALE}.`);
  }
  if (input.sourceRevision !== null) failManifest("sourceRevision must be null.");
  if (!isNonBlankString(input.title)) failManifest("title must be a nonblank string.");
  if (!isNonBlankString(input.summary)) failManifest("summary must be a nonblank string.");

  return {
    contentIdentity: input.contentIdentity,
    family: input.family,
    locale: input.locale,
    revision: input.revision,
    sourceLocale: input.sourceLocale,
    sourceRevision: input.sourceRevision,
    title: input.title,
    summary: input.summary,
  };
}

function decodeManifest(bytes: Buffer): unknown {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new RepositoryEditorialManifestError(
      `Manifest must contain valid JSON: ${errorMessage(error)}`,
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown parse failure";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function failManifest(message: string): never {
  throw new RepositoryEditorialManifestError(message);
}
