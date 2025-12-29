import { useEffect, useRef, useState, type JSX } from "react";
import { useNavigate, useParams } from "react-router";
import type { Route } from "./+types/workflow";

export function meta({ params }: Route.MetaArgs) {
  return [
    { title: `${params.workflowName} - Workflow Stream` },
    { name: "description", content: "Workflow Stream" },
  ];
}

export default function Workflow() {
  const { workflowName, runId } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [messages, setMessages] = useState<JSX.Element[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (runId) {
      connectToStream(runId);
    }
  }, [runId]);

  async function submitInput(eventName: string, workflowId: string) {
    const inputEl = document.getElementById(
      `input-${eventName}`,
    ) as HTMLInputElement;
    const value = inputEl?.value;

    if (!value) {
      alert("Please enter a value");
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
      alert("Failed to submit input");
    }
  }

  async function connectToStream(workflowId: string) {
    setMessages([]);
    setStatus("Connecting to stream...");

    try {
      const streamResponse = await fetch(`/stream/${workflowId}`);
      const reader = streamResponse.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      setStatus("Connected to stream. Receiving messages...");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter((line) => line.trim());

        for (const line of lines) {
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
                <div key={prev.length} className="my-1">
                  {message.text}
                </div>,
              ]);
            } else if (message.type === "input_request") {
              setMessages((prev) => [
                ...prev,
                <div key={prev.length} className="my-2 p-2 bg-blue-50 rounded">
                  <div className="mb-1">{message.prompt}</div>
                  <input
                    type="text"
                    id={`input-${message.eventName}`}
                    className="px-2 py-1 border rounded w-48"
                  />
                  <button
                    onClick={() => submitInput(message.eventName, workflowId)}
                    className="ml-2 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Submit
                  </button>
                </div>,
              ]);
            } else if (message.type === "input_received") {
              setMessages((prev) => [
                ...prev,
                <div key={prev.length} className="my-1 text-gray-600">
                  &gt; {message.value}
                </div>,
              ]);
            }
          } catch (e) {
            console.error("Failed to handle message:", message, e);
          }
        }
      }

      setStatus("Stream complete.");
    } catch (error) {
      setStatus(`Error: ${(error as Error).message}`);
    }
  }

  function formatWorkflowName(name?: string): string {
    if (!name) return "";
    return name
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  return (
    <div className="max-w-3xl mx-auto p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate("/")}
            className="text-blue-500 hover:text-blue-600 text-sm mb-2 flex items-center gap-1"
          >
            ← Back to workflows
          </button>
          <h1 className="text-2xl font-bold">
            {formatWorkflowName(workflowName)}
          </h1>
          <p className="text-gray-400 text-sm font-mono">Run ID: {runId}</p>
        </div>
      </div>

      {status && <div className="mb-4 text-gray-600">{status}</div>}

      <div className="bg-gray-50 rounded p-4 min-h-[400px] font-mono text-sm">
        {messages}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
