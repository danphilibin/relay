import type { InputFieldDefinition } from "@/isomorphic/input";
import { TextField } from "./fields/TextField";
import { NumberField } from "./fields/NumberField";
import { CheckboxField } from "./fields/CheckboxField";
import { SelectField } from "./fields/SelectField";

export type FieldProps = {
  fieldName: string;
  fieldDef: InputFieldDefinition;
  disabled: boolean;
  defaultValue?: unknown;
  autoFocus?: boolean;
  onChange: (fieldName: string, value: unknown) => void;
};

export type FieldRegistryEntry = {
  autoFocusable: boolean;
  component: React.ComponentType<FieldProps>;
};

export const FIELD_REGISTRY: Record<
  InputFieldDefinition["type"],
  FieldRegistryEntry
> = {
  text: { autoFocusable: true, component: TextField },
  number: { autoFocusable: true, component: NumberField },
  checkbox: { autoFocusable: false, component: CheckboxField },
  select: { autoFocusable: false, component: SelectField },
};
