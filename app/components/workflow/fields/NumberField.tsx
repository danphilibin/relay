import { Input } from "@cloudflare/kumo/components/input";
import type { InputFieldDefinition } from "@/isomorphic/input";
import type { FieldProps } from "../SchemaFieldComponents";

export function NumberField({
  fieldName,
  fieldDef,
  disabled,
  defaultValue,
  onChange,
}: FieldProps) {
  return (
    <Input
      type="number"
      name={fieldName}
      label={fieldDef.label}
      data-1p-ignore
      disabled={disabled}
      defaultValue={defaultValue as number | undefined}
      placeholder={
        (fieldDef as Extract<InputFieldDefinition, { type: "number" }>)
          .placeholder || ""
      }
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(fieldName, e.target.value ? Number(e.target.value) : 0);
      }}
    />
  );
}
