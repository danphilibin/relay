import type { WorkflowMessage } from "../../types/workflow";
import { LogMessage } from "./LogMessage";
import { InputRequestMessage } from "./InputRequestMessage";
import { LoadingMessage } from "./LoadingMessage";
import { ConnectionState } from "../../routes/workflow";
import { useDelayedWaitingIndicator } from "../../hooks/useDelayedWaitingIndicator";

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

  // Detect if we're waiting for a response after user input
  const lastMessage = messages[messages.length - 1];
  const isWaitingForResponse = lastMessage?.type === "input_received";
  const showWaitingIndicator = useDelayedWaitingIndicator(isWaitingForResponse);

  return (
    <div className="space-y-4">
      {pairedMessages.map(({ message, submittedValue }) => {
        switch (message.type) {
          case "log":
            return <LogMessage key={message.id} text={message.text} />;

          case "input_request":
            return (
              <InputRequestMessage
                key={message.id}
                eventName={message.id}
                prompt={message.prompt}
                schema={message.schema}
                buttons={message.buttons}
                workflowId={workflowId}
                onSubmit={onSubmitInput}
                submittedValue={submittedValue}
              />
            );

          case "loading":
            return (
              <LoadingMessage
                key={message.id}
                text={message.text}
                complete={message.complete}
              />
            );

          default:
            return null;
        }
      })}
      {showWaitingIndicator && (
        <ConnectionState message="Waiting for workflow..." />
      )}
    </div>
  );
}
