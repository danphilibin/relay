/**
 * Shared table types used by both input and output table surfaces.
 *
 * These are the transport-level primitives — what the HTTP API returns for
 * loader-backed table queries and what the browser consumes for rendering.
 */

import { z } from "zod";

// ── Row key identity ────────────────────────────────────────────────

/** The supported row-key primitive types. Display cells are strings, but row
 * identity preserves the original type so `resolve()` receives keys with the
 * same primitive type as the source data. */
export type RowKeyValue = string | number;

// ── Serialized column definitions (NDJSON stream, no functions) ─────

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

export type SerializedColumnDef = z.infer<typeof SerializedColumnDefSchema>;

// ── Normalized table data (loader HTTP response shape) ──────────────

export const NormalizedTableColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
});

export const NormalizedTableRowSchema = z.object({
  rowKey: z.union([z.string(), z.number()]).optional(),
  cells: z.record(z.string(), z.string()),
});

export const LoaderTableDataSchema = z.object({
  columns: z.array(NormalizedTableColumnSchema),
  rows: z.array(NormalizedTableRowSchema),
  totalCount: z.number().optional(),
});

export type NormalizedTableColumn = z.infer<typeof NormalizedTableColumnSchema>;
export type NormalizedTableRow = z.infer<typeof NormalizedTableRowSchema>;
export type LoaderTableData = z.infer<typeof LoaderTableDataSchema>;
