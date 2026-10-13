import { describe, expect, it } from "vitest";
import { findExcerpt, parseMarkdown } from "./markdown";

describe("Markdown block parser", () => {
  it("keeps block offsets aligned with the excerpt across line endings", () => {
    const source =
      "# Title\r\n\r\n- **Flights**: Economy.\r- **Lodging**: 200 credits.\u2028Closing line.";
    const blocks = parseMarkdown(source);
    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "list",
      "paragraph",
    ]);
    const range = findExcerpt(source, "dging**: 200")!;
    const list = blocks[1];
    if (list.type !== "list") throw new Error("Expected a list");
    expect(list.items.map((item) => item.text)).toEqual([
      "**Flights**: Economy.",
      "**Lodging**: 200 credits.",
    ]);
    expect(
      list.items
        .filter((item) => item.start < range.end && item.end > range.start)
        .map((item) => item.text),
    ).toEqual(["**Lodging**: 200 credits."]);
    expect(findExcerpt(source, "Not present")).toBeNull();
    expect(findExcerpt("one\r\ntwo\r\nthree", "one\r\ntwo")).toEqual({
      start: 0,
      end: 7,
    });
  });

  it.each([
    ["a list marker", "- "],
    ["a heading marker", "# "],
    ["a numbered marker", "1. "],
    ["a quote marker", "> "],
    ["indentation", ""],
  ])(
    "parses a 200k-character whitespace run after %s in linear time",
    (_name, marker) => {
      for (const terminator of ["\r", "\u2028", "\u2029", "\r\n"]) {
        const source = `${marker}${" ".repeat(200_000)}${terminator}x${"\t".repeat(1000)}`;
        const started = performance.now();
        const blocks = parseMarkdown(source);
        expect(performance.now() - started).toBeLessThan(250);
        expect(blocks.length).toBeGreaterThan(0);
      }
    },
  );
});
