import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
  type TransitionEvent,
} from "react";
import { CaretDown, CaretRight, Terminal } from "@phosphor-icons/react";
import type { StreamMessage, WorkflowStatus } from "@relay-tools/sdk/client";

interface DevConsoleRun {
  status: WorkflowStatus;
  runId: string | null;
  messages: StreamMessage[];
}

const DevConsoleContext = createContext<{
  run: DevConsoleRun | null;
  setRun: (run: DevConsoleRun | null) => void;
  isVisible: boolean;
  toggle: () => void;
} | null>(null);

export function DevConsoleProvider({ children }: { children: ReactNode }) {
  const [run, setRun] = useState<DevConsoleRun | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const toggle = useCallback(() => setIsVisible((visible) => !visible), []);
  return (
    <DevConsoleContext.Provider value={{ run, setRun, isVisible, toggle }}>
      {children}
    </DevConsoleContext.Provider>
  );
}

/** Shared with the welcome-page miniature, which toggles the same panel. */
export function useDevConsoleToggle() {
  const ctx = useContext(DevConsoleContext);
  if (!ctx) {
    throw new Error("useDevConsoleToggle requires DevConsoleProvider");
  }
  return { isVisible: ctx.isVisible, toggle: ctx.toggle };
}

/**
 * The console lives in the root layout, so a workflow page publishes
 * its run here. Layout effects, with a separate unmount clear, avoid
 * flashing the empty state between messages.
 */
export function usePublishDevConsoleRun(
  status: WorkflowStatus,
  runId: string | null,
  messages: StreamMessage[],
) {
  const setRun = useContext(DevConsoleContext)?.setRun;

  useLayoutEffect(() => {
    setRun?.({ status, runId, messages });
  }, [status, runId, messages, setRun]);

  useLayoutEffect(() => {
    return () => setRun?.(null);
  }, [setRun]);

  if (!setRun) {
    throw new Error("usePublishDevConsoleRun requires DevConsoleProvider");
  }
}

function useDevConsoleRun(): DevConsoleRun | null {
  const ctx = useContext(DevConsoleContext);
  if (!ctx) {
    throw new Error("DevConsole requires DevConsoleProvider");
  }
  return ctx.run;
}

