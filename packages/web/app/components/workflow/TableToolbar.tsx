import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { Loader } from "@cloudflare/kumo/components/loader";

interface TableToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  page: number;
  totalPages?: number;
  totalCount?: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  loading?: boolean;
}

/**
 * Compact search + pagination toolbar rendered above and below a table.
 * Visually attached to the table via shared border styling in the parent.
 */
export function TableToolbar({
  query,
  onQueryChange,
  page,
  totalPages,
  totalCount,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  loading,
}: TableToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 bg-[#111] border-[#222] text-xs">
      <Input
        type="text"
        size="sm"
        placeholder="Search..."
        aria-label="Search table"
        value={query}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onQueryChange(e.target.value)
        }
        className="w-48"
      />
      {loading && <Loader size="sm" />}

      <div className="ml-auto flex items-center gap-2 text-kumo-subtle">
        <span>
          Page {page + 1}
          {totalPages !== undefined ? ` of ${totalPages}` : ""}
          {totalCount !== undefined ? ` (${totalCount} total)` : ""}
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={!hasPrev}
          onClick={onPrev}
        >
          Prev
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!hasNext}
          onClick={onNext}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
