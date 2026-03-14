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

export type Order = {
  id: number;
  userId: string;
  amount: number;
  status: "pending" | "shipped" | "delivered";
  createdAt: string;
};

const ORDER_STATUSES: Order["status"][] = ["pending", "shipped", "delivered"];
const ORDERS: Order[] = Array.from({ length: 50 }, (_, i) => ({
  id: i + 1,
  userId: USERS[i % USERS.length].id,
  amount: Math.round((50 + ((i * 31) % 450)) * 100) / 100,
  status: ORDER_STATUSES[i % ORDER_STATUSES.length],
  createdAt: new Date(Date.now() - i * 86400000).toISOString(),
}));

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

  orders: {
    async findById(id: number): Promise<Order> {
      const order = ORDERS.find((o) => o.id === id);
      if (!order) {
        throw new Error(`Order not found: ${id}`);
      }
      return order;
    },

    async findByIds(ids: number[]): Promise<Order[]> {
      return Promise.all(ids.map((id) => this.findById(id)));
    },

    async findMany(
      params: QueryParams & { userId?: string },
    ): Promise<PaginatedResult<Order>> {
      const { query, page, pageSize, userId } = params;

      let filtered = ORDERS;

      if (userId) {
        filtered = filtered.filter((o) => o.userId === userId);
      }

      if (query) {
        const q = query.toLowerCase();
        filtered = ORDERS.filter(
          (o) =>
            o.id.toString().includes(q) ||
            o.status.toLowerCase().includes(q) ||
            o.userId.toLowerCase().includes(q),
        );
      }

      const data = filtered.slice(page * pageSize, (page + 1) * pageSize);

      return { data, totalCount: filtered.length };
    },

    async findByUserId(
      userId: string,
      params: QueryParams,
    ): Promise<PaginatedResult<Order>> {
      const { query, page, pageSize } = params;
      let filtered = ORDERS.filter((o) => o.userId === userId);

      if (query) {
        const q = query.toLowerCase();
        filtered = filtered.filter(
          (o) =>
            o.status.toLowerCase().includes(q) || o.id.toString().includes(q),
        );
      }

      const data = filtered.slice(page * pageSize, (page + 1) * pageSize);
      return { data, totalCount: filtered.length };
    },
  },
};
