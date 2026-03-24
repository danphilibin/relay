import { createWorkflow, loader } from "relay-sdk";

type Tool = {
  id: string;
  name: string;
  category: string;
};

const TOOLS: Tool[] = [
  { id: "t1", name: "Hammer", category: "Hand tools" },
  { id: "t2", name: "Screwdriver", category: "Hand tools" },
  { id: "t3", name: "Drill", category: "Power tools" },
  { id: "t4", name: "Saw", category: "Power tools" },
];

/**
 * Tests input.table() — loader-backed single selection, static single
 * selection, and loader-backed multiple selection.
 */
export const inputTable = createWorkflow({
  name: "Input Table",
  loaders: {
    tools: loader({
      rowKey: "id",
      load: async ({ query, page, pageSize }) => {
        let filtered = TOOLS;
        if (query) {
          const lower = query.toLowerCase();
          filtered = TOOLS.filter(
            (t) =>
              t.name.toLowerCase().includes(lower) ||
              t.category.toLowerCase().includes(lower),
          );
        }
        const start = page * pageSize;
        return {
          data: filtered.slice(start, start + pageSize),
          totalCount: filtered.length,
        };
      },
      resolve: async ({ keys }) => {
        return TOOLS.filter((t) => keys.includes(t.id));
      },
    }),
  },
  handler: async ({ input, output, loaders }) => {
    // 1. Loader-backed single selection
    const tool = await input.table({
      title: "Pick a tool",
      loader: loaders.tools,
      pageSize: 10,
    });

    await output.metadata({
      title: "Loader single",
      data: { name: tool.name, category: tool.category },
    });

    // 2. Static data single selection
    const staticTool = await input.table({
      title: "Pick a tool (static)",
      data: TOOLS,
      rowKey: "id",
    });

    await output.metadata({
      title: "Static single",
      data: { name: staticTool.name, category: staticTool.category },
    });

    // 3. Loader-backed multiple selection
    const selected = await input.table({
      title: "Pick multiple tools",
      loader: loaders.tools,
      pageSize: 10,
      selection: "multiple",
    });

    await output.metadata({
      title: "Loader multiple",
      data: {
        count: selected.length,
        names: selected.map((t) => t.name).join(", "),
      },
    });
  },
});
