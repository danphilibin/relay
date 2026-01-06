import { useEffect, useRef } from "react";
import { useParams } from "react-router";
import type { Route } from "./+types/workflow";
import { useWorkflowStream } from "../hooks/useWorkflowStream";
import { MessageList } from "../components/workflow/MessageList";

export function meta({ params }: Route.MetaArgs) {
  return [
    { title: `${params.workflowName} - Workflow` },
    { name: "description", content: "Workflow Stream" },
  ];
}

const buttonClassName =
  "px-3 py-1.5 text-sm font-medium text-[#888] border border-[#333] rounded-md hover:bg-[#1a1a1a] hover:text-white transition-colors";

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
    <div className="flex h-full w-full flex-col">
      <div className="w-full border-b border-[#222] px-8 h-16 flex items-center justify-between">
        <h1 className="text-base font-semibold text-[#fafafa]">
          {formatWorkflowName(workflowName)}
        </h1>
        <div className="flex items-center gap-2">
          <a
            href={`https://github.com/danphilibin/streaming-workflows/tree/main/src/workflows/${workflowName}.ts`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClassName}
          >
            View Source
          </a>
          <button onClick={startNewRun} className={buttonClassName}>
            New Run
          </button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        <div className="max-w-[640px] p-8 space-y-4">
          {status === "connecting" && (
            <ConnectionState message="Connecting..." isLoading />
          )}

          {status === "streaming" && messages.length === 0 && (
            <ConnectionState message="Waiting for workflow..." isLoading />
          )}

          <MessageList
            messages={messages}
            workflowId={currentRunId}
            onSubmitInput={submitInput}
          />

          {status === "complete" && messages.length === 0 && (
            <ConnectionState message="No messages received." />
          )}
        </div>
      </div>
    </div>
  );
}

function ConnectionState({
  message,
  isLoading,
}: {
  message: string;
  isLoading?: boolean;
}) {
  return (
    <div className="text-base text-[#666] flex items-center gap-2">
      {isLoading && (
        <span className="w-1.5 h-1.5 rounded-full bg-[#666] animate-pulse-dot" />
      )}
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
