import type { ReactNode } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useWorkflows } from "../lib/workflows-context";
import { McpInstructions } from "../components/McpInstructions";

const rootRoute = getRouteApi("__root__");

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Relay" },
      {
        name: "description",
        content:
          "A demo of Relay, a framework for internal tools that humans and agents can run.",
      },
    ],
  }),
  component: Home,
});

/**
 * Welcome screen. Renders immediately — nothing here waits on the
 * workflow list, which only feeds the MCP example prompt and the
 * inline connection error.
 */
function Home() {
  const { workflows, error } = useWorkflows();
  const { authEnabled } = rootRoute.useLoaderData();

  // The /mcp endpoint is disabled when auth is enabled (see routes/mcp.tsx),
  // so the MCP option is only offered in open-access mode.
  const showMcp = !authEnabled;
  const exampleWorkflow = workflows.find((w) => w.mcp);

  const browserStep = (
    <>
      <p>Select a workflow from the left to run it in the browser.</p>
      {error && (
        <p className="mt-2 text-sm text-[#a55]">
          Couldn't connect to the Relay server: {error}
        </p>
      )}
    </>
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-16 text-[15px] leading-relaxed text-[#999]">
        <h1 className="text-2xl font-semibold tracking-tight text-white mb-3">
          Welcome!
        </h1>
        <p className="mb-4">
          This is a demo of Relay, a framework for internal tools that humans
          and agents can run.
        </p>

        {showMcp ? (
          <>
            <p className="mb-5">There are two ways to run Relay workflows:</p>
            <ol className="space-y-8">
              <Step number={1} title="In the browser">
                {browserStep}
              </Step>
              <Step number={2} title="From your agent, over MCP">
                <McpInstructions exampleWorkflow={exampleWorkflow} />
              </Step>
            </ol>
          </>
        ) : (
          browserStep
        )}
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full border border-[#333] text-xs font-medium text-[#ccc]">
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-white font-medium mb-1">{title}</h2>
        {children}
      </div>
    </li>
  );
}
