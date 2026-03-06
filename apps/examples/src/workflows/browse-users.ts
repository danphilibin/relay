import { createWorkflow, loader } from "relay-sdk";

// Fake user data for demonstration
type User = {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
};

const FAKE_USERS: User[] = Array.from({ length: 87 }, (_, i) => {
  const departments = [
    "Engineering",
    "Sales",
    "Marketing",
    "Support",
    "Design",
  ];
  const roles = ["Manager", "Senior", "Junior", "Lead", "Intern"];
  const firstNames = [
    "Alice",
    "Bob",
    "Charlie",
    "Diana",
    "Eve",
    "Frank",
    "Grace",
    "Hank",
    "Ivy",
    "Jack",
    "Karen",
    "Leo",
    "Mona",
    "Nick",
    "Olivia",
  ];
  const lastNames = [
    "Smith",
    "Johnson",
    "Williams",
    "Brown",
    "Jones",
    "Garcia",
    "Miller",
    "Davis",
    "Rodriguez",
    "Martinez",
  ];

  const first = firstNames[i % firstNames.length];
  const last = lastNames[i % lastNames.length];

  return {
    id: `user_${String(i + 1).padStart(3, "0")}`,
    name: `${first} ${last}`,
    email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
    department: departments[i % departments.length],
    role: roles[i % roles.length],
  };
});

export const browseUsers = createWorkflow({
  name: "Browse Users",
  description: "Browse and search users with server-side pagination",
  loaders: {
    users: loader(async ({ query, page, pageSize }) => {
      // Simulate a database query with filtering
      let filtered = FAKE_USERS;
      if (query) {
        const q = query.toLowerCase();
        filtered = FAKE_USERS.filter(
          (u) =>
            u.name.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            u.department.toLowerCase().includes(q),
        );
      }

      const data = filtered.slice(page * pageSize, (page + 1) * pageSize);
      return { data, totalCount: filtered.length };
    }),

    deptUsers: loader(
      { department: "string" },
      async ({ department, query, page, pageSize }) => {
        let filtered = FAKE_USERS.filter(
          (u) => u.department.toLowerCase() === department.toLowerCase(),
        );
        if (query) {
          const q = query.toLowerCase();
          filtered = filtered.filter(
            (u) =>
              u.name.toLowerCase().includes(q) ||
              u.email.toLowerCase().includes(q),
          );
        }

        const data = filtered.slice(page * pageSize, (page + 1) * pageSize);
        return { data, totalCount: filtered.length };
      },
    ),
  },

  handler: async ({ output, loaders }) => {
    await output.markdown(
      "## User Directory\n\nBrowse all users with server-side pagination and search.",
    );

    // All users — auto-derive columns
    await output.table({
      title: "All Users",
      source: loaders.users,
      pageSize: 10,
      columns: [
        { label: "ID", accessorKey: "id" },
        { label: "Name", accessorKey: "name" },
        { label: "Email", accessorKey: "email" },
        { label: "Department", accessorKey: "department" },
        { label: "Role", accessorKey: "role" },
      ],
    });

    // Department-scoped view
    await output.table({
      title: "Engineering Team",
      source: loaders.deptUsers({ department: "Engineering" }),
      pageSize: 5,
      columns: ["name", "email", "role"],
    });
  },
});
