import { useState, useRef } from "react";
import { type InputSchema, type NormalizedButton } from "@/sdk";

interface InputRequestMessageProps {
  eventName: string;
  prompt: string;
  schema: InputSchema;
  buttons: NormalizedButton[];
  workflowId: string | null;
  onSubmit: (
    eventName: string,
    value: Record<string, unknown>,
  ) => Promise<void>;
  submittedValue?: Record<string, unknown>;
}

const intentStyles: Record<string, string> = {
  primary: "bg-white text-black hover:opacity-90",
  secondary: "bg-[#222] text-[#fafafa] hover:bg-[#333]",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

export function InputRequestMessage({
  eventName,
  prompt,
  schema,
  buttons,
  onSubmit,
  submittedValue,
}: InputRequestMessageProps) {
  const [isSubmitted, setIsSubmitted] = useState(!!submittedValue);
  const choiceRef = useRef<string | null>(null);

  const collectFormValues = (
    form: HTMLFormElement,
  ): Record<string, unknown> => {
    const formData = new FormData(form);
    const value: Record<string, unknown> = {};

    for (const [fieldName, fieldDef] of Object.entries(schema)) {
      if (fieldDef.type === "checkbox") {
        value[fieldName] = formData.get(fieldName) === "on";
      } else if (fieldDef.type === "number") {
        const raw = formData.get(fieldName);
        value[fieldName] = raw ? Number(raw) : 0;
      } else {
        value[fieldName] = formData.get(fieldName) ?? "";
      }
    }

    return value;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitted) return;

    const value = collectFormValues(e.currentTarget);

    if (choiceRef.current) {
      value.$choice = choiceRef.current;
    }

    setIsSubmitted(true);
    await onSubmit(eventName, value);
  };

  const handleButtonClick = (
    label: string,
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    choiceRef.current = label;
    // If multiple buttons, we use type="button" so manually submit
    if (buttons.length > 1) {
      e.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <form
      className="my-4 p-5 rounded-xl border bg-[#111] border-[#222]"
      onSubmit={handleSubmit}
    >
      <div className="flex flex-col gap-4">
        <span className="text-base font-medium text-[#fafafa]">{prompt}</span>

        <SchemaFields
          schema={schema}
          disabled={isSubmitted}
          values={submittedValue}
        />

        <div className="flex gap-2">
          {buttons.map((btn) => (
            <button
              key={btn.label}
              type={buttons.length === 1 ? "submit" : "button"}
              disabled={isSubmitted}
              onClick={(e) => handleButtonClick(btn.label, e)}
              className={`px-3.5 py-2 text-[15px] font-medium rounded-md active:scale-[0.98] disabled:bg-[#333] disabled:text-[#666] disabled:cursor-default transition-all ${intentStyles[btn.intent]}`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}

interface SchemaFieldsProps {
  schema: InputSchema;
  disabled: boolean;
  values?: Record<string, unknown>;
}

function SchemaFields({ schema, disabled, values }: SchemaFieldsProps) {
  // Find the first text input field name for autofocus
  const firstTextFieldName = Object.entries(schema).find(
    ([, fieldDef]) =>
      !fieldDef.type ||
      fieldDef.type === "text" ||
      (fieldDef.type !== "checkbox" &&
        fieldDef.type !== "number" &&
        fieldDef.type !== "select"),
  )?.[0];

  return (
    <>
      {Object.entries(schema).map(([fieldName, fieldDef]) => {
        const isFirstTextInput =
          fieldName === firstTextFieldName &&
          (!fieldDef.type ||
            fieldDef.type === "text" ||
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
                name={fieldName}
                disabled={disabled}
                defaultChecked={values?.[fieldName] === true}
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
                name={fieldName}
                data-1p-ignore
                disabled={disabled}
                defaultValue={values?.[fieldName] as number | undefined}
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
                name={fieldName}
                disabled={disabled}
                defaultValue={values?.[fieldName] as string | undefined}
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
              name={fieldName}
              data-1p-ignore
              disabled={disabled}
              defaultValue={values?.[fieldName] as string | undefined}
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
