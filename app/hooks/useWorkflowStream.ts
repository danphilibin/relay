import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type {
  WorkflowMessage,
  WorkflowStatus,
  InputSchema,
  LoadingMessage,
} from "../types/workflow";
import { parseStreamMessage } from "../types/workflow";

interface UseWorkflowStreamOptions {
  workflowName: string;
  runId?: string;
}

interface UseWorkflowStreamResult {
  status: WorkflowStatus;
  messages: WorkflowMessage[];
  currentRunId: string | null;
  submitInput: (eventName: string, schema?: InputSchema) => Promise<void>;
  startNewRun: () => void;
}

export function useWorkflowStream({
  workflowName,
  runId,
}: UseWorkflowStreamOptions): UseWorkflowStreamResult {
  const navigate = useNavigate();
  const [status, setStatus] = useState<WorkflowStatus>("idle");
  const [messages, setMessages] = useState<WorkflowMessage[]>([]);
  const [currentRunId, setCurrentRunId] = useState<string | null>(
    runId ?? null,
  );

  useEffect(() => {
    const abortController = new AbortController();

    async function initWorkflow() {
      setMessages([]);
      setStatus("connecting");

      try {
        let activeRunId = runId;

        // Create new run if no runId
        if (!activeRunId) {
          const response = await fetch("/workflow", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: workflowName, params: {} }),
            signal: abortController.signal,
          });
          const data = (await response.json()) as { id: string };
          activeRunId = data.id;
          setCurrentRunId(activeRunId);
          navigate(`/${workflowName}/${activeRunId}`, { replace: true });
        }

        await connectToStream(activeRunId, abortController.signal);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setStatus("error");
          setMessages([
            { type: "log", text: `Error: ${(error as Error).message}` },
          ]);
        }
      }
    }

    initWorkflow();

    return () => {
      abortController.abort();
    };
  }, [workflowName, runId, navigate]);

  async function connectToStream(workflowId: string, signal: AbortSignal) {
    try {
      const streamResponse = await fetch(`/stream/${workflowId}`, { signal });
      const reader = streamResponse.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      setStatus("streaming");

      let buffer = "";

      while (true) {
        if (signal.aborted) {
          reader.cancel();
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          let parsed;
          try {
            parsed = JSON.parse(line);
          } catch (e) {
            console.error("Failed to parse JSON:", line, e);
            continue;
          }

          try {
            const message = parseStreamMessage(parsed);
            handleStreamMessage(message);
          } catch (e) {
            console.error("Failed to validate message:", parsed, e);
          }
        }
      }

      setStatus("complete");
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return;
      }
      throw error;
    }
  }

  function handleStreamMessage(message: WorkflowMessage) {
    if (message.type === "loading") {
      // Update existing loading message or add new one
      setMessages((prev) => {
        const existingIndex = prev.findIndex(
          (msg): msg is LoadingMessage =>
            msg.type === "loading" && msg.id === message.id,
        );

        if (existingIndex !== -1) {
          // Update existing loading message
          const updated = [...prev];
          updated[existingIndex] = message;
          return updated;
        }

        // Add new loading message
        return [...prev, message];
      });
    } else {
      // All other messages are appended directly
      setMessages((prev) => [...prev, message]);
    }
  }

  async function submitInput(eventName: string, schema?: InputSchema) {
    if (!currentRunId) return;

    const formContainer = document.getElementById(`form-${eventName}`);
    if (!formContainer) return;

    let value: string | Record<string, unknown>;

    if (schema) {
      const result: Record<string, unknown> = {};
      for (const [fieldName, fieldDef] of Object.entries(schema)) {
        const input = document.getElementById(
          `input-${eventName}-${fieldName}`,
        ) as HTMLInputElement;
        if (input) {
          if (fieldDef.type === "checkbox") {
            result[fieldName] = input.checked;
          } else if (fieldDef.type === "number") {
            result[fieldName] = input.value ? Number(input.value) : 0;
          } else {
            result[fieldName] = input.value;
          }
        }
      }
      value = result;
    } else {
      const inputEl = document.getElementById(
        `input-${eventName}`,
      ) as HTMLInputElement;
      if (!inputEl?.value) return;
      value = inputEl.value;
    }

    // Disable all inputs and button
    const inputs = formContainer.querySelectorAll("input");
    inputs.forEach((input) => (input.disabled = true));
    const button = formContainer.querySelector("button");
    if (button) button.disabled = true;

    try {
      await fetch(`/workflow/${currentRunId}/event/${eventName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
    } catch (error) {
      console.error("Failed to submit input:", error);
    }
  }

  function startNewRun() {
    navigate(`/${workflowName}`);
  }

  return {
    status,
    messages,
    currentRunId,
    submitInput,
    startNewRun,
  };
}
