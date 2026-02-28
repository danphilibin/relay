import type { Route } from "./+types/home";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Workflows" },
    { name: "description", content: "Select a workflow to run" },
  ];
}

export default function Home() {
  return (
    <div className="flex-1 flex items-center justify-center text-[#666]">
      <p className="text-base">Select a workflow to get started</p>
    </div>
  );
}
