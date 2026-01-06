import { useEffect, useRef } from "react";
import { useParams } from "react-router";
import type { Route } from "./+types/workflow";
import { useWorkflowStream } from "../hooks/useWorkflowStream";
import { MessageList } from "../components/workflow/MessageList";
import { LoadingMessage } from "../components/workflow/LoadingMessage";

export function meta({ params }: Route.MetaArgs) {
  return [
    { title: `${params.workflowName} - Workflow` },
    { name: "description", content: "Workflow Stream" },
  ];
}

const buttonClassName =
  "px-3 py-1.5 text-sm font-medium text-[#888] border border-[#333] rounded-md hover:bg-[#1a1a1a] hover:text-white transition-colors";

const primaryButtonClassName =
  "px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors cursor-pointer";

export default function Workflow() {
  const { workflowName, runId } = useParams();
  const containerRef = useRef<HTMLDivElement>(null);

  const { status, messages, currentRunId, submitInput, startNewRun } =
    useWorkflowStream({
      workflowName: workflowName!,
      runId,
    });

  // Auto-scroll on new messages
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex-1 flex h-full w-full flex-col">
      <div className="w-full border-b border-[#222] px-8 h-16 flex items-center justify-between">
        <h1 className="text-base font-semibold text-[#fafafa]">
          {formatWorkflowName(workflowName)}
        </h1>
        <div className="flex items-center gap-2">
          <a
            href={`https://github.com/danphilibin/streaming-workflows/tree/main/src/workflows/${workflowName}.ts`}
            target="_blank"
            rel="noopener noreferrer"
            className={`${buttonClassName} flex items-center gap-1.5`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 1024 1024"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="shrink-0"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M8 0C3.58 0 0 3.58 0 8C0 11.54 2.29 14.53 5.47 15.59C5.87 15.66 6.02 15.42 6.02 15.21C6.02 15.02 6.01 14.39 6.01 13.72C4 14.09 3.48 13.23 3.32 12.78C3.23 12.55 2.84 11.84 2.5 11.65C2.22 11.5 1.82 11.13 2.49 11.12C3.12 11.11 3.57 11.7 3.72 11.94C4.44 13.15 5.59 12.81 6.05 12.6C6.12 12.08 6.33 11.73 6.56 11.53C4.78 11.33 2.92 10.64 2.92 7.58C2.92 6.71 3.23 5.99 3.74 5.43C3.66 5.23 3.38 4.41 3.82 3.31C3.82 3.31 4.49 3.1 6.02 4.13C6.66 3.95 7.34 3.86 8.02 3.86C8.7 3.86 9.38 3.95 10.02 4.13C11.55 3.09 12.22 3.31 12.22 3.31C12.66 4.41 12.38 5.23 12.3 5.43C12.81 5.99 13.12 6.7 13.12 7.58C13.12 10.65 11.25 11.33 9.47 11.53C9.76 11.78 10.01 12.26 10.01 13.01C10.01 14.08 10 14.94 10 15.21C10 15.42 10.15 15.67 10.55 15.59C13.71 14.53 16 11.53 16 8C16 3.58 12.42 0 8 0Z"
                transform="scale(64)"
                fill="currentColor"
              />
            </svg>
            View Source
          </a>
          <button onClick={startNewRun} className={primaryButtonClassName}>
            New Run
          </button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        <div className="max-w-[640px] p-8 space-y-4">
          {status === "connecting" && (
            <LoadingMessage text="Connecting..." complete={false} />
          )}

          {status === "streaming" && messages.length === 0 && (
            <ConnectionState message="Waiting for workflow..." />
          )}

          <MessageList
            messages={messages}
            workflowId={currentRunId}
            onSubmitInput={submitInput}
          />

          {status === "complete" && messages.length === 0 && (
            <div className="text-base text-[#666]">No messages received.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ConnectionState({ message }: { message: string }) {
  return (
    <div className="text-base text-[#666] flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-[#666] animate-pulse-dot" />
      {message}
    </div>
  );
}

function formatWorkflowName(name?: string): string {
  if (!name) return "";
  return name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
