import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  type StreamMessage,
  type WorkflowStatus,
  type LoadingMessage,
  parseStreamMessage,
  type StartWorkflowParams,
  type WorkflowParams,
} from "@/isomorphic";

interface UseWorkflowStreamOptions {
  workflowName: string;
  runId?: string;
}

interface UseWorkflowStreamResult {
  status: WorkflowStatus;
  messages: StreamMessage[];
  currentRunId: string | null;
  submitInput: (
    eventName: string,
    value: string | Record<string, unknown>,
  ) => Promise<void>;
  submitConfirm: (eventName: string, approved: boolean) => Promise<void>;
  startNewRun: () => void;
}

export function useWorkflowStream({
  workflowName,
  runId,
}: UseWorkflowStreamOptions): UseWorkflowStreamResult {
  const navigate = useNavigate();
  const [status, setStatus] = useState<WorkflowStatus>("idle");
  const [messages, setMessages] = useState<StreamMessage[]>([]);
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

        const body = {
          name: workflowName,
        } satisfies WorkflowParams;

        // Create new run if no runId
        if (!activeRunId) {
          const response = await fetch("/workflows", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: abortController.signal,
          });
          const data = await response.json<StartWorkflowParams>();
          activeRunId = data.id;
          setCurrentRunId(activeRunId);
          navigate(`/${workflowName}/${activeRunId}`, { replace: true });
        }

        await connectToStream(activeRunId, abortController.signal);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setStatus("error");
          setMessages([
            {
              id: "error",
              type: "log",
              text: `Error: ${(error as Error).message}`,
            },
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
      const streamResponse = await fetch(`/workflows/${workflowId}/stream`, {
        signal,
      });
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

  function handleStreamMessage(message: StreamMessage) {
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

  async function submitInput(
    eventName: string,
    value: string | Record<string, unknown>,
  ) {
    if (!currentRunId) return;

    await fetch(`/workflows/${currentRunId}/event/${eventName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
  }

  async function submitConfirm(eventName: string, approved: boolean) {
    if (!currentRunId) return;

    await fetch(`/workflows/${currentRunId}/event/${eventName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved }),
    });
  }

  function startNewRun() {
    navigate(`/${workflowName}`);
  }

  return {
    status,
    messages,
    currentRunId,
    submitInput,
    submitConfirm,
    startNewRun,
  };
}
