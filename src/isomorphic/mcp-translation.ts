import type { InputFieldDefinition, InputSchema } from "./input";
import type {
  CallResponseResult,
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

  return base;
}

function formatOutputBlock(block: OutputBlock): string {
  switch (block.type) {
    case "output.text":
      return block.text;
    case "output.markdown":
      return block.content;
    case "output.table":
      return block.title ? `[Table: ${block.title}]` : "[Table]";
    case "output.code":
      return `[Code: ${block.language ?? "plain"}] ${block.code}`;
    case "output.image":
      return `[Image: ${block.alt ?? block.src}]`;
    case "output.link":
      return `[Link: ${block.title ?? block.url}]`;
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

export function formatCallResponseForMcp(result: CallResponseResult): string {
  const lines: string[] = [];

  for (const message of result.messages) {
    const formatted = formatStreamMessage(message, result.interaction);
    if (formatted) {
      lines.push(formatted);
    }
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
    lines.push(`Run ID: ${result.run_id}`);
    lines.push(`Event: ${result.interaction.id}`);

    if (result.interaction.type === "input_request") {
      lines.push(`Prompt: ${result.interaction.prompt}`);
      lines.push(...formatInputSchema(result.interaction.schema));
      if (result.interaction.buttons.length > 0) {
        const labels = result.interaction.buttons
          .map((button) => button.label)
          .join(", ");
        lines.push(`Buttons: ${labels}`);
      }
    } else {
      lines.push(`Confirm: ${result.interaction.message}`);
    }

    lines.push("");
    lines.push("Use relay_respond to continue this workflow.");
  }

  return lines.join("\n");
}
