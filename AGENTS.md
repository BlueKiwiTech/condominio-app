# Agent Notes

Operational notes for AI agents working in this repo, learned the hard way during Phase 1. See `CLAUDE.md` for full project/stack context.

## Database naming convention

**Every table (and any future trigger/function) must use the `condo_` prefix.**

Correct: `condo_communities`, `condo_houses`, `condo_house_residents`, `condo_installment_templates`, `condo_installments`, `condo_payments`, `condo_audit_logs`.

Also: the Spanish domain word `cuota` was renamed to `installment` in all SQL identifiers (table/column names only — `condo_installment_templates`, `condo_installments`, `installment_type`, `installment_id`, `parent_installment_id`). This is scoped to SQL identifiers only: ROADMAP.md's "Cuota Engine" phase name, the `CUOT-01..07` requirement IDs, and CLAUDE.md's product description intentionally keep the Spanish "cuota" term for business/requirement vocabulary — don't rename those.

Any new migration must follow this convention from the start. Do not write bare `create table houses (...)` — it must be `create table condo_houses (...)`.

## Live Supabase project access

The Supabase CLI in this local environment is authenticated against a different org (`AGA Social LLC`) than the project actually in use for this app (`yfbojfbtlvajxndssbtw`, a separate account). `supabase link`/`supabase db push`/`supabase db query` against the real project will fail with a management-API privilege error — there is no CLI-level access to it from this environment.

**Migrations are pushed by the user directly** (via the Supabase Dashboard SQL Editor, or their own authenticated CLI session), not by an agent. When a migration is written:
1. Write the `.sql` file under `supabase/migrations/` as normal (fix-forward with a new migration if the prior one was already applied live — never edit an already-applied migration file).
2. Tell the user the migration exists and needs to be pushed; do not attempt to push it yourself.
3. If verification (e.g. RLS/policy checks) is needed against the live project, ask the user to run the query via the Dashboard SQL Editor and report back the result — do not assume it passed just because the SQL file is correct.

## Git push access

`git push` to `BlueKiwiTech/condominio-app` on GitHub is blocked from this environment (403 — the authenticated account, `byagasocial`, lacks push access). **The user pushes to GitHub themselves.** Agents should commit locally as normal but not attempt `git push` unless the user confirms access has been resolved.

## Vercel deployment

Vercel deploys are Git-connected to `main` on GitHub — a local commit does nothing to production until it's pushed to GitHub and picked up by Vercel's auto-deploy. Don't assume a local fix is live; if verifying a deployed URL, fetch the actual served assets (HTML/CSS/JS) rather than trusting local git state. The Vercel CLI here is also authenticated as `byagasocial`, unrelated to the account the user actually deploys from — do not run `vercel` commands (link/env/deploy) against this project; the user handles Vercel directly.
