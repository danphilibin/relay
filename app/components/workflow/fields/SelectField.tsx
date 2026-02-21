import { Select } from "@cloudflare/kumo/components/select";
import type { InputFieldDefinition } from "@/isomorphic/input";
import type { FieldProps } from "../SchemaFieldComponents";

export function SelectField({
  fieldName,
  fieldDef,
  disabled,
  defaultValue,
  onChange,
}: FieldProps) {
  const def = fieldDef as Extract<InputFieldDefinition, { type: "select" }>;
  const defaultVal = defaultValue as string | undefined;

  return (
    <Select
      label={def.label}
      hideLabel={false}
      disabled={disabled}
      defaultValue={defaultVal ?? def.options?.[0]?.value}
      renderValue={(value: unknown) => {
        const opt = def.options?.find((o) => o.value === value);
        return opt?.label ?? String(value ?? "");
      }}
      onValueChange={(v) => {
        onChange(fieldName, v);
      }}
    >
      {def.options?.map((opt) => (
        <Select.Option key={opt.value} value={opt.value}>
          {opt.label}
        </Select.Option>
      ))}
    </Select>
  );
}
