import { createWorkflow, loader } from "relay-sdk";
import { db } from "../lib/mock-db";
import { userTableRenderer } from "./browse-users";

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
    const user = await input.table({
      title: "Pick a user to view",
      source: loaders.users,
      renderer: userTableRenderer,
      pageSize: 5,
    });

    await output.markdown(`You selected **${user.name}** (${user.email})`);

    const order = await input.table({
      title: "Pick an order to view",
      source: loaders.orders({ userId: user.id }),
      pageSize: 5,
    });

    await output.metadata({
      title: "Order details",
      data: {
        userId: user.id,
        orderId: order.id,
        amount: order.amount,
        status: order.status,
      },
    });
  },
});
