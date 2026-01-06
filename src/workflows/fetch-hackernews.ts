import { createWorkflow } from "@/sdk/workflow";

type Story = {
  id: number;
  title: string;
  by: string;
  score: number;
  url?: string;
  text?: string;
  descendants?: number;
  kids?: number[];
};

type Comment = {
  id: number;
  by: string;
  text: string;
  time: number;
};

export const fetchHackernews = createWorkflow({
  name: "Fetch Hacker News",
  handler: async ({ step, input, output }) => {
    await output("Fetching top Hacker News stories...");

    // Fetch top story IDs
    const topStoryIds = await step.do("fetch top stories", async () => {
      const res = await fetch(
        "https://hacker-news.firebaseio.com/v0/topstories.json",
      );
      const ids = await res.json<number[]>();
      return ids.slice(0, 10);
    });

    // Fetch story details for all top stories
    const stories: Story[] = [];
    for (const id of topStoryIds) {
      const story = await step.do(`fetch story ${id}`, async () => {
        const res = await fetch(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
        );
        return res.json<Story>();
      });
      stories.push(story);
    }

    // Let user pick a story
    const { story: selectedStoryId } = await input("Pick a story to explore:", {
      story: {
        type: "select",
        label: "Story",
        options: stories.map((s) => ({
          value: String(s.id),
          label: `${s.title} (${s.score} pts)`,
        })),
      },
    });

    const selectedStory = stories.find((s) => String(s.id) === selectedStoryId);
    if (!selectedStory) {
      await output("Story not found!");
      return;
    }

    await output(`📰 ${selectedStory.title}`);
    await output(`By ${selectedStory.by} · ${selectedStory.score} points`);

    if (selectedStory.url) {
      await output(`🔗 ${selectedStory.url}`);
    }

    if (selectedStory.text) {
      await output(`📝 ${selectedStory.text}`);
    }

    // Fetch and display top comments
    if (selectedStory.kids && selectedStory.kids.length > 0) {
      await output(
        `💬 Top comments (${selectedStory.descendants ?? 0} total):`,
      );

      const commentIds = selectedStory.kids.slice(0, 3);
      for (const commentId of commentIds) {
        const comment = await step.do(
          `fetch comment ${commentId}`,
          async () => {
            const res = await fetch(
              `https://hacker-news.firebaseio.com/v0/item/${commentId}.json`,
            );
            return res.json<Comment>();
          },
        );

        if (comment && comment.text) {
          // Strip HTML tags for cleaner display
          const cleanText = comment.text
            .replace(/<[^>]*>/g, "")
            .replace(/&quot;/g, '"')
            .replace(/&#x27;/g, "'")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">");
          await output(
            `— ${comment.by}: ${cleanText.slice(0, 200)}${cleanText.length > 200 ? "..." : ""}`,
          );
        }
      }
    } else {
      await output("No comments yet on this story.");
    }

    await output("✨ Done!");
  },
});
