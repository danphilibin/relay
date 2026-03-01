const runtimeApiUrl =
  typeof window !== "undefined" ? window.RELAY_WORKER_URL : undefined;

const configuredApiUrl =
  runtimeApiUrl?.trim() || import.meta.env.VITE_RELAY_WORKER_URL?.trim() || "";

const normalizedApiBase = configuredApiUrl.replace(/\/+$/, "");

export function apiPath(path: string): string {
  const normalizedPath = path.replace(/^\/+/, "");
  return normalizedApiBase
    ? `${normalizedApiBase}/${normalizedPath}`
    : `/${normalizedPath}`;
}
