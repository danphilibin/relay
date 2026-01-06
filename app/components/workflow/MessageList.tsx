import type { WorkflowMessage } from "../../types/workflow";
import { LogMessage } from "./LogMessage";
import { InputRequestMessage } from "./InputRequestMessage";
import { LoadingMessage } from "./LoadingMessage";

interface MessageListProps {
  messages: WorkflowMessage[];
  workflowId: string | null;
  onSubmitInput: (
    eventName: string,
    value: string | Record<string, unknown>,
  ) => Promise<void>;
}

/**
 * Pairs input_request messages with their following input_received responses.
 * Returns a processed list where input_received messages are consumed by their requests.
 */
function pairInputMessages(messages: WorkflowMessage[]) {
  const paired: Array<{
    message: WorkflowMessage;
    submittedValue?: Record<string, unknown>;
  }> = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];

    if (message.type === "input_request") {
      // Check if next message is the response
      const next = messages[i + 1];
      if (next?.type === "input_received") {
        paired.push({ message, submittedValue: next.value });
        i++; // Skip the input_received, it's now paired
      } else {
        paired.push({ message });
      }
    } else if (message.type === "input_received") {
      // Orphaned input_received (shouldn't happen, but handle gracefully)
      paired.push({ message });
    } else {
      paired.push({ message });
    }
  }

  return paired;
}

export function MessageList({
  messages,
  workflowId,
  onSubmitInput,
}: MessageListProps) {
  const pairedMessages = pairInputMessages(messages);

  return (
    <>
      {pairedMessages.map(({ message, submittedValue }, index) => {
        const key =
          message.type === "loading" ? `loading-${message.id}` : index;

        switch (message.type) {
          case "log":
            return <LogMessage key={key} text={message.text} />;

          case "input_request":
            return (
              <InputRequestMessage
                key={key}
                eventName={message.eventName}
                prompt={message.prompt}
                schema={message.schema}
                workflowId={workflowId}
                onSubmit={onSubmitInput}
                submittedValue={submittedValue}
              />
            );

          case "loading":
            return (
              <LoadingMessage
                key={key}
                text={message.text}
                complete={message.complete}
              />
            );

          default:
            return null;
        }
      })}
    </>
  );
}
