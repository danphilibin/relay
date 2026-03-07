import { createWorkflow, loader, presenter } from "relay-sdk";
import { db, type User, DEPARTMENTS } from "../lib/mock-db";

const userPresenter = presenter<User>("user-table", {
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
    users: loader(async ({ query, page, pageSize }) => {
      return db.users.findMany({ query, page, pageSize });
    }),

    deptUsers: loader(
      { department: "string" },
      async ({ department, query, page, pageSize }) => {
        return db.users.findByDepartment(department, { query, page, pageSize });
      },
    ),
  },

  handler: async ({ input, output, loaders }) => {
    // All users — auto-derive columns
    // await output.table({
    //   title: "All Users",
    //   source: loaders.users,
    //   presenter: userPresenter,
    //   pageSize: 10,
    // });

    const { department } = await input("Select a department", {
      department: {
        type: "select",
        label: "Department",
        options: ["All", ...DEPARTMENTS].map((department) => ({
          value: department,
          label: department,
        })),
      },
    });

    // Department-scoped view
    await output.table({
      title: department,
      source:
        department === "All"
          ? loaders.users
          : loaders.deptUsers({ department }),
      pageSize: 5,
      // columns: ["name", "email", "department", "role"],
      presenter: userPresenter,
    });
  },
});
