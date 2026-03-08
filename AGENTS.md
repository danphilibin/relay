# AGENTS.md

Instructions for AI coding agents working with this codebase.

## Codebase overview

Read `ARCHITECTURE.md` when you need to understand how the codebase fits together — for example, when a task touches multiple layers, when you're unsure where something lives, or when starting a new feature. It describes the architecture, module layout, SDK primitives, and HTTP API — enough to orient without exploring from scratch.

If your work changes the architecture, adds/removes modules, or updates the SDK interface, update `ARCHITECTURE.md` to reflect the new state before finishing.

## Code gudielines

The author of this repo wants to prioritize understanding the AI-generated code. Be liberal with comments that explain why certain code exists and what it does, especially when its purpose is not obvious at the callsite, such as with cross-boundary concerns.

## Common commands

Generally you should only need to run these commands to verify your work.
Too much friction is signal that something is likely misconfigured.

- `pnpm format` - Format code using oxfmt
- `pnpm lint` - Lint code using oxlint
- `pnpm typecheck` - Typecheck code using tsc
- `pnpm test` - Run unit tests
- `pnpm test:e2e` - Run end-to-end tests

## Browser automation

Use `agent-browser` for web automation. Run `agent-browser --help` for all commands.

Core workflow:

1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes

<!-- opensrc:start -->

## Source Code Reference

Source code for dependencies is available in `opensrc/` for deeper understanding of implementation details.

See `opensrc/sources.json` for the list of available packages and their versions.

Use this source code when you need to understand how a package works internally, not just its types/interface.

### Fetching Additional Source Code

To fetch source code for a package or repository you need to understand, run:

```bash
npx opensrc <package>           # npm package (e.g., npx opensrc zod)
npx opensrc pypi:<package>      # Python package (e.g., npx opensrc pypi:requests)
npx opensrc crates:<package>    # Rust crate (e.g., npx opensrc crates:serde)
npx opensrc <owner>/<repo>      # GitHub repo (e.g., npx opensrc vercel/ai)
```

<!-- opensrc:end -->
