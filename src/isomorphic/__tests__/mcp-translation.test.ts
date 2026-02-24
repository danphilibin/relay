import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ConfirmRequestMessageSchema,
  InputRequestMessageSchema,
  StreamMessageSchema,
  type CallResponseResult,
} from "../messages";
import { formatCallResponseForMcp } from "../mcp-translation";

const CallResponseResultSchema = z.object({
  run_id: z.string(),
  status: z.enum(["awaiting_input", "awaiting_confirm", "complete"]),
  messages: z.array(StreamMessageSchema),
  interaction: z.union([
    InputRequestMessageSchema,
    ConfirmRequestMessageSchema,
    z.null(),
  ]),
});

type FixtureName = "awaiting-input" | "awaiting-confirm" | "complete";

const FIXTURE_NAMES: FixtureName[] = [
  "awaiting-input",
  "awaiting-confirm",
  "complete",
];

function loadFixture(name: FixtureName): {
  input: CallResponseResult;
  expected: string;
} {
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const fixtureDir = path.join(dirname, "fixtures", "mcp");

  const input = CallResponseResultSchema.parse(
    JSON.parse(
      readFileSync(path.join(fixtureDir, `${name}.json`), "utf8"),
    ) as unknown,
  );

  const expected = readFileSync(path.join(fixtureDir, `${name}.txt`), "utf8")
    .replace(/\r\n/g, "\n")
    .trimEnd();

  return { input, expected };
}

describe("formatCallResponseForMcp", () => {
  for (const fixtureName of FIXTURE_NAMES) {
    it(`matches golden fixture: ${fixtureName}`, () => {
      const { input, expected } = loadFixture(fixtureName);
      expect(formatCallResponseForMcp(input)).toBe(expected);
    });
  }
});
