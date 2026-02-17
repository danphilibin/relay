import { useState } from "react";

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
              <CheckIcon className="w-4 h-4 text-white" />
            ) : (
              <XIcon className="w-4 h-4 text-white" />
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
            <AlertIcon className="w-4 h-4 text-white" />
          </div>
          <span className="text-base font-medium text-[#fafafa]">{message}</span>
        </div>

        <div className="flex gap-2 ml-9">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleClick(true)}
            className="px-4 py-2 text-[15px] font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleClick(false)}
            className="px-4 py-2 text-[15px] font-medium rounded-md bg-red-600 text-white hover:bg-red-500 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}
