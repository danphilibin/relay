import { z } from "zod";

/**
 * Output block schemas for rich output types.
 * Mirrors the pattern in input.ts — Zod discriminated union of block types.
 */

const MarkdownBlockSchema = z.object({
  type: z.literal("markdown"),
  content: z.string(),
});

const TableBlockSchema = z.object({
  type: z.literal("table"),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});

const CodeBlockSchema = z.object({
  type: z.literal("code"),
  content: z.string(),
  language: z.string().optional(),
});

const ImageBlockSchema = z.object({
  type: z.literal("image"),
  src: z.string(),
  alt: z.string().optional(),
});

const LinkBlockSchema = z.object({
  type: z.literal("link"),
  url: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
});

const OutputButtonDefSchema = z.object({
  label: z.string(),
  url: z.string().optional(),
  intent: z.enum(["primary", "secondary", "danger"]).optional(),
});

const ButtonsBlockSchema = z.object({
  type: z.literal("buttons"),
  buttons: z.array(OutputButtonDefSchema),
});

export const OutputBlockSchema = z.discriminatedUnion("type", [
  MarkdownBlockSchema,
  TableBlockSchema,
  CodeBlockSchema,
  ImageBlockSchema,
  LinkBlockSchema,
  ButtonsBlockSchema,
]);

export type OutputBlock = z.infer<typeof OutputBlockSchema>;

export type OutputButtonDef = z.infer<typeof OutputButtonDefSchema>;

/**
 * Convert any output block to a readable plain-text string.
 * Used by both the client (fallback rendering) and MCP server.
 */
export function outputBlockToText(block: OutputBlock): string {
  switch (block.type) {
    case "markdown":
      return block.content;

    case "table": {
      const header = block.columns.join(" | ");
      const separator = block.columns.map(() => "---").join(" | ");
      const rows = block.rows
        .map((row) => row.join(" | "))
        .join("\n");
      return `${header}\n${separator}\n${rows}`;
    }

    case "code":
      return block.language
        ? `[${block.language}]\n${block.content}`
        : block.content;

    case "image":
      return `[Image: ${block.alt ?? ""}](${block.src})`;

    case "link": {
      const title = block.title ?? block.url;
      const parts = [title];
      if (block.description) parts.push(block.description);
      return `[${parts[0]}](${block.url})${block.description ? `\n${block.description}` : ""}`;
    }

    case "buttons":
      return block.buttons
        .map((btn) =>
          btn.url ? `[${btn.label}](${btn.url})` : btn.label,
        )
        .join(", ");
  }
}

