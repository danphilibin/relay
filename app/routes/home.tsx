import { useEffect, useRef, useState, type JSX } from "react";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Workflow Stream Demo" },
    { name: "description", content: "Workflow Stream Demo" },
  ];
}

export default function Home() {
  const [workflows, setWorkflows] = useState<string[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState("");
  const [status, setStatus] = useState("");
  const [messages, setMessages] = useState<JSX.Element[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentWorkflowIdRef = useRef<string | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    loadWorkflows();
    const urlParams = new URLSearchParams(window.location.search);
    const workflowId = urlParams.get("workflowId");
    if (workflowId) {
      connectToStream(workflowId);
    }
  }, []);

  async function loadWorkflows() {
    try {
      const response = await fetch("/workflows");
      const data = (await response.json()) as { workflows: string[] };
      setWorkflows(data.workflows);
      if (data.workflows.length > 0) {
        setSelectedWorkflow(data.workflows[0]);
      }
    } catch (error) {
      console.error("Error loading workflows:", error);
    }
  }

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
    setIsConnected(true);
    setMessages([]);
    setStatus("Connecting to stream...");
    currentWorkflowIdRef.current = workflowId;

    const url = new URL(window.location.href);
    url.searchParams.set("workflowId", workflowId);
    window.history.pushState({}, "", url);

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
    } finally {
      setIsConnected(false);
    }
  }

  async function startWorkflow() {
    if (!selectedWorkflow) {
      setStatus("Please select a workflow type");
      return;
    }

    setStatus(`Creating ${selectedWorkflow} workflow...`);

    try {
      const response = await fetch("/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: selectedWorkflow, params: {} }),
      });
      const data = (await response.json()) as { id: string };
      await connectToStream(data.id);
    } catch (error) {
      setStatus(`Error: ${(error as Error).message}`);
    }
  }

  function reset() {
    window.location.href = "/";
  }

  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Workflow Stream Demo</h1>

      <div className="mb-4 flex gap-2">
        <label htmlFor="workflowType" className="self-center">
          Workflow:
        </label>
        <select
          id="workflowType"
          value={selectedWorkflow}
          onChange={(e) => setSelectedWorkflow(e.target.value)}
          disabled={isConnected}
          className="px-3 py-2 border rounded disabled:opacity-50"
        >
          {workflows.length === 0 ? (
            <option>Loading...</option>
          ) : (
            workflows.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))
          )}
        </select>
        <button
          onClick={startWorkflow}
          disabled={isConnected}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Start Workflow
        </button>
        <button
          onClick={reset}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          Reset
        </button>
      </div>

      {status && <div className="mb-4 text-gray-600">{status}</div>}

      <div className="bg-gray-50 rounded p-4 min-h-[200px] font-mono text-sm">
        {messages}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
