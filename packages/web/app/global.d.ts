export {};

declare global {
  interface Window {
    RELAY_WORKER_URL?: string;
  }
}
