interface LoadingMessageProps {
  text: string;
  complete: boolean;
}

export function LoadingMessage({ text, complete }: LoadingMessageProps) {
  return (
    <div className="text-base leading-relaxed text-[#888] flex items-center gap-2">
      {complete ? (
        <svg
          className="w-4 h-4 text-green-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      ) : (
        <span className="inline-block w-4 h-4 border-2 border-[#444] border-t-[#888] rounded-full animate-spin" />
      )}
      {text}
    </div>
  );
}
