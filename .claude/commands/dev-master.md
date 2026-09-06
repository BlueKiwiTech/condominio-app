---
description: Run the dev-master agent to continue autonomous development of condominio-app from PLAN.md
---

Spawn the `dev-master` agent to continue building condominio-app, following its full instructions in `.claude/agents/dev-master.md` (read that file if you need the details — this command doesn't duplicate them).

**How to spawn it:**
1. First try `Agent(subagent_type: "dev-master", description: "Run dev-master to continue building", prompt: "Follow your instructions exactly as defined in your system prompt (.claude/agents/dev-master.md). Read PLAN.md, CLAUDE.md, and AGENTS.md fresh, determine the next unit of work, implement it, verify, update PLAN.md, and commit.")`.
2. If that errors because `dev-master` isn't a recognized `subagent_type` (the custom agent registry only refreshes on session restart, so a freshly-created or edited agent file may not be picked up mid-session) — fall back immediately: read `.claude/agents/dev-master.md` in full, then spawn `Agent(subagent_type: "general-purpose", ...)` with that file's entire content inlined verbatim as the prompt, followed by "Begin now: read PLAN.md, CLAUDE.md, AGENTS.md, determine the next unit of work, implement it, verify, update PLAN.md, and commit." Do not summarize or shorten the inlined instructions — paste them in full so the fallback agent has the same constraints (never `git push`, never touch live Supabase/Vercel, etc.) as the real subagent would.

**Execution:**
- Run the spawn in the background (`run_in_background: true`) unless the user explicitly asks to wait synchronously for this run's result.
- After spawning, briefly tell the user a dev-master run has started (don't wait to report — the completion notification arrives later on its own).
- Do not spawn a second run while one is already in flight — check for an existing background dev-master task first if unsure.

This command takes no arguments; it always means "do the next unit of work per PLAN.md."
