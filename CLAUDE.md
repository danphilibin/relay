Building a prototype of a workflow engine that connects Cloudflare Durable Objects + Cloudflare Workflows.

Gives each workflow run a persistant readable stream that can be connected to and streamed to from the client.

Workflow wraps `await step.do` etc; sends UI instructions over the wire; React app renders UIs.

Building a prototype - do things the right way; no shims or backwards compatibility.

Keep code concise and well documented.

Tech stack:

- pnpm
- Cloudflare Durable Objects
- Cloudflare Workflows
- React
- Tailwind CSS
- TypeScript
- Vite
