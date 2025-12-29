import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Workflows" },
    { name: "description", content: "Select a workflow to run" },
  ];
}

export default function Home() {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<string[]>([]);
  const [creatingWorkflow, setCreatingWorkflow] = useState<string | null>(null);

  useEffect(() => {
    loadWorkflows();
  }, []);

  async function loadWorkflows() {
    try {
      const response = await fetch("/workflows");
      const data = (await response.json()) as { workflows: string[] };
      setWorkflows(data.workflows);
    } catch (error) {
      console.error("Error loading workflows:", error);
    }
  }

  async function startWorkflow(workflowName: string) {
    setCreatingWorkflow(workflowName);

    try {
      const response = await fetch("/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: workflowName, params: {} }),
      });
      const data = (await response.json()) as { id: string };
      navigate(`/${workflowName}/${data.id}`);
    } catch (error) {
      console.error("Error creating workflow:", error);
      setCreatingWorkflow(null);
    }
  }

  function formatWorkflowName(name: string): string {
    return name
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  return (
    <div className="max-w-5xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Workflows</h1>

      {workflows.length === 0 ? (
        <div className="text-gray-500">Loading workflows...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflows.map((workflow) => (
            <button
              key={workflow}
              onClick={() => startWorkflow(workflow)}
              disabled={creatingWorkflow === workflow}
              className="p-6 bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <h2 className="text-xl font-semibold mb-2">
                {formatWorkflowName(workflow)}
              </h2>
              <p className="text-gray-500 text-sm">
                {creatingWorkflow === workflow
                  ? "Starting..."
                  : "Click to start"}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
