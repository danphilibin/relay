import { useEffect, useRef, useState, type JSX } from "react";
import { useNavigate, useParams } from "react-router";
import type { Route } from "./+types/workflow";

export function meta({ params }: Route.MetaArgs) {
  return [
    { title: `${params.workflowName} - Workflow` },
    { name: "description", content: "Workflow Stream" },
  ];
}

type WorkflowStatus = "idle" | "connecting" | "streaming" | "complete" | "error";

export default function Workflow() {
  const { workflowName, runId } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<WorkflowStatus>("idle");
  const [messages, setMessages] = useState<JSX.Element[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const abortController = new AbortController();

    async function initWorkflow() {
      setMessages([]);
      setStatus("connecting");

      try {
        let currentRunId = runId;

        // Create new run if no runId
        if (!currentRunId) {
          const response = await fetch("/workflow", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: workflowName, params: {} }),
            signal: abortController.signal,
          });
          const data = (await response.json()) as { id: string };
          currentRunId = data.id;
          navigate(`/${workflowName}/${currentRunId}`, { replace: true });
        }

        await connectToStream(currentRunId, abortController.signal);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setStatus("error");
          setMessages([
            <div key="error" className="py-3 text-base text-[#666] flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              Error: {(error as Error).message}
            </div>,
          ]);
        }
      }
    }

    initWorkflow();

    return () => {
      abortController.abort();
    };
  }, [workflowName, runId, navigate]);

  async function submitInput(eventName: string, workflowId: string) {
    const inputEl = document.getElementById(
      `input-${eventName}`,
    ) as HTMLInputElement;
    const value = inputEl?.value;

    if (!value) {
      return;
    }

    inputEl.disabled = true;
    const button = inputEl.parentElement?.querySelector("button");
    if (button) {
      (button as HTMLButtonElement).disabled = true;
    }

    try {
      await fetch(`/workflow/${workflowId}/event/${eventName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
    } catch (error) {
      console.error("Failed to submit input:", error);
    }
  }

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

          let message;
          try {
            message = JSON.parse(line);
          } catch (e) {
            console.error("Failed to parse JSON:", line, e);
            continue;
          }

          try {
            if (message.type === "log") {
              setMessages((prev) => [
                ...prev,
                <div key={prev.length} className="py-3 text-base leading-relaxed text-[#888]">
                  {message.text}
                </div>,
              ]);
            } else if (message.type === "input_request") {
              setMessages((prev) => [
                ...prev,
                <div
                  key={prev.length}
                  className="my-4 p-5 rounded-xl border bg-[#111] border-[#222]"
                >
                  <div className="flex flex-col gap-4">
                    <label className="flex flex-col gap-2">
                      <span className="text-base font-medium text-[#fafafa]">
                        {message.prompt}
                      </span>
                      <input
                        type="text"
                        id={`input-${message.eventName}`}
                        data-1p-ignore
                        placeholder="Type here..."
                        className="w-full px-3 py-2.5 text-base bg-black border border-[#333] rounded-md text-[#fafafa] placeholder:text-[#666] focus:outline-none focus:border-[#888] focus:ring-[3px] focus:ring-white/5 disabled:bg-[#0a0a0a] disabled:border-[#222] disabled:text-[#888] transition-all"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            submitInput(message.eventName, workflowId);
                          }
                        }}
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => submitInput(message.eventName, workflowId)}
                        className="px-3.5 py-2 text-[15px] font-medium bg-white text-black rounded-md hover:opacity-90 active:scale-[0.98] disabled:bg-[#333] disabled:text-[#666] disabled:cursor-default transition-all"
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                </div>,
              ]);
            } else if (message.type === "input_received") {
              setMessages((prev) => [
                ...prev,
                <div key={prev.length} className="py-3 text-base leading-relaxed text-[#888]">
                  <span className="text-[#666]">&gt;</span> {message.value}
                </div>,
              ]);
            }
          } catch (e) {
            console.error("Failed to handle message:", message, e);
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

  function formatWorkflowName(name?: string): string {
    if (!name) return "";
    return name
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  async function startNewRun() {
    navigate(`/${workflowName}`);
  }

  return (
    <div className="flex h-full w-full">
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        <div className="max-w-[640px] p-8">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-xl font-semibold text-[#fafafa]">
              {formatWorkflowName(workflowName)}
            </h1>
            <button
              onClick={startNewRun}
              className="px-3 py-1.5 text-sm font-medium text-[#888] border border-[#333] rounded-md hover:bg-[#1a1a1a] hover:text-white transition-colors"
            >
              New Run
            </button>
          </div>

          {/* Connecting state */}
          {status === "connecting" && (
            <div className="py-3 text-base text-[#666] flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#666] animate-pulse-dot" />
              Connecting...
            </div>
          )}

          {/* Messages */}
          {messages}

          {/* Complete state with no messages */}
          {status === "complete" && messages.length === 0 && (
            <div className="py-3 text-base text-[#666]">
              No messages received.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
