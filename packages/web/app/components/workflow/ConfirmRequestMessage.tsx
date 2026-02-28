import { useState } from "react";
import { Button } from "@cloudflare/kumo/components/button";
import { Warning, Check, X } from "@phosphor-icons/react";

interface ConfirmRequestMessageProps {
  eventName: string;
  message: string;
  onSubmit: (eventName: string, approved: boolean) => Promise<void>;
  submittedValue?: boolean;
}

/**
 * Confirmation dialog for approve/reject decisions.
 * Styled distinctly from input forms with warning aesthetics.
 */
export function ConfirmRequestMessage({
  eventName,
  message,
  onSubmit,
  submittedValue,
}: ConfirmRequestMessageProps) {
  const [isSubmitted, setIsSubmitted] = useState(submittedValue !== undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClick = async (approved: boolean) => {
    if (isSubmitted || isSubmitting) return;
    setIsSubmitting(true);
    await onSubmit(eventName, approved);
    setIsSubmitted(true);
    setIsSubmitting(false);
  };

  // Show result state after submission
  if (isSubmitted) {
    const approved = submittedValue ?? false;
    return (
      <div
        className={`my-4 p-5 rounded-xl border ${
          approved
            ? "bg-emerald-950/30 border-emerald-800/50"
            : "bg-red-950/30 border-red-800/50"
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
              approved ? "bg-emerald-600" : "bg-red-600"
            }`}
          >
            {approved ? (
              <Check size={16} weight="bold" className="text-white" />
            ) : (
              <X size={16} weight="bold" className="text-white" />
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-base text-[#999]">{message}</span>
            <span
              className={`text-sm font-medium ${approved ? "text-emerald-400" : "text-red-400"}`}
            >
              {approved ? "Approved" : "Rejected"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Active confirmation state
  return (
    <div className="my-4 p-5 rounded-xl border bg-amber-950/20 border-amber-700/40">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-6 h-6 rounded-full bg-amber-600 flex items-center justify-center">
            <Warning size={16} weight="bold" className="text-white" />
          </div>
          <span className="text-base font-medium text-[#fafafa]">
            {message}
          </span>
        </div>

        <div className="flex gap-2 ml-9">
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleClick(true)}
            variant="primary"
          >
            Approve
          </Button>
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleClick(false)}
            variant="destructive"
          >
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}
