import type { ReactNode } from "react";

const UNSUPPORTED_SYNTAX = "LPC_A1_UNSUPPORTED_EDITORIAL_SYNTAX";

type InlinePart =
  | Readonly<{ kind: "TEXT"; text: string }>
  | Readonly<{ kind: "STRONG"; text: string }>;

type ClassifiedLine =
  | Readonly<{ kind: "BLANK" }>
  | Readonly<{ kind: "HEADING"; inline: readonly InlinePart[] }>
  | Readonly<{ kind: "LIST_ITEM"; inline: readonly InlinePart[] }>
  | Readonly<{ kind: "PARAGRAPH"; inline: readonly InlinePart[] }>;

type EditorialBlock =
  | Readonly<{ kind: "HEADING"; inline: readonly InlinePart[]; sourceLine: number }>
  | Readonly<{
      kind: "LIST";
      items: readonly (readonly InlinePart[])[];
      sourceLine: number;
    }>
  | Readonly<{
      kind: "PARAGRAPH";
      lines: readonly (readonly InlinePart[])[];
      sourceLine: number;
    }>;

export class LpcA1EditorialSyntaxError extends Error {
  readonly code = UNSUPPORTED_SYNTAX;

  constructor() {
    super(UNSUPPORTED_SYNTAX);
    this.name = "LpcA1EditorialSyntaxError";
  }
}

export function EditorialMarkdown({ body }: Readonly<{ body: string }>) {
  const blocks = parseLpcA1PilotSyntax(body);
  return (
    <div className="space-y-4 text-sm leading-7 text-gray-800">
      {blocks.map(renderBlock)}
    </div>
  );
}

// LPC-A1 deliberately owns only blank separators, H2, unordered-list items,
// paragraphs, and nonnested **strong** spans. It is not a Markdown parser.
function parseLpcA1PilotSyntax(body: string): EditorialBlock[] {
  const lines = body.split("\n").map(classifyLine);
  const blocks: EditorialBlock[] = [];
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    const line = lines[lineIndex] ?? { kind: "BLANK" };
    if (line.kind === "BLANK") {
      lineIndex += 1;
      continue;
    }
    if (line.kind === "HEADING") {
      blocks.push({ kind: "HEADING", inline: line.inline, sourceLine: lineIndex });
      lineIndex += 1;
      continue;
    }
    if (line.kind === "LIST_ITEM") {
      const list = collectList(lines, lineIndex);
      blocks.push(list.block);
      lineIndex = list.nextLineIndex;
      continue;
    }

    const paragraph = collectParagraph(lines, lineIndex);
    blocks.push(paragraph.block);
    lineIndex = paragraph.nextLineIndex;
  }

  return blocks;
}

function collectList(
  lines: readonly ClassifiedLine[],
  sourceLine: number,
): Readonly<{ block: EditorialBlock; nextLineIndex: number }> {
  const items: (readonly InlinePart[])[] = [];
  let nextLineIndex = sourceLine;
  while (lines[nextLineIndex]?.kind === "LIST_ITEM") {
    const item = lines[nextLineIndex];
    if (item?.kind === "LIST_ITEM") items.push(item.inline);
    nextLineIndex += 1;
  }
  return { block: { kind: "LIST", items, sourceLine }, nextLineIndex };
}

function collectParagraph(
  lines: readonly ClassifiedLine[],
  sourceLine: number,
): Readonly<{ block: EditorialBlock; nextLineIndex: number }> {
  const paragraphLines: (readonly InlinePart[])[] = [];
  let nextLineIndex = sourceLine;
  while (lines[nextLineIndex]?.kind === "PARAGRAPH") {
    const line = lines[nextLineIndex];
    if (line?.kind === "PARAGRAPH") paragraphLines.push(line.inline);
    nextLineIndex += 1;
  }
  return {
    block: { kind: "PARAGRAPH", lines: paragraphLines, sourceLine },
    nextLineIndex,
  };
}

function classifyLine(line: string): ClassifiedLine {
  if (line.includes("\t")) failUnsupportedSyntax();
  if (line.trim().length === 0) return { kind: "BLANK" };
  if (/^\s|\s$/u.test(line)) failUnsupportedSyntax();
  if (isUnsupportedBlock(line)) failUnsupportedSyntax();
  if (line.startsWith("## ")) {
    return { kind: "HEADING", inline: parseInline(line.slice(3)) };
  }
  if (line.startsWith("- ")) {
    return { kind: "LIST_ITEM", inline: parseInline(line.slice(2)) };
  }
  return { kind: "PARAGRAPH", inline: parseInline(line) };
}

function isUnsupportedBlock(line: string): boolean {
  return [
    line.startsWith("#") && !line.startsWith("## "),
    line.startsWith("+ ") || line.startsWith("* "),
    /^(?:\d+[.)]\s|>)/u.test(line),
    /^(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,}|=+)$/u.test(line),
    line.startsWith("```") || line.startsWith("~~~"),
  ].some(Boolean);
}

function parseInline(text: string): readonly InlinePart[] {
  if (text.trim().length === 0) failUnsupportedSyntax();

  const parts: InlinePart[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const strongStart = text.indexOf("**", cursor);
    if (strongStart === -1) {
      const remainder = text.slice(cursor);
      assertPlainText(remainder);
      if (remainder.length > 0) parts.push({ kind: "TEXT", text: remainder });
      break;
    }

    const plainText = text.slice(cursor, strongStart);
    assertPlainText(plainText);
    if (plainText.length > 0) parts.push({ kind: "TEXT", text: plainText });

    const strongEnd = text.indexOf("**", strongStart + 2);
    if (strongEnd === -1) failUnsupportedSyntax();
    const strongText = text.slice(strongStart + 2, strongEnd);
    if (strongText.trim().length === 0 || strongText.trim() !== strongText) {
      failUnsupportedSyntax();
    }
    assertPlainText(strongText);
    parts.push({ kind: "STRONG", text: strongText });
    cursor = strongEnd + 2;
  }

  return parts;
}

function assertPlainText(text: string): void {
  if (/[*_`<>\\{}~]|\[|\]/u.test(text)) failUnsupportedSyntax();
}

function renderBlock(block: EditorialBlock): ReactNode {
  if (block.kind === "HEADING") {
    return <h2 key={`heading-${block.sourceLine}`}>{renderInline(block.inline, "heading")}</h2>;
  }
  if (block.kind === "LIST") {
    return (
      <ul key={`list-${block.sourceLine}`} className="list-disc space-y-1 pl-5">
        {block.items.map((item, index) => (
          <li key={`item-${block.sourceLine + index}`}>
            {renderInline(item, `item-${index}`)}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p key={`paragraph-${block.sourceLine}`}>
      {block.lines.flatMap((line, index) => [
        ...(index === 0 ? [] : [" "]),
        ...renderInline(line, `paragraph-line-${index}`),
      ])}
    </p>
  );
}

function renderInline(parts: readonly InlinePart[], keyPrefix: string): ReactNode[] {
  return parts.map((part, index) =>
    part.kind === "STRONG"
      ? <strong key={`${keyPrefix}-strong-${index}`}>{part.text}</strong>
      : part.text,
  );
}

function failUnsupportedSyntax(): never {
  throw new LpcA1EditorialSyntaxError();
}
