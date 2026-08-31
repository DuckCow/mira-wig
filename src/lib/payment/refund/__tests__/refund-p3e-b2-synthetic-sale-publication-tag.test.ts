import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  deriveSyntheticSalePublicationTarget,
} from "../../../../../scripts/build-synthetic-sale-image.mjs";

const BASELINE = "311e9bb5e3de36ac0dc93a4a91bcdc8bc86217ac";
const REPOSITORY = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/synthetic-sale";
const ROOT = process.cwd();

describe("P3E-B2 synthetic-sale publication tag authority", () => {
  it("derives the exact baseline tag and registry target", () => {
    expect(deriveSyntheticSalePublicationTarget(BASELINE)).toEqual({
      imageFamily: "synthetic-sale",
      repository: REPOSITORY,
      sourceCommit: BASELINE,
      tag: "p3e-b2-311e9bb5e3de",
      tagUri: `${REPOSITORY}:p3e-b2-311e9bb5e3de`,
    });
  });

  it("derives each target only from its exact full source commit", () => {
    const otherCommit = "abcdef0123456789abcdef0123456789abcdef01";
    expect(deriveSyntheticSalePublicationTarget).toHaveLength(1);
    expect(deriveSyntheticSalePublicationTarget(otherCommit)).toMatchObject({
      tag: "p3e-b2-abcdef012345",
      tagUri: `${REPOSITORY}:p3e-b2-abcdef012345`,
    });
  });

  it.each([
    "311e9bb5e3de",
    "311E9BB5E3DE36AC0DC93A4A91BCDC8BC86217AC",
    " 311e9bb5e3de36ac0dc93a4a91bcdc8bc86217ac",
    "311e9bb5e3de36ac0dc93a4a91bcdc8bc86217ac ",
    "HEAD",
    "main",
    "latest",
    "stable",
    "current",
    "sandbox",
    "20260831-184500",
    "mira-synthetic-sale-review:311e9bb5e3de-a",
    `${REPOSITORY}@sha256:${"a".repeat(64)}`,
    "g11e9bb5e3de36ac0dc93a4a91bcdc8bc86217ac",
  ])("rejects invalid source input %s", (sourceCommit) => {
    expect(() => deriveSyntheticSalePublicationTarget(sourceCommit))
      .toThrow("SYNTHETIC_SALE_PUBLICATION_SOURCE_COMMIT_INVALID");
  });

  it("keeps local review selectors distinct and preserves bootstrap naming", () => {
    const saleOwner = readFileSync(
      join(ROOT, "scripts/build-synthetic-sale-image.mts"),
      "utf8",
    );
    const bootstrapOwner = readFileSync(
      join(ROOT, "scripts/build-refund-db-bootstrap-image.mts"),
      "utf8",
    );
    expect(saleOwner).toContain(
      "const TAG = /^mira-synthetic-sale-review:[0-9a-f]{12}-[ab]$/u;",
    );
    expect(deriveSyntheticSalePublicationTarget(BASELINE).tag)
      .not.toMatch(/^mira-synthetic-sale-review:/u);
    expect(createHash("sha256").update(bootstrapOwner).digest("hex"))
      .toBe("2aa4d40137891cdaf40db788bee455c814bb8a17e68127d7074fd9b0900b4006");
  });
});
