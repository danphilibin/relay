import { Input } from "@cloudflare/kumo/components/input";
import type { InputFieldDefinition } from "@/isomorphic/input";
import type { FieldProps } from "../SchemaFieldComponents";

export function TextField({
  fieldName,
  fieldDef,
  disabled,
  defaultValue,
  autoFocus,
  onChange,
}: FieldProps) {
  return (
    <Input
      type="text"
      name={fieldName}
      label={fieldDef.label}
      data-1p-ignore
      disabled={disabled}
      defaultValue={defaultValue as string | undefined}
      placeholder={
        (fieldDef as Extract<InputFieldDefinition, { type: "text" }>)
          .placeholder || ""
      }
      autoFocus={autoFocus}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(fieldName, e.target.value);
      }}
    />
  );
}
