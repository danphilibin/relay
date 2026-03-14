// Mock database client for demonstration purposes

export type User = {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
};

export const DEPARTMENTS = [
  "Engineering",
  "Sales",
  "Marketing",
  "Support",
  "Design",
];
const ROLES = ["Manager", "Senior", "Junior", "Lead", "Intern"];
const FIRST_NAMES = [
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
const LAST_NAMES = [
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

const USERS: User[] = Array.from({ length: 87 }, (_, i) => {
  const first = FIRST_NAMES[i % FIRST_NAMES.length];
  const last = LAST_NAMES[i % LAST_NAMES.length];
  return {
    id: `user_${String(i + 1).padStart(3, "0")}`,
    name: `${first} ${last}`,
    email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
    department: DEPARTMENTS[i % DEPARTMENTS.length],
    role: ROLES[i % ROLES.length],
  };
});

type QueryParams = {
  query?: string;
  page: number;
  pageSize: number;
};

type PaginatedResult<T> = {
  data: T[];
  totalCount: number;
};

export const db = {
  users: {
    async findById(id: string): Promise<User> {
      const user = USERS.find((u) => u.id === id);
      if (!user) {
        throw new Error(`User not found: ${id}`);
      }
      return user;
    },

    async findByIds(ids: string[]): Promise<User[]> {
      return Promise.all(ids.map((id) => this.findById(id)));
    },

    async findMany(params: QueryParams): Promise<PaginatedResult<User>> {
      const { query, page, pageSize } = params;
      let filtered = USERS;

      if (query) {
        const q = query.toLowerCase();
        filtered = USERS.filter(
          (u) =>
            u.name.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            u.department.toLowerCase().includes(q),
        );
      }

      const data = filtered.slice(page * pageSize, (page + 1) * pageSize);
      return { data, totalCount: filtered.length };
    },

    async findByDepartment(
      department: string,
      params: QueryParams,
    ): Promise<PaginatedResult<User>> {
      const { query, page, pageSize } = params;
      let filtered = USERS.filter(
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
  },
};
