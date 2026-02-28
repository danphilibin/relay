# AGENTS.md

Instructions for AI coding agents working with this codebase.

## Codebase overview

Read `docs/current-state.md` when you need to understand how the codebase fits together — for example, when a task touches multiple layers, when you're unsure where something lives, or when starting a new feature. It describes the architecture, module layout, SDK primitives, and HTTP API — enough to orient without exploring from scratch.

If your work changes the architecture, adds/removes modules, or updates the SDK interface, update `docs/current-state.md` to reflect the new state before finishing.

## Progress log

After completing any piece of work (feature, refactor, bug fix), update `progress.md` with a new entry summarizing what was done. Use the commit range as the heading (e.g. `## Feature name (abc1234 - def5678)`). This is an append-only log — never edit existing entries.

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
