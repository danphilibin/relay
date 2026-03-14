import { createWorkflow, loader } from "relay-sdk";
import { db, type User, type Order } from "../lib/mock-db";

export const tables = createWorkflow({
  name: "Tables",
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
    orders: loader({
      rowKey: "id",
      params: { userId: "string" },
      load: async ({ query, page, pageSize, userId }) => {
        return db.orders.findMany({ query, page, pageSize, userId });
      },
      resolve: async ({ keys }) => {
        return db.orders.findByIds(keys);
      },
    }),
  },

  handler: async ({ input, output, loaders }) => {
    // 1. output.table with data — static, all data over the wire
    await output.table({
      title: "Users (data)",
      data: (await db.users.findMany()).data,
    });

    // 2. output.table with loader — paginated server-side
    await output.table({
      title: "Users (loader)",
      source: loaders.users,
      pageSize: 10,
    });

    // 3. input.table with loader, single selection
    const user = await input.table({
      title: "Pick a user",
      source: loaders.users,
      pageSize: 10,
    });
    const _userIsUser: User = user;

    // 4. input.table with data — HOLE: API only supports loader source
    const userFromData = await input.table({
      title: "Pick user (from static data)",
      data: (await db.users.findMany()).data,
      rowKey: "id",
    });
    const _userFromDataIsUser: User = userFromData;

    // 5. input.table with loader, multiple selection
    const orders = await input.table({
      title: "Pick orders for this user",
      source: loaders.orders({ userId: user.id }),
      pageSize: 5,
      selection: "multiple",
    });
    const _ordersIsOrderArray: Order[] = orders;

    await output.markdown(
      `You selected **${user.name}** and ${orders.length} order(s)`,
    );

    await output.metadata({
      title: "Selection summary",
      data: {
        userId: user.id,
        orderIds: orders.map((o) => o.id).join(", "),
        orderCount: orders.length,
      },
    });
  },
});
