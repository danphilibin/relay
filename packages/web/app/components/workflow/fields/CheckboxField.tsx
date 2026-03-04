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
    <div className="flex items-start">
      <Checkbox
        label={<span className="text-base">{fieldDef.label}</span>}
        name={fieldName}
        disabled={disabled}
        checked={defaultValue === true ? true : undefined}
        onCheckedChange={(checked) => {
          onChange(fieldName, checked);
        }}
      />
      {fieldDef.description && (
        <p className="mt-0.5 ml-6 text-sm text-kumo-subtle">
          {fieldDef.description}
        </p>
      )}
    </div>
  );
}
