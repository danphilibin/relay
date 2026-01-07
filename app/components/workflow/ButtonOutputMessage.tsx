import { useState } from "react";

interface ButtonOutputMessageProps {
  label: string;
  loaderKey: string;
  workflowSlug: string;
  context?: Record<string, unknown>;
}

export function ButtonOutputMessage({
  label,
  loaderKey,
  workflowSlug,
  context,
}: ButtonOutputMessageProps) {
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const handleClick = async (extraParams?: Record<string, unknown>) => {
    setLoading(true);
    try {
      // Merge context (from workflow) with extra params (from UI, e.g., page number)
      const params = { ...context, ...extraParams };
      const queryString = Object.keys(params).length
        ? "?" +
          new URLSearchParams(
            Object.entries(params).map(([k, v]) => [k, JSON.stringify(v)]),
          ).toString()
        : "";

      const response = await fetch(
        `/workflows/${workflowSlug}/loader/${loaderKey}${queryString}`,
      );
      const data = (await response.json()) as { result: unknown };
      setResult(data.result);
    } catch (error) {
      console.error("Loader error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => handleClick()}
        disabled={loading}
        className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Loading..." : label}
      </button>
      {result !== null && (
        <span className="text-base text-[#888]">
          {typeof result === "object" ? JSON.stringify(result) : String(result)}
        </span>
      )}
    </div>
  );
}

