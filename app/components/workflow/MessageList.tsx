import { type StreamMessage } from "@/isomorphic";
import { LogMessage } from "./LogMessage";
import { InputRequestMessage } from "./InputRequestMessage";
import { ConfirmRequestMessage } from "./ConfirmRequestMessage";
import { LoadingMessage } from "./LoadingMessage";
import { ConnectionState } from "../../routes/workflow";
import { useDelayedWaitingIndicator } from "../../hooks/useDelayedWaitingIndicator";

interface MessageListProps {
  messages: StreamMessage[];
  workflowId: string | null;
  onSubmitInput: (
    eventName: string,
    value: string | Record<string, unknown>,
  ) => Promise<void>;
  onSubmitConfirm: (eventName: string, approved: boolean) => Promise<void>;
  suppressAutoFocus?: boolean;
}

/**
 * Pairs input/confirm request messages with their following received responses.
 * Returns a processed list where received messages are consumed by their requests.
 */
function pairMessages(messages: StreamMessage[]) {
  const paired: Array<{
    message: StreamMessage;
    submittedValue?: Record<string, unknown>;
    confirmedValue?: boolean;
  }> = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];

    if (message.type === "input_request") {
      const next = messages[i + 1];
      if (next?.type === "input_received") {
        paired.push({ message, submittedValue: next.value });
        i++;
      } else {
        paired.push({ message });
      }
    } else if (message.type === "confirm_request") {
      const next = messages[i + 1];
      if (next?.type === "confirm_received") {
        paired.push({ message, confirmedValue: next.approved });
        i++;
      } else {
        paired.push({ message });
      }
    } else if (
      message.type === "input_received" ||
      message.type === "confirm_received"
    ) {
      // Orphaned received messages (shouldn't happen, but handle gracefully)
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
  onSubmitConfirm,
  suppressAutoFocus,
}: MessageListProps) {
  const pairedMessages = pairMessages(messages);

  // Detect if we're waiting for a response after user input
  const lastMessage = messages[messages.length - 1];
  const isWaitingForResponse =
    lastMessage?.type === "input_received" ||
    lastMessage?.type === "confirm_received";
  const showWaitingIndicator = useDelayedWaitingIndicator(isWaitingForResponse);

  return (
    <div className="space-y-4">
      {pairedMessages.map(({ message, submittedValue, confirmedValue }) => {
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
                suppressAutoFocus={suppressAutoFocus}
              />
            );

          case "confirm_request":
            return (
              <ConfirmRequestMessage
                key={message.id}
                eventName={message.id}
                message={message.message}
                onSubmit={onSubmitConfirm}
                submittedValue={confirmedValue}
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
