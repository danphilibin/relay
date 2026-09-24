/// <reference types="vite/client" />
import type { ReactNode } from "react";
import {
  createRootRoute,
  Link,
  Outlet,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import {
  AuthKitProvider,
  useAuth,
} from "@workos/authkit-tanstack-react-start/client";
import { SignOut } from "@phosphor-icons/react";
import { getAuthConfig, requireAuth } from "../lib/auth";
import { WorkflowsProvider, useWorkflows } from "../lib/workflows-context";
import "../app.css";

export const Route = createRootRoute({
  loader: async () => {
    const authConfig = await getAuthConfig();
    if (authConfig.authEnabled) {
      await requireAuth();
    }
    return authConfig;
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
    links: [
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
    ],
  }),
  component: RootComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { authEnabled } = Route.useLoaderData();

  return (
    <RootDocument>
      <AuthShell authEnabled={authEnabled}>
        <WorkflowsProvider>
          <div className="flex h-screen bg-kumo-base text-kumo-default font-sans">
            <Sidebar authEnabled={authEnabled} />
            <Outlet />
          </div>
        </WorkflowsProvider>
      </AuthShell>
    </RootDocument>
  );
}

/**
 * Wraps children in AuthKitProvider only when auth is enabled.
 * This avoids the provider making server calls for auth context
 * when no WorkOS middleware is running.
 */
function AuthShell({
  authEnabled,
  children,
}: {
  authEnabled: boolean;
  children: ReactNode;
}) {
  if (!authEnabled) return <>{children}</>;

  return <AuthKitProvider>{children}</AuthKitProvider>;
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" data-mode="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function Sidebar({ authEnabled }: { authEnabled: boolean }) {
  const { workflows, loading, error } = useWorkflows();

  const baseClasses = "block w-full text-left px-3.5 py-3 rounded-md mb-1";

  return (
    <div className="w-60 bg-[#0a0a0a] border-r border-[#222] flex flex-col">
      <div className="p-5 flex items-center justify-between">
        <Link
          to="/"
          className="text-lg tracking-[-0.01em] font-semibold flex items-center gap-2"
        >
          Relay
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto pb-3 px-2">
        {loading || error ? null : workflows.length === 0 ? (
          <div className="px-3 py-2 text-sm text-[#555]">No workflows</div>
        ) : (
          workflows.map((workflow) => (
            <Link
              key={workflow.slug}
              to="/$workflowName"
              params={{ workflowName: workflow.slug }}
              activeProps={{
                className: `${baseClasses} bg-[#1a1a1a] text-white`,
              }}
              inactiveProps={{
                className: `${baseClasses} text-[#888] hover:bg-white/5 hover:text-white`,
              }}
            >
              <div className="font-medium text-sm">{workflow.title}</div>
            </Link>
          ))
        )}
      </div>
      {authEnabled && <UserFooter />}
    </div>
  );
}

function UserFooter() {
  const { user, loading, signOut } = useAuth();

  if (loading || !user) return null;

  const displayName =
    user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.email;

  return (
    <div className="border-t border-[#222] p-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <div className="text-sm text-white truncate">{displayName}</div>
          {displayName !== user.email && (
            <div className="text-xs text-[#666] truncate">{user.email}</div>
          )}
        </div>
        <button
          onClick={() => signOut()}
          className="shrink-0 p-1.5 rounded-md text-[#666] hover:text-white hover:bg-[#1a1a1a]"
          title="Sign out"
        >
          <SignOut size={16} />
        </button>
      </div>
    </div>
  );
}

function ErrorComponent({ error }: { error: unknown }) {
  const isDev = import.meta.env.DEV;
  const errorMessage =
    error instanceof Error ? error.message : "An unexpected error occurred.";
  const errorStack = error instanceof Error ? error.stack : undefined;

  return (
    <main className="flex-1 flex items-center justify-center text-[#666]">
      <div className="text-center">
        <h1 className="text-lg font-semibold mb-2">Error</h1>
        <p>{errorMessage}</p>
        {isDev && errorStack && (
          <pre className="mt-4 p-4 bg-[#111] rounded-lg text-left text-sm overflow-x-auto max-w-xl">
            <code>{errorStack}</code>
          </pre>
        )}
      </div>
    </main>
  );
}
