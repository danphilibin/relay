import type { InputFieldDefinition, InputSchema } from "./input";
import type {
  CallResponseResult,
  ConfirmRequestMessage,
  InputRequestMessage,
  InteractionPoint,
  StreamMessage,
} from "./messages";
import type { OutputBlock } from "./output";

function assertNever(value: never): never {
  throw new Error(`Unhandled message type: ${JSON.stringify(value)}`);
}

function isCurrentInteraction(
  message: StreamMessage,
  interaction: InteractionPoint,
): boolean {
  return (
    interaction !== null &&
    (message.type === "input_request" || message.type === "confirm_request") &&
    message.id === interaction.id
  );
}

function formatInputField(key: string, field: InputFieldDefinition): string {
  const description = field.description ?? field.label;
  const base = `- ${key} (${field.type}): ${description}`;

  if (field.type === "select") {
    const options = field.options.map((option) => option.value).join(", ");
    return `${base} [options: ${options}]`;
  }

  if (field.type === "table") {
    return (
      `${base} ` + `[selection: ${field.selection}, rowKey: ${field.rowKey}]`
    );
  }

  return base;
}

function formatOutputBlock(block: OutputBlock): string {
  switch (block.type) {
    case "output.markdown":
      return block.content;
    case "output.table":
      return block.label ? `[Table: ${block.label}]` : "[Table]";
    case "output.code":
      return `[Code: ${block.language ?? "plain"}] ${block.code}`;
    case "output.image":
      return `[Image: ${block.alt ?? block.src}]`;
    case "output.link":
      return `[Link: ${block.label ?? block.url}]`;
    case "output.buttons":
      return `[Buttons: ${block.buttons.map((b) => b.label).join(", ")}]`;
    default:
      return "[Output]";
  }
}

function formatStreamMessage(
  message: StreamMessage,
  interaction: InteractionPoint,
): string | null {
  if (isCurrentInteraction(message, interaction)) {
    return null;
  }

  switch (message.type) {
    case "output":
      return formatOutputBlock(message.block);
    case "input_request":
      return `[Input requested] ${message.prompt}`;
    case "input_received":
      return `[Input received] ${JSON.stringify(message.value)}`;
    case "loading":
      return message.complete
        ? `[Loading complete] ${message.text}`
        : `[Loading] ${message.text}`;
    case "confirm_request":
      return `[Confirmation requested] ${message.message}`;
    case "confirm_received":
      return message.approved
        ? "[Confirmation received] approved"
        : "[Confirmation received] rejected";
    case "workflow_complete":
      return "[Workflow complete]";
    default:
      return assertNever(message);
  }
}

function formatInputSchema(schema: InputSchema): string[] {
  const lines: string[] = ["Fields:"];

  for (const [key, field] of Object.entries(schema)) {
    lines.push(formatInputField(key, field));
  }

  return lines;
}

/** Paused on an input: the agent fills in the fields via relay_respond. */
function formatInputRequest(interaction: InputRequestMessage): string[] {
  const lines = [`Prompt: ${interaction.prompt}`];
  lines.push(...formatInputSchema(interaction.schema));
  if (interaction.buttons.length > 0) {
    const labels = interaction.buttons.map((button) => button.label).join(", ");
    lines.push(`Buttons: ${labels}`);
  }
  lines.push("");
  lines.push("Use relay_respond to continue this workflow.");
  return lines;
}

/**
 * Paused on a confirm: approvals are human-only (relay_respond rejects
 * confirm events), so send the agent to the browser instead.
 */
function formatConfirmRequest(
  interaction: ConfirmRequestMessage,
  runUrl: string | null,
): string[] {
  const where = runUrl ?? "the Relay web app";
  return [
    `Confirm: ${interaction.message}`,
    "",
    `This approval must be made by the user in the browser: ${where}`,
    "Ask the user to approve or reject it there. " +
      "The workflow will continue in the browser.",
  ];
}

export function formatCallResponseForMcp(result: CallResponseResult): string {
  const lines: string[] = [];

  for (const message of result.messages) {
    const formatted = formatStreamMessage(message, result.interaction);
    if (formatted) {
      lines.push(formatted);
    }
  }

  if (result.runUrl) {
    lines.push(`View in browser: ${result.runUrl}`);
    lines.push("");
  }

  if (result.status === "complete") {
    const hasWorkflowComplete = result.messages.some(
      (message) => message.type === "workflow_complete",
    );
    if (!hasWorkflowComplete) {
      lines.push("[Workflow complete]");
    }
  } else if (result.interaction) {
    lines.push("");
    lines.push(`[Workflow paused - ${result.status}]`);
    lines.push(`Run ID: ${result.runId}`);
    lines.push(`Event: ${result.interaction.id}`);

    switch (result.interaction.type) {
      case "input_request":
        lines.push(...formatInputRequest(result.interaction));
        break;
      case "confirm_request":
        lines.push(...formatConfirmRequest(result.interaction, result.runUrl));
        break;
      default:
        assertNever(result.interaction);
    }
  }

  return lines.join("\n");
}
