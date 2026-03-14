import { useCallback } from "react";
import type { TableFieldDefinition, RowKeyValue } from "relay-sdk/client";
import type { FieldProps } from "../SchemaFieldComponents";
import { ServerTable } from "../ServerTable";
import { StaticTable } from "../StaticTable";

export function TableField({
  fieldName,
  fieldDef,
  disabled,
  defaultValue,
  onChange,
}: FieldProps) {
  const def = fieldDef as TableFieldDefinition;

  const handleSelectionChange = useCallback(
    (keys: RowKeyValue[]) => onChange(fieldName, keys),
    [fieldName, onChange],
  );

  if (disabled) {
    const keys = (defaultValue as RowKeyValue[] | undefined) ?? [];
    return (
      <div className="space-y-2">
        <div className="text-base text-[#fafafa]">{def.label}</div>
        {def.description && (
          <div className="text-sm text-kumo-subtle">{def.description}</div>
        )}
        <div className="text-sm text-kumo-subtle">
          Selected {keys.length} row{keys.length !== 1 ? "s" : ""}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="text-base text-[#fafafa]">{def.label}</div>
        {def.description && (
          <div className="text-sm text-kumo-subtle">{def.description}</div>
        )}
      </div>

      {def.loader ? (
        <ServerTable
          loader={def.loader}
          selection={def.selection}
          defaultSelectedKeys={(defaultValue as string[] | undefined) ?? []}
          onSelectionChange={handleSelectionChange}
        />
      ) : def.data ? (
        <StaticTable
          data={def.data}
          pageSize={def.pageSize}
          selection={def.selection}
          defaultSelectedKeys={(defaultValue as string[] | undefined) ?? []}
          onSelectionChange={handleSelectionChange}
        />
      ) : null}
    </div>
  );
}
