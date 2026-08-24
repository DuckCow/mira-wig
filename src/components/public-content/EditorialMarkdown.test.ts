import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  EditorialMarkdown,
  LpcA1EditorialSyntaxError,
} from "./EditorialMarkdown";

describe("EditorialMarkdown LPC-A1 pilot syntax", () => {
  it("renders h2, paragraphs, unordered lists, and strong text", () => {
    const html = renderMarkdown(`## 목적

본문 문단입니다.

- 첫 번째 항목
- **강조된 항목**`);

    expect(html).toContain("<h2");
    expect(html).toContain(">목적</h2>");
    expect(html).toContain("<p>본문 문단입니다.</p>");
    expect(html).toContain("<ul");
    expect(html).toContain("<li>첫 번째 항목</li>");
    expect(html).toContain("<strong>강조된 항목</strong>");
  });

  it("groups paragraph lines, treats whitespace as blank, and preserves list transitions", () => {
    const html = renderMarkdown(`first line
second **strong** line
   
- first item
- second item
after list`);

    expect(html).toContain("<p>first line second <strong>strong</strong> line</p>");
    expect(html).toContain("<ul");
    expect(html).toContain("<li>first item</li><li>second item</li>");
    expect(html).toContain("</ul><p>after list</p>");
    expect(html).not.toContain("<p>   </p>");
  });

  it("renders multiple strong spans in one paragraph", () => {
    expect(renderMarkdown("plain **one** and **two**")).toContain(
      "<p>plain <strong>one</strong> and <strong>two</strong></p>",
    );
  });

  it.each([
    ["plus list marker", "+\titem"],
    ["hyphen list marker", "-\titem"],
    ["paragraph text", "plain\ttext"],
    ["heading text", "## heading\ttext"],
    ["strong text boundary", "plain\t**strong**"],
    ["otherwise blank line", "\t"],
  ])("rejects ASCII TAB in %s", (_case, body) => {
    expect(() => renderMarkdown(body)).toThrow(LpcA1EditorialSyntaxError);
    expect(() => renderMarkdown(body)).toThrow("LPC_A1_UNSUPPORTED_EDITORIAL_SYNTAX");
  });

  it.each([
    ["plus list marker", "+ item"],
    ["asterisk list marker", "* item"],
    ["indented H1", " # heading"],
    ["thematic rule", "- - -"],
    ["HTML comment", "<!-- hidden -->"],
    ["reference link", "[label][ref]"],
    ["reference definition", "[ref]: https://example.invalid"],
    ["tilde fence", "~~~\ncode\n~~~"],
    ["backtick fence", "```\ncode\n```"],
    ["indented ordered list", " 1. item"],
    ["raw HTML", "<script>alert(1)</script>"],
    ["link syntax", "[외부 링크](https://example.invalid)"],
    ["image syntax", "![원격 이미지](https://example.invalid/image.png)"],
    ["H1", "# 지원하지 않는 제목"],
    ["H3", "### 지원하지 않는 제목"],
    ["malformed strong", "닫히지 않은 **강조"],
    ["empty strong", "비어 있는 **** 강조"],
    ["nested strong", "**바깥 *안쪽* 강조**"],
    ["backtick code", "`실행 코드`"],
    ["blockquote", "> 인용"],
    ["ordered list", "1. 항목"],
    ["underscore emphasis", "_강조_"],
    ["Markdown escape", "\\*문자 그대로\\*"],
  ])("fails closed for %s", (_case, body) => {
    expect(() => renderMarkdown(body)).toThrow(LpcA1EditorialSyntaxError);
    expect(() => renderMarkdown(body)).toThrow("LPC_A1_UNSUPPORTED_EDITORIAL_SYNTAX");
  });
});

function renderMarkdown(body: string): string {
  return renderToStaticMarkup(createElement(EditorialMarkdown, { body }));
}
