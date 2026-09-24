import { useEffect, useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";

/**
 * Welcome-screen instructions for connecting an MCP client to this demo.
 * The URL points at this app's own /mcp route (see routes/mcp.tsx),
 * which forwards to the worker — so visitors never need the worker URL.
 */
export function McpInstructions() {
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

      {/* Hardcoded: Process Refund (apps/examples) best shows off a
          multi-step workflow that pauses for input. It must stay mcp: true. */}
      <p className="mt-5">
        Then try asking:{" "}
        <span className="text-white">“Run the Process Refund workflow”</span>
      </p>
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
