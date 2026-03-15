import { createWorkflow, loader } from "relay-sdk";

type Planet = {
  name: string;
  type: string;
  moons: number;
};

const PLANETS: Planet[] = [
  { name: "Mercury", type: "Terrestrial", moons: 0 },
  { name: "Venus", type: "Terrestrial", moons: 0 },
  { name: "Earth", type: "Terrestrial", moons: 1 },
  { name: "Mars", type: "Terrestrial", moons: 2 },
  { name: "Jupiter", type: "Gas giant", moons: 95 },
  { name: "Saturn", type: "Gas giant", moons: 146 },
  { name: "Uranus", type: "Ice giant", moons: 28 },
  { name: "Neptune", type: "Ice giant", moons: 16 },
];

/**
 * Tests output.table() with a loader — server-side pagination and search.
 */
export const outputTableLoader = createWorkflow({
  name: "Output Table Loader",
  loaders: {
    planets: loader(async ({ query, page, pageSize }) => {
      let filtered = PLANETS;
      if (query) {
        const lower = query.toLowerCase();
        filtered = PLANETS.filter(
          (p) =>
            p.name.toLowerCase().includes(lower) ||
            p.type.toLowerCase().includes(lower),
        );
      }
      const start = page * pageSize;
      return {
        data: filtered.slice(start, start + pageSize),
        totalCount: filtered.length,
      };
    }),
  },
  handler: async ({ output, loaders }) => {
    await output.table({
      title: "Planets",
      loader: loaders.planets,
      pageSize: 3,
    });
  },
});
