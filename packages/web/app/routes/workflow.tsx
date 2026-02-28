import { useEffect, useRef } from "react";
import { useParams } from "react-router";
import { Button, LinkButton } from "@cloudflare/kumo/components/button";
import { GithubLogo } from "@phosphor-icons/react";
import type { Route } from "./+types/workflow";
import { useWorkflowStream } from "../hooks/useWorkflowStream";
import { MessageList } from "../components/workflow/MessageList";
import { LoadingMessage } from "../components/workflow/LoadingMessage";
import { DevConsole } from "../components/workflow/DevConsole";

export function meta({ params }: Route.MetaArgs) {
  return [
    { title: `${params.workflowName} - Workflow` },
    { name: "description", content: "Workflow Stream" },
  ];
}

export default function Workflow() {
  const { workflowName, runId } = useParams();
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    status,
    messages,
    currentRunId,
    submitInput,
    submitConfirm,
    startNewRun,
  } = useWorkflowStream({
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
    <div className="flex-1 flex h-full w-full">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="w-full border-b border-[#222] px-8 h-16 flex items-center justify-between">
          <h1 className="text-base font-semibold text-[#fafafa]">
            {formatWorkflowName(workflowName)}
          </h1>
          <div className="flex items-center gap-2">
            <LinkButton
              href={`https://github.com/danphilibin/streaming-workflows/tree/main/src/workflows/${workflowName}.ts`}
              variant="secondary"
              icon={GithubLogo}
              external
            >
              View Source
            </LinkButton>
            <Button variant="primary" onClick={startNewRun}>
              New Run
            </Button>
          </div>
        </div>
        <div ref={containerRef} className="flex-1 overflow-y-auto">
          <div className="p-8 space-y-4">
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
              onSubmitConfirm={submitConfirm}
            />

            {status === "complete" && messages.length === 0 && (
              <div className="text-base text-[#666]">No messages received.</div>
            )}
          </div>
        </div>
      </div>
      <DevConsole status={status} runId={currentRunId} messages={messages} />
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
