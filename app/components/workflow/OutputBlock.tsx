import { type OutputBlock as OutputBlockType, outputBlockToText } from "@/isomorphic";

interface OutputBlockProps {
  block: OutputBlockType;
}

export function OutputBlock({ block }: OutputBlockProps) {
  switch (block.type) {
    case "text":
    case "markdown":
    case "table":
    case "code":
    case "image":
    case "link":
    case "buttons":
      return (
        <div className="text-base leading-relaxed text-[#888]">
          {outputBlockToText(block)}
        </div>
      );
  }
}