export function DevConsole() {
  const run = useDevConsoleRun();
  const { isVisible, toggle } = useDevConsoleToggle();
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(
    new Set(),
  );
  // Stay mounted through the close animation so it can animate out.
  const [rendered, setRendered] = useState(isVisible);

  useEffect(() => {
    if (isVisible) {
      setRendered(true);
    } else if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // No transition fires with reduced motion, so unmount immediately
      setRendered(false);
    }
  }, [isVisible]);

  const handleTransitionEnd = (e: TransitionEvent<HTMLDivElement>) => {
    if (
      e.target === e.currentTarget &&
      e.propertyName === "width" &&
      !isVisible
    ) {
      setRendered(false);
    }
  };

  // Indices belong to one run's message list.
  useEffect(() => {
    setExpandedMessages(new Set());
  }, [run?.runId]);

  const toggleMessage = (index: number) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedMessages(new Set(run?.messages.map((_, i) => i) ?? []));
  };

  const collapseAll = () => {
    setExpandedMessages(new Set());
  };

  return (
    <>
      {/* Fixed toggle button - always visible */}
      <button
        onClick={toggle}
        className="fixed right-4 bottom-4 p-2 bg-[#1a1a1a] border border-[#333] rounded-lg hover:bg-[#222] transition-colors z-50"
        title={isVisible ? "Hide Dev Console" : "Show Dev Console"}
      >
        <Terminal
          size={20}
          className={isVisible ? "text-[#9ec1ff]" : "text-[#888]"}
        />
      </button>

      {rendered && (
        <div
          className={`h-full shrink-0 overflow-hidden transition-[width,opacity] duration-200 ease-out motion-reduce:transition-none starting:w-0 starting:opacity-0 ${isVisible ? "w-75 opacity-100" : "w-0 opacity-0"}`}
          onTransitionEnd={handleTransitionEnd}
        >
          <div className="w-75 h-full border-l border-[#222] bg-[#0d0d0d] flex flex-col">
            {/* Header */}
            <div className="px-3 py-3 border-b border-[#222] flex items-center gap-2">
              <Terminal size={14} className="text-[#666]" />
              <span className="text-xs font-medium text-[#888]">
                Dev console
              </span>
            </div>

            {run ? (
              <>
                <div className="px-3 py-2 border-b border-[#222] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-[#555]">
                      Run ID
                    </span>
                    <span className="text-xs font-mono text-[#888]">
                      {run.runId ? truncateId(run.runId) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-[#555]">
                      Status
                    </span>
                    <StatusBadge status={run.status} />
                  </div>
                </div>

                <div className="px-3 py-1.5 border-b border-[#222] flex items-center justify-between">
                  <span className="text-[10px] text-[#555]">
                    {run.messages.length} message
                    {run.messages.length !== 1 ? "s" : ""}
                  </span>
                  <button
                    onClick={
                      expandedMessages.size === run.messages.length
                        ? collapseAll
                        : expandAll
                    }
                    className="text-[10px] text-[#666] hover:text-[#888] transition-colors"
                  >
                    {expandedMessages.size === run.messages.length
                      ? "Collapse"
                      : "Expand"}{" "}
                    all
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {run.messages.length === 0 ? (
                    <div className="p-3 text-xs text-[#555] text-center">
                      No messages yet
                    </div>
                  ) : (
                    <div>
                      {run.messages.map((message, index) => (
                        <MessageRow
                          key={`${message.id}-${index}`}
                          message={message}
                          index={index}
                          isExpanded={expandedMessages.has(index)}
                          onToggle={() => toggleMessage(index)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-6 text-center">
                <p className="text-xs text-[#555]">No workflow running</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function StatusBadge({ status }: { status: WorkflowStatus }) {
  const config: Record<WorkflowStatus, { color: string; bg: string }> = {
    idle: { color: "text-[#666]", bg: "bg-[#222]" },
    connecting: { color: "text-yellow-400", bg: "bg-yellow-400/10" },
    streaming: { color: "text-green-400", bg: "bg-green-400/10" },
    complete: { color: "text-blue-400", bg: "bg-blue-400/10" },
    error: { color: "text-red-400", bg: "bg-red-400/10" },
  };

  const { color, bg } = config[status];

  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${color} ${bg}`}>
      {status}
    </span>
  );
}

function MessageRow({
  message,
  index,
  isExpanded,
  onToggle,
}: {
  message: StreamMessage;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const typeColors: Record<string, string> = {
    output: "text-purple-400",
    input_request: "text-yellow-400",
    input_received: "text-yellow-300",
    confirm_request: "text-orange-400",
    confirm_received: "text-orange-300",
    loading: "text-gray-400",
    workflow_complete: "text-green-400",
  };

  return (
    <div className="border-t border-[#1a1a1a] first:border-t-0 hover:bg-[#111] transition-colors">
      <button
        onClick={onToggle}
        className="w-full px-3 py-1.5 flex items-center gap-2 text-left"
      >
        {isExpanded ? (
          <CaretDown size={10} className="text-[#555] shrink-0" />
        ) : (
          <CaretRight size={10} className="text-[#555] shrink-0" />
        )}
        <span className="text-[10px] text-[#444] font-mono w-4">{index}</span>
        <span
          className={`text-[11px] font-mono ${typeColors[message.type] || "text-[#888]"}`}
        >
          {message.type}
        </span>
      </button>
      {isExpanded && (
        <div className="px-3 pb-2">
          <pre className="text-[10px] font-mono text-[#777] bg-[#0a0a0a] rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(message, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function truncateId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}
