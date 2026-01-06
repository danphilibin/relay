interface LogMessageProps {
  text: string;
}

export function LogMessage({ text }: LogMessageProps) {
  return <div className="text-base leading-relaxed text-[#888]">{text}</div>;
}
