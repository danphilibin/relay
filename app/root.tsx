import {
  isRouteErrorResponse,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { useEffect, useState } from "react";
import type { WorkflowMeta } from "@/isomorphic";
import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

function Sidebar() {
  const [workflows, setWorkflows] = useState<WorkflowMeta[]>([]);

  useEffect(() => {
    fetch("/workflows")
      .then((res) => res.json() as Promise<{ workflows: WorkflowMeta[] }>)
      .then((data) => setWorkflows(data.workflows))
      .catch((err) => console.error("Failed to load workflows:", err));
  }, []);

  return (
    <div className="w-[240px] bg-[#0a0a0a] border-r border-[#222] flex flex-col">
      <div className="p-5 h-16 border-b border-[#222] flex items-center justify-between">
        <NavLink
          to="/"
          className="text-base font-semibold tracking-tight flex items-center gap-2"
        >
          Workflows
        </NavLink>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {workflows.map((workflow) => (
          <NavLink
            key={workflow.slug}
            to={`/${workflow.slug}`}
            className={({ isActive }) =>
              `block w-full text-left px-3.5 py-3 rounded-md mb-1 transition-colors ${
                isActive
                  ? "bg-[#1a1a1a] text-white"
                  : "text-[#888] hover:bg-[#1a1a1a] hover:text-white"
              }`
            }
          >
            <div className="font-medium text-sm">{workflow.title}</div>
          </NavLink>
        ))}
      </div>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-mode="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <div className="flex h-screen bg-kumo-base text-kumo-default font-sans">
          <Sidebar />
          {children}
        </div>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="flex-1 flex items-center justify-center text-[#666]">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">{message}</h1>
        <p>{details}</p>
        {stack && (
          <pre className="mt-4 p-4 bg-[#111] rounded-lg text-left text-sm overflow-x-auto max-w-xl">
            <code>{stack}</code>
          </pre>
        )}
      </div>
    </main>
  );
}
