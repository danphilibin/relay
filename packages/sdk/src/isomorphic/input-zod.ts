import { z } from "zod";
import type { InputFieldDefinition, InputSchema } from "./input";

function assertNever(value: never): never {
  throw new Error(`Unhandled input field type: ${JSON.stringify(value)}`);
}

/**
 * Converts a Relay InputSchema into a Zod shape suitable for MCP tool registration.
 */
export function inputSchemaToZod(
  input: InputSchema | undefined,
): Record<string, z.ZodType> {
  if (!input) return {};

  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(input) as [
    string,
    InputFieldDefinition,
  ][]) {
    const desc = field.description || field.label;
    switch (field.type) {
      case "text":
        shape[key] = z.string().describe(desc);
        break;
      case "number":
        shape[key] = z.number().describe(desc);
        break;
      case "checkbox":
        shape[key] = z.boolean().describe(desc);
        break;
      case "select":
        shape[key] = z
          .enum(
            field.options.map((option) => option.value) as [
              string,
              ...string[],
            ],
          )
          .describe(desc);
        break;
      case "table":
        shape[key] = z.array(z.string()).describe(desc);
        break;
      default:
        assertNever(field);
    }
  }
  return shape;
}
