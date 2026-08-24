import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const CONTRACT_PATH = "docs/discovery/public-discovery-architecture-contract-v0.1.md";

describe("public discovery documentation integrity", () => {
  it("lists the canonical public contract from the discovery authority index", () => {
    expect(read("docs/discovery/README.md")).toContain(
      "public-discovery-architecture-contract-v0.1.md",
    );
  });

  it("records the human CommerceMarket and explicit hreflang decision", () => {
    const decisions = read("docs/discovery/decision-log.md");
    expect(decisions).toContain("officially mean `CommerceMarket`");
    expect(decisions).toContain("`Market` is not an ISO-country authority");
    expect(decisions).toContain("must not be derived from `MarketCode`");
    expect(decisions).toContain("source-symbol rename is\ndeferred");
  });

  it("denies product, commerce, and internal-discovery authority and preserves noindex deferrals", () => {
    const contract = read(CONTRACT_PATH);
    expect(contract).toContain("Public Discovery does not own or grant");
    expect(contract).toContain("product claims, product truth");
    expect(contract).toContain("internal discovery query interpretation");
    expect(contract).toContain("`CATALOG_LIST` | noindex/follow | noindex/follow");
    expect(contract).toContain("`CATALOG_DETAIL` | noindex/follow | noindex/follow");
  });
});

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}
