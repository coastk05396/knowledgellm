/**
 * Minimal Markdown block parser for the bundled sample documents: headings,
 * paragraphs, quotes and two-level lists. Every block keeps its character
 * range in the source so a cited excerpt can be mapped onto rendered blocks.
 */
export interface MarkdownListItem {
  text: string;
  start: number;
  end: number;
  children: MarkdownListItem[];
}
export type MarkdownBlock =
  | { type: "heading"; level: number; text: string; start: number; end: number }
  | { type: "paragraph" | "quote"; text: string; start: number; end: number }
  | {
      type: "list";
      ordered: boolean;
      items: MarkdownListItem[];
      start: number;
      end: number;
    };

/**
 * Every line terminator becomes "\n", so no line handed to the patterns below
 * contains a character that `.` cannot match (which would let them backtrack).
 * Block and excerpt offsets both refer to this normalised text.
 */
export function normalizeLines(source: string): string {
  return source.replace(/\r\n?|[\u2028\u2029]/g, "\n");
}

/** Parses normalised text; offsets are positions in `normalizeLines(source)`. */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let offset = 0;
  // The block a following line may extend; a blank line or heading resets it.
  let open: MarkdownBlock | undefined;
  for (const rawLine of normalizeLines(source).split("\n")) {
    const start = offset;
    const end = start + rawLine.length;
    offset = end + 1;
    const line = rawLine.trimEnd();
    const heading = /^(#{1,6})[ \t]+(.*)$/.exec(line);
    const quote = /^>[ \t]?(.*)$/.exec(line);
    const item = /^([ \t]*)(?:[-*]|(\d+)\.)[ \t]+(.*)$/.exec(line);
    if (!line.trim()) {
      open = undefined;
    } else if (heading) {
      open = undefined;
      blocks.push({
        type: "heading",
        level: heading[1].length,
        text: heading[2],
        start,
        end,
      });
    } else if (item) {
      const entry = { text: item[3], start, end, children: [] };
      if (open?.type === "list") {
        const parent = item[1].length >= 2 ? open.items.at(-1) : undefined;
        (parent?.children ?? open.items).push(entry);
        open.end = end;
      } else {
        open = {
          type: "list",
          ordered: item[2] !== undefined,
          items: [entry],
          start,
          end,
        };
        blocks.push(open);
      }
    } else {
      const type = quote ? "quote" : "paragraph";
      const text = quote ? quote[1] : line.trim();
      if (open?.type === type) {
        open.text += ` ${text}`;
        open.end = end;
      } else {
        open = { type, text, start, end };
        blocks.push(open);
      }
    }
  }
  return blocks;
}

/**
 * Character range of the excerpt's first occurrence in the normalised source
 * (the same offsets `parseMarkdown` reports), or null when it is absent.
 */
export function findExcerpt(
  source: string,
  excerpt?: string,
): { start: number; end: number } | null {
  if (!excerpt) return null;
  const start = normalizeLines(source).indexOf(normalizeLines(excerpt));
  return start < 0
    ? null
    : { start, end: start + normalizeLines(excerpt).length };
}
