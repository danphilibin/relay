import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route(":workflowName/:runId?", "routes/workflow.tsx"),
] satisfies RouteConfig;
