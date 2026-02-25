import { useState, useRef, useCallback } from "react";
import { type InputSchema, type NormalizedButton } from "@/isomorphic";
import { Button } from "@cloudflare/kumo/components/button";
import { FIELD_REGISTRY } from "./SchemaFieldComponents";

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
  suppressAutoFocus?: boolean;
}

const intentToVariant: Record<string, "primary" | "secondary" | "destructive"> =
  {
    primary: "primary",
    secondary: "secondary",
    danger: "destructive",
  };

function initFieldValues(
  schema: InputSchema,
  submittedValue?: Record<string, unknown>,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [fieldName, fieldDef] of Object.entries(schema)) {
    if (submittedValue && fieldName in submittedValue) {
      values[fieldName] = submittedValue[fieldName];
    } else if (fieldDef.type === "checkbox") {
      values[fieldName] = false;
    } else if (fieldDef.type === "select") {
      values[fieldName] = fieldDef.options?.[0]?.value ?? "";
    } else if (fieldDef.type === "number") {
      values[fieldName] = 0;
    } else {
      values[fieldName] = "";
    }
  }
  return values;
}

export function InputRequestMessage({
  eventName,
  prompt,
  schema,
  buttons,
  onSubmit,
  submittedValue,
  suppressAutoFocus,
}: InputRequestMessageProps) {
  const [isSubmitted, setIsSubmitted] = useState(!!submittedValue);
  const choiceRef = useRef<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>(() =>
    initFieldValues(schema, submittedValue),
  );

  const handleFieldChange = useCallback((fieldName: string, value: unknown) => {
    setFieldValues((prev) => ({ ...prev, [fieldName]: value }));
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitted) return;

    const value = { ...fieldValues };

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

  // Find first auto-focusable field
  let autoFocusFieldName: string | undefined;
  if (!suppressAutoFocus) {
    for (const [fieldName, fieldDef] of Object.entries(schema)) {
      const entry = FIELD_REGISTRY[fieldDef.type];
      if (entry?.autoFocusable) {
        autoFocusFieldName = fieldName;
        break;
      }
    }
  }

  const schemaKeys = Object.keys(schema);
  const isSimpleInput = schemaKeys.length === 1 && schemaKeys[0] === "input";

  return (
    <form
      className="my-4 p-5 rounded-xl border bg-[#111] border-[#222]"
      onSubmit={handleSubmit}
    >
      <div className="flex flex-col gap-4">
        {!isSimpleInput && (
          <span className="text-lg font-medium text-[#fafafa]">{prompt}</span>
        )}

        {Object.entries(schema).map(([fieldName, fieldDef]) => {
          const entry = FIELD_REGISTRY[fieldDef.type];
          if (!entry) return null;
          const Component = entry.component;
          return (
            <Component
              key={fieldName}
              fieldName={fieldName}
              fieldDef={fieldDef}
              disabled={isSubmitted}
              defaultValue={submittedValue?.[fieldName]}
              autoFocus={fieldName === autoFocusFieldName}
              onChange={handleFieldChange}
            />
          );
        })}

        <div className="flex gap-2">
          {buttons.map((btn) => (
            <Button
              key={btn.label}
              type={buttons.length === 1 ? "submit" : "button"}
              disabled={isSubmitted}
              onClick={(e) => handleButtonClick(btn.label, e)}
              variant={intentToVariant[btn.intent] ?? "primary"}
            >
              {btn.label}
            </Button>
          ))}
        </div>
      </div>
    </form>
  );
}
