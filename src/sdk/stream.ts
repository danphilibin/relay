/**
 * Stream message types for workflow communication
 */

/**
 * Input field definition for structured input schemas
 */
export type InputFieldDefinition =
  | {
      type: "text";
      label: string;
      placeholder?: string;
      required?: boolean;
    }
  | {
      type: "checkbox";
      label: string;
      required?: boolean;
    }
  | {
      type: "number";
      label: string;
      placeholder?: string;
      required?: boolean;
    }
  | {
      type: "select";
      label: string;
      options: readonly { value: string; label: string }[];
      required?: boolean;
    };

/**
 * Schema for structured input - a record of field names to field definitions
 */
export type InputSchema = Record<string, InputFieldDefinition>;

/**
 * Maps a single field definition to its result type
 */
type InferFieldType<T extends InputFieldDefinition> = T["type"] extends "text"
  ? string
  : T["type"] extends "checkbox"
    ? boolean
    : T["type"] extends "number"
      ? number
      : T["type"] extends "select"
        ? string
        : never;

/**
 * Infers the result type from an input schema
 */
export type InferInputResult<T extends InputSchema> = {
  [K in keyof T]: InferFieldType<T[K]>;
};

export type StreamMessage =
  | {
      type: "log";
      text: string;
    }
  | {
      type: "input_request";
      eventName: string;
      prompt: string;
      schema?: InputSchema;
    }
  | {
      type: "input_received";
      value: string | Record<string, unknown>;
    }
  | {
      type: "loading_start";
      id: string;
      text: string;
    }
  | {
      type: "loading_complete";
      id: string;
      text: string;
    };

export function createLogMessage(text: string): StreamMessage {
  return { type: "log", text };
}

export function createInputRequest(
  eventName: string,
  prompt: string,
  schema?: InputSchema,
): StreamMessage {
  if (schema) {
    return { type: "input_request", eventName, prompt, schema };
  }
  return { type: "input_request", eventName, prompt };
}

export function createInputReceived(
  value: string | Record<string, unknown>,
): StreamMessage {
  return { type: "input_received", value };
}

export function createLoadingStart(id: string, text: string): StreamMessage {
  return { type: "loading_start", id, text };
}

export function createLoadingComplete(id: string, text: string): StreamMessage {
  return { type: "loading_complete", id, text };
}
