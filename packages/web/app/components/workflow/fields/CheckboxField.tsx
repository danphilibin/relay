import { Checkbox } from "@cloudflare/kumo/components/checkbox";
import type { FieldProps } from "../SchemaFieldComponents";

export function CheckboxField({
  fieldName,
  fieldDef,
  disabled,
  defaultValue,
  onChange,
}: FieldProps) {
  return (
    <Checkbox
      label={fieldDef.label}
      name={fieldName}
      disabled={disabled}
      checked={defaultValue === true ? true : undefined}
      onCheckedChange={(checked) => {
        onChange(fieldName, checked);
      }}
    />
  );
}
