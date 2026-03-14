import { createWorkflow, loader, tableRenderer } from "relay-sdk";
import { db, type User } from "../lib/mock-db";

const userTableRenderer = tableRenderer<User>("user-table", {
  columns: [
    { label: "ID", accessorKey: "id" },
    {
      label: "Display",
      renderCell: (user) => `${user.name} <${user.email}>`,
    },
    { label: "Department", accessorKey: "department" },
    { label: "Role", accessorKey: "role" },
  ],
});

export const browseUsers = createWorkflow({
  name: "Users",
  loaders: {
    users: loader({
      rowKey: "id",
      load: async ({ query, page, pageSize }) => {
        return db.users.findMany({ query, page, pageSize });
      },
      resolve: async ({ keys }) => {
        return db.users.findByIds(keys);
      },
    }),
  },

  handler: async ({ input, output, loaders }) => {
    const user = await input.table({
      title: "Pick a user to view",
      source: loaders.users,
      renderer: userTableRenderer,
      pageSize: 5,
    });

    await output.markdown(`You selected **${user.name}** (${user.email})`);

    // const { department } = await input.group("Select a department", {
    //   department: input.select("Department", {
    //     options: ["All", ...DEPARTMENTS].map((department) => ({
    //       value: department,
    //       label: department,
    //     })),
    //   }),
    // });

    // // Department-scoped view
    // await output.table({
    //   title: department,
    //   source:
    //     department === "All"
    //       ? loaders.users
    //       : loaders.deptUsers({ department }),
    //   pageSize: 5,
    //   // columns: ["name", "email", "department", "role"],
    //   renderer: userTableRenderer,
    // });
  },
});
