import { useEffect, useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";
import type { WorkflowMeta } from "@relay-tools/sdk/client";

/**
 * Welcome-screen instructions for connecting an MCP client to this demo.
 * The URL points at this app's own /mcp route (see routes/mcp.tsx),
 * which forwards to the worker — so visitors never need the worker URL.
 *
 * `exampleWorkflow` is undefined until the workflow list loads; the
 * example prompt simply appears once it's available.
 */
export function McpInstructions({
  exampleWorkflow,
}: {
  exampleWorkflow?: WorkflowMeta;
}) {
  const mcpUrl = useMcpUrl();

  return (
    <>
      <p className="mb-3">
        Workflows are also exposed as MCP tools. Connect any MCP client to:
      </p>
      <CopyField value={mcpUrl} />

      <h3 className="text-xs font-medium uppercase tracking-wide text-[#666] mt-5 mb-2">
        Claude Code
      </h3>
      <CopyField value={`claude mcp add --transport http relay ${mcpUrl}`} />

      <h3 className="text-xs font-medium uppercase tracking-wide text-[#666] mt-5 mb-2">
        Claude Desktop / claude.ai
      </h3>
      <p>
        Settings → Connectors → Add custom connector, then paste the URL above.
      </p>

      {exampleWorkflow && (
        <p className="mt-5">
          Then try asking:{" "}
          <span className="text-white">
            “Run the {exampleWorkflow.title} workflow”
          </span>
        </p>
      )}
    </>
  );
}

/**
 * The MCP URL is derived from the browser's origin, which isn't known
 * during SSR — so it starts empty and fills in after hydration.
 */
function useMcpUrl(): string {
  const [url, setUrl] = useState("");
  useEffect(() => {
    setUrl(`${window.location.origin}/mcp`);
  }, []);
  return url;
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-2 rounded-md border border-[#222] bg-[#111] pl-3 pr-1 py-1">
      <code className="flex-1 min-w-0 break-all font-mono text-xs text-[#ccc]">
        {value}
      </code>
      <button
        onClick={copy}
        disabled={!value}
        className="shrink-0 p-1.5 rounded-md text-[#666] hover:text-white hover:bg-[#1a1a1a] transition-colors"
        title={copied ? "Copied" : "Copy"}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}
