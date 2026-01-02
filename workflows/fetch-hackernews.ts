import type { RelayContext } from "../src/sdk/workflow";

export const fetchHackernews = async ({ step, output }: RelayContext) => {
  await output("Fetching top Hacker News posts...");
  await output("Requesting story IDs from HN API...");

  const topStoryIds = await step.do("fetch top stories", async () => {
    const res = await fetch(
      "https://hacker-news.firebaseio.com/v0/topstories.json",
    );
    const ids = await res.json<number[]>();
    return ids.slice(0, 5);
  });

  await output(`Got ${topStoryIds.length} story IDs`);
  await output("Fetching story details...");

  for (let i = 0; i < topStoryIds.length; i++) {
    const id = topStoryIds[i];
    const story = await step.do(`fetch story ${id}`, async () => {
      const res = await fetch(
        `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
      );
      return res.json<{
        title: string;
        by: string;
        score: number;
      }>();
    });
    await output(
      `${i + 1}. ${story.title} (${story.score} points by ${story.by})`,
    );
  }

  await output("Hacker News fetch complete!");
};
