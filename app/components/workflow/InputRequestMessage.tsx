import { useState, useRef } from "react";
import { type InputSchema, type NormalizedButton } from "@/isomorphic";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { Checkbox } from "@cloudflare/kumo/components/checkbox";
import { Select } from "@cloudflare/kumo/components/select";

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
  // Track select/checkbox values for form submission (Kumo uses Base UI which
  // may not render native form elements for FormData collection)
  const controlledValues = useRef<Record<string, unknown>>({});

  const collectFormValues = (
    form: HTMLFormElement,
  ): Record<string, unknown> => {
    const formData = new FormData(form);
    const value: Record<string, unknown> = {};

    for (const [fieldName, fieldDef] of Object.entries(schema)) {
      if (fieldDef.type === "checkbox") {
        value[fieldName] = controlledValues.current[fieldName] ?? false;
      } else if (fieldDef.type === "select") {
        value[fieldName] = controlledValues.current[fieldName] ?? "";
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
          controlledValues={controlledValues}
          suppressAutoFocus={suppressAutoFocus}
        />

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

interface SchemaFieldsProps {
  schema: InputSchema;
  disabled: boolean;
  values?: Record<string, unknown>;
  controlledValues: React.RefObject<Record<string, unknown>>;
  suppressAutoFocus?: boolean;
}

function SchemaFields({
  schema,
  disabled,
  values,
  controlledValues,
  suppressAutoFocus,
}: SchemaFieldsProps) {
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
          // Initialize controlled value from submitted data
          if (!(fieldName in controlledValues.current)) {
            controlledValues.current[fieldName] = values?.[fieldName] === true;
          }

          return (
            <Checkbox
              key={fieldName}
              label={fieldDef.label}
              name={fieldName}
              disabled={disabled}
              checked={values?.[fieldName] === true ? true : undefined}
              onCheckedChange={(checked) => {
                controlledValues.current[fieldName] = checked;
              }}
            />
          );
        }

        if (fieldDef.type === "number") {
          return (
            <Input
              key={fieldName}
              type="number"
              name={fieldName}
              label={fieldDef.label}
              data-1p-ignore
              disabled={disabled}
              defaultValue={values?.[fieldName] as number | undefined}
              placeholder={fieldDef.placeholder || ""}
            />
          );
        }

        if (fieldDef.type === "select") {
          const defaultVal = values?.[fieldName] as string | undefined;
          // Initialize controlled value from submitted/default data
          if (
            defaultVal !== undefined &&
            !(fieldName in controlledValues.current)
          ) {
            controlledValues.current[fieldName] = defaultVal;
          } else if (
            !(fieldName in controlledValues.current) &&
            fieldDef.options?.length
          ) {
            controlledValues.current[fieldName] = fieldDef.options[0].value;
          }

          return (
            <Select
              key={fieldName}
              label={fieldDef.label}
              hideLabel={false}
              disabled={disabled}
              defaultValue={defaultVal ?? fieldDef.options?.[0]?.value}
              renderValue={(value: unknown) => {
                const opt = fieldDef.options?.find((o) => o.value === value);
                return opt?.label ?? String(value ?? "");
              }}
              onValueChange={(v) => {
                controlledValues.current[fieldName] = v;
              }}
            >
              {fieldDef.options?.map((opt) => (
                <Select.Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Select.Option>
              ))}
            </Select>
          );
        }

        // Default: text input
        return (
          <Input
            key={fieldName}
            type="text"
            name={fieldName}
            label={fieldDef.label}
            data-1p-ignore
            disabled={disabled}
            defaultValue={values?.[fieldName] as string | undefined}
            placeholder={fieldDef.placeholder || ""}
            autoFocus={isFirstTextInput && !suppressAutoFocus}
          />
        );
      })}
    </>
  );
}
