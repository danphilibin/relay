interface OutputMessageProps {
  text: string;
}

export function OutputMessage({ text }: OutputMessageProps) {
  return <div className="text-base leading-relaxed text-[#888]">{text}</div>;
}
