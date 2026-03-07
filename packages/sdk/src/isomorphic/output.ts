import { z } from "zod";

const OutputIntentSchema = z.enum(["primary", "secondary", "danger"]);

export const OutputButtonDefSchema = z.object({
  label: z.string(),
  url: z.string().optional(),
  intent: OutputIntentSchema.optional(),
});

export const OutputMarkdownBlockSchema = z.object({
  type: z.literal("output.markdown"),
  content: z.string(),
});

export const OutputTableBlockSchema = z.object({
  type: z.literal("output.table"),
  title: z.string().optional(),
  data: z.array(z.record(z.string(), z.string())),
});

export const OutputCodeBlockSchema = z.object({
  type: z.literal("output.code"),
  code: z.string(),
  language: z.string().optional(),
});

export const OutputImageBlockSchema = z.object({
  type: z.literal("output.image"),
  src: z.string(),
  alt: z.string().optional(),
});

export const OutputLinkBlockSchema = z.object({
  type: z.literal("output.link"),
  url: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
});

export const OutputButtonsBlockSchema = z.object({
  type: z.literal("output.buttons"),
  buttons: z.array(OutputButtonDefSchema),
});

export const OutputMetadataBlockSchema = z.object({
  type: z.literal("output.metadata"),
  title: z.string().optional(),
  data: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
});

const SerializedColumnDefSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("accessor"),
    label: z.string(),
    accessorKey: z.string(),
  }),
  z.object({
    type: z.literal("render"),
    label: z.string(),
  }),
]);

export const OutputTableLoaderBlockSchema = z.object({
  type: z.literal("output.table_loader"),
  title: z.string().optional(),
  loader: z.object({
    path: z.string(),
    name: z.string(),
    workflow: z.string(),
    presenter: z.string().optional(),
    pageSize: z.number().optional(),
    params: z.record(z.string(), z.unknown()),
    columns: z.array(SerializedColumnDefSchema).optional(),
  }),
});

export const OutputBlockSchema = z.discriminatedUnion("type", [
  OutputMarkdownBlockSchema,
  OutputTableBlockSchema,
  OutputCodeBlockSchema,
  OutputImageBlockSchema,
  OutputLinkBlockSchema,
  OutputButtonsBlockSchema,
  OutputMetadataBlockSchema,
  OutputTableLoaderBlockSchema,
]);

export type OutputIntent = z.infer<typeof OutputIntentSchema>;
export type OutputButtonDef = z.infer<typeof OutputButtonDefSchema>;
export type OutputMarkdownBlock = z.infer<typeof OutputMarkdownBlockSchema>;
export type OutputTableBlock = z.infer<typeof OutputTableBlockSchema>;
export type OutputCodeBlock = z.infer<typeof OutputCodeBlockSchema>;
export type OutputImageBlock = z.infer<typeof OutputImageBlockSchema>;
export type OutputLinkBlock = z.infer<typeof OutputLinkBlockSchema>;
export type OutputButtonsBlock = z.infer<typeof OutputButtonsBlockSchema>;
export type OutputMetadataBlock = z.infer<typeof OutputMetadataBlockSchema>;
export type SerializedColumnDef = z.infer<typeof SerializedColumnDefSchema>;
export type OutputTableLoaderBlock = z.infer<
  typeof OutputTableLoaderBlockSchema
>;
export type OutputBlock = z.infer<typeof OutputBlockSchema>;
