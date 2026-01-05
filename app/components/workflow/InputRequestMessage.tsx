import type { InputSchema } from "../../types/workflow";

interface InputRequestMessageProps {
  eventName: string;
  prompt: string;
  schema?: InputSchema;
  workflowId: string | null;
  onSubmit: (eventName: string, schema?: InputSchema) => Promise<void>;
}

export function InputRequestMessage({
  eventName,
  prompt,
  schema,
  onSubmit,
}: InputRequestMessageProps) {
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await onSubmit(eventName, schema);
  };

  return (
    <form
      id={`form-${eventName}`}
      className="my-4 p-5 rounded-xl border bg-[#111] border-[#222]"
      onSubmit={handleSubmit}
    >
      <div className="flex flex-col gap-4">
        <span className="text-base font-medium text-[#fafafa]">{prompt}</span>

        {schema ? (
          <SchemaFields eventName={eventName} schema={schema} />
        ) : (
          <input
            type="text"
            id={`input-${eventName}`}
            data-1p-ignore
            placeholder="Type here..."
            autoFocus
            className="w-full px-3 py-2.5 text-base bg-black border border-[#333] rounded-md text-[#fafafa] placeholder:text-[#666] focus:outline-none focus:border-[#888] focus:ring-[3px] focus:ring-white/5 disabled:bg-[#0a0a0a] disabled:border-[#222] disabled:text-[#888] transition-all"
          />
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            className="px-3.5 py-2 text-[15px] font-medium bg-white text-black rounded-md hover:opacity-90 active:scale-[0.98] disabled:bg-[#333] disabled:text-[#666] disabled:cursor-default transition-all"
          >
            Continue
          </button>
        </div>
      </div>
    </form>
  );
}

interface SchemaFieldsProps {
  eventName: string;
  schema: InputSchema;
}

function SchemaFields({ eventName, schema }: SchemaFieldsProps) {
  // Find the first text input field name
  const firstTextFieldName = Object.entries(schema).find(
    ([, fieldDef]) =>
      fieldDef.type === "text" ||
      !fieldDef.type ||
      (fieldDef.type !== "checkbox" &&
        fieldDef.type !== "number" &&
        fieldDef.type !== "select"),
  )?.[0];

  return (
    <>
      {Object.entries(schema).map(([fieldName, fieldDef]) => {
        const inputId = `input-${eventName}-${fieldName}`;
        const isFirstTextInput =
          fieldName === firstTextFieldName &&
          (fieldDef.type === "text" ||
            !fieldDef.type ||
            (fieldDef.type !== "checkbox" &&
              fieldDef.type !== "number" &&
              fieldDef.type !== "select"));

        if (fieldDef.type === "checkbox") {
          return (
            <label
              key={fieldName}
              className="flex items-center gap-3 cursor-pointer"
            >
              <input
                type="checkbox"
                id={inputId}
                className="w-4 h-4 rounded border-[#333] bg-black text-white focus:ring-white/20 focus:ring-offset-0"
              />
              <span className="text-sm text-[#ccc]">{fieldDef.label}</span>
            </label>
          );
        }

        if (fieldDef.type === "number") {
          return (
            <label key={fieldName} className="flex flex-col gap-2">
              <span className="text-sm text-[#888]">{fieldDef.label}</span>
              <input
                type="number"
                id={inputId}
                data-1p-ignore
                placeholder={fieldDef.placeholder || ""}
                className="w-full px-3 py-2.5 text-base bg-black border border-[#333] rounded-md text-[#fafafa] placeholder:text-[#666] focus:outline-none focus:border-[#888] focus:ring-[3px] focus:ring-white/5 disabled:bg-[#0a0a0a] disabled:border-[#222] disabled:text-[#888] transition-all"
              />
            </label>
          );
        }

        if (fieldDef.type === "select") {
          return (
            <label key={fieldName} className="flex flex-col gap-2">
              <span className="text-sm text-[#888]">{fieldDef.label}</span>
              <select
                id={inputId}
                className="w-full px-3 py-2.5 text-base bg-black border border-[#333] rounded-md text-[#fafafa] focus:outline-none focus:border-[#888] focus:ring-[3px] focus:ring-white/5 disabled:bg-[#0a0a0a] disabled:border-[#222] disabled:text-[#888] transition-all"
              >
                {fieldDef.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        // Default: text input
        return (
          <label key={fieldName} className="flex flex-col gap-2">
            <span className="text-sm text-[#888]">{fieldDef.label}</span>
            <input
              type="text"
              id={inputId}
              data-1p-ignore
              placeholder={fieldDef.placeholder || ""}
              autoFocus={isFirstTextInput}
              className="w-full px-3 py-2.5 text-base bg-black border border-[#333] rounded-md text-[#fafafa] placeholder:text-[#666] focus:outline-none focus:border-[#888] focus:ring-[3px] focus:ring-white/5 disabled:bg-[#0a0a0a] disabled:border-[#222] disabled:text-[#888] transition-all"
            />
          </label>
        );
      })}
    </>
  );
}
