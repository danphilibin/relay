We are building a prototype called "Relay" that connects Cloudflare Workflows + Durable Objects with the goal of creating a single, persistent, readable stream per workflow run.

The idea is to have a workflow that can stream data in real-time to clients without waiting for the entire workflow to complete. This enables progress updates, AI-generated content, log messages, and other incremental data to be delivered as workflows execute.

This is very exploratory to see if it's possible. Only a prototype. No backwards compatibility. Minimum amount of code to get things working.
