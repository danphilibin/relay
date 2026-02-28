import { createWorkflow } from "relay-sdk";

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

function cleanHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export const fetchHackernews = createWorkflow({
  name: "Fetch Hacker News",
  handler: async ({ step, input, output }) => {
    await output.markdown("Fetching top Hacker News stories...");

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
      await output.markdown("Story not found!");
      return;
    }

    // Story header with markdown
    await output.markdown(
      `## ${selectedStory.title}\n\n**${selectedStory.by}** · ${selectedStory.score} points · ${selectedStory.descendants ?? 0} comments`,
    );

    // Story link
    if (selectedStory.url) {
      await output.link({
        url: selectedStory.url,
        title: "Read Article",
        description: new URL(selectedStory.url).hostname,
      });
    }

    // Story text (for Ask HN, Show HN, etc.)
    if (selectedStory.text) {
      await output.markdown(cleanHtml(selectedStory.text));
    }

    // Fetch and display top comments
    if (selectedStory.kids && selectedStory.kids.length > 0) {
      await output.markdown(
        `### Comments (${selectedStory.descendants ?? 0} total)`,
      );

      const commentIds = selectedStory.kids.slice(0, 5);
      const comments: Comment[] = [];

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
        if (comment?.text) {
          comments.push(comment);
        }
      }

      // Display comments as markdown blockquotes
      for (const comment of comments) {
        const cleanText = cleanHtml(comment.text);
        const truncated =
          cleanText.length > 300 ? cleanText.slice(0, 297) + "..." : cleanText;
        await output.markdown(`> **${comment.by}**\n>\n> ${truncated}`);
      }
    } else {
      await output.markdown("No comments yet on this story.");
    }

    // Action buttons
    await output.buttons([
      {
        label: "View on Hacker News",
        url: `https://news.ycombinator.com/item?id=${selectedStory.id}`,
        intent: "primary",
      },
      ...(selectedStory.url
        ? [
            {
              label: "Open Article",
              url: selectedStory.url,
              intent: "secondary" as const,
            },
          ]
        : []),
    ]);
  },
});
