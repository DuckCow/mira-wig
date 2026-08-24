import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RepositoryEditorialManifestError,
  loadLpcA1EditorialPilot,
  parseLpcA1Manifest,
} from "./repository-editorial";

const validManifest = {
  contentIdentity: "lpc-a1-editorial-pilot",
  family: "GUIDE",
  locale: "ko",
  revision: "r1",
  sourceLocale: "ko",
  sourceRevision: null,
  title: "LPC-A1 편집 콘텐츠 파일럿",
  summary: "비프로덕션 파일럿",
};

describe("LPC-A1 repository editorial loader", () => {
  it("loads the fixed pilot bytes, identity, and source lineage", async () => {
    const pilot = await loadLpcA1EditorialPilot();
    const bodyBytes = await readFile(pilotPath("body.md"));

    expect(pilot).toMatchObject({
      contentIdentity: "lpc-a1-editorial-pilot",
      family: "GUIDE",
      locale: "ko",
      revision: "r1",
      sourceLocale: "ko",
      sourceRevision: null,
      title: "LPC-A1 편집 콘텐츠 파일럿",
    });
    expect(pilot.body).toBe(bodyBytes.toString("utf8"));
    expect(pilot.body).toContain("## 직접 답변");
  });

  it("binds the revision digest to exact manifest, NUL, and body bytes", async () => {
    const [pilot, manifestBytes, bodyBytes] = await Promise.all([
      loadLpcA1EditorialPilot(),
      readFile(pilotPath("manifest.json")),
      readFile(pilotPath("body.md")),
    ]);
    const independentlyCalculated = createHash("sha256")
      .update(manifestBytes)
      .update(Buffer.from([0]))
      .update(bodyBytes)
      .digest("hex");

    expect(pilot.revisionDigest).toBe(independentlyCalculated);
    expect(pilot.revisionDigest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it.each([
    ["non-object input", null],
    ["wrong identity", { ...validManifest, contentIdentity: "another-guide" }],
    ["wrong family", { ...validManifest, family: "ARTICLE" }],
    ["wrong locale", { ...validManifest, locale: "en" }],
    ["wrong revision", { ...validManifest, revision: "r2" }],
    ["wrong source locale", { ...validManifest, sourceLocale: "en" }],
    ["non-null source revision", { ...validManifest, sourceRevision: "r0" }],
    ["blank title", { ...validManifest, title: "  " }],
    ["blank summary", { ...validManifest, summary: "\n" }],
  ])("fails closed for %s", (_case, manifest) => {
    expect(() => parseLpcA1Manifest(manifest)).toThrow(RepositoryEditorialManifestError);
  });
});

function pilotPath(filename: "manifest.json" | "body.md"): string {
  return join(
    process.cwd(),
    "content/editorial/guides/lpc-a1-editorial-pilot/ko/r1",
    filename,
  );
}
