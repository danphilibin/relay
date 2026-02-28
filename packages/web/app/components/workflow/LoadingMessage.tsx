import { Loader } from "@cloudflare/kumo/components/loader";
import { Check } from "@phosphor-icons/react";

interface LoadingMessageProps {
  text: string;
  complete: boolean;
}

export function LoadingMessage({ text, complete }: LoadingMessageProps) {
  return (
    <div className="text-base leading-relaxed text-[#888] flex items-center gap-2">
      {complete ? (
        <Check size={16} weight="bold" className="text-green-500" />
      ) : (
        <Loader size="sm" />
      )}
      {text}
    </div>
  );
}
