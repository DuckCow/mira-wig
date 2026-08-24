import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LpcA1EditorialPilotPage from "./page";

describe("LPC-A1 admin editorial preview", () => {
  it("renders the non-production revision and Markdown without workflow controls", async () => {
    const html = renderToStaticMarkup(await LpcA1EditorialPilotPage());

    expect(html).toContain("NON-PRODUCTION EDITORIAL PILOT");
    expect(html).toContain("This content is not approved and is not publicly published.");
    expect(html).toContain("lpc-a1-editorial-pilot");
    expect(html).toContain("GUIDE");
    expect(html).toContain(">ko<");
    expect(html).toContain(">r1<");
    expect(html).toMatch(/[0-9a-f]{64}/u);
    expect(html).toContain("LPC-A1 편집 콘텐츠 파일럿");
    expect(html).toContain("Repository editorial content의 로딩");
    expect(html).toContain("<h2>목적</h2>");
    expect(html).toContain("exact revision으로 식별될 수 있지만");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("public-preview");
  });
});
