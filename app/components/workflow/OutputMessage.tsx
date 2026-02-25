import { type OutputBlock } from "@/isomorphic";
import { Button, LinkButton } from "@cloudflare/kumo/components/button";
import { CodeBlock } from "@cloudflare/kumo/components/code";
import { Table } from "@cloudflare/kumo/components/table";
import { Streamdown } from "streamdown";

interface OutputMessageProps {
  block: OutputBlock;
}

const intentToVariant: Record<string, "primary" | "secondary" | "destructive"> =
  {
    primary: "primary",
    secondary: "secondary",
    danger: "destructive",
  };

export function OutputMessage({ block }: OutputMessageProps) {
  switch (block.type) {
    case "output.markdown":
      return <Streamdown mode="static">{block.content}</Streamdown>;

    case "output.table": {
      const rows = block.data;
      const columns =
        rows.length > 0
          ? Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
          : [];

      return (
        <div className="space-y-2">
          {block.title && (
            <div className="text-sm font-medium text-[#ddd]">{block.title}</div>
          )}
          {rows.length === 0 ? (
            <div className="text-base leading-relaxed text-[#888]">
              (no rows)
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="text-sm border border-[#222] rounded-md">
                <Table.Header>
                  <Table.Row>
                    {columns.map((column) => (
                      <Table.Head key={column}>{column}</Table.Head>
                    ))}
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {rows.map((row, rowIndex) => (
                    <Table.Row key={rowIndex}>
                      {columns.map((column) => (
                        <Table.Cell key={column}>
                          {row[column] ?? ""}
                        </Table.Cell>
                      ))}
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          )}
        </div>
      );
    }

    case "output.code":
      return <CodeBlock code={block.code} lang={mapCodeLang(block.language)} />;

    case "output.image":
      return (
        <img
          src={block.src}
          alt={block.alt ?? ""}
          className="max-w-[600px] h-auto"
        />
      );

    case "output.link":
      return (
        <div className="space-y-1">
          {block.title && (
            <div className="text-sm font-medium text-[#ddd]">{block.title}</div>
          )}
          {block.description && (
            <div className="text-base leading-relaxed text-[#888]">
              {block.description}
            </div>
          )}
          <a
            href={block.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[#9ec1ff] underline break-all"
          >
            {block.url}
          </a>
        </div>
      );

    case "output.buttons":
      return (
        <div className="flex flex-wrap gap-2">
          {block.buttons.map((button, index) =>
            button.url ? (
              <LinkButton
                key={`${button.label}-${index}`}
                href={button.url}
                variant={intentToVariant[button.intent ?? "secondary"]}
                external
              >
                {button.label}
              </LinkButton>
            ) : (
              <Button
                key={`${button.label}-${index}`}
                type="button"
                variant={intentToVariant[button.intent ?? "secondary"]}
                disabled
              >
                {button.label}
              </Button>
            ),
          )}
        </div>
      );
  }
}

function mapCodeLang(
  language?: string,
): "ts" | "tsx" | "jsonc" | "bash" | "css" {
  if (language === "tsx") return "tsx";
  if (language === "jsonc") return "jsonc";
  if (language === "bash") return "bash";
  if (language === "css") return "css";
  return "ts";
}
