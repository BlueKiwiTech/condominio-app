# Phase 1: Foundation & Deployment - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-04
**Phase:** 01-foundation-deployment
**Areas discussed:** Multi-admin support, Bootstrap/seed data, Local dev database workflow, Deployment environments

---

## Multi-admin support

| Option | Description | Selected |
|--------|-------------|----------|
| Discuss | Should the schema support multiple admins/board members from day one, or exactly one admin per community for v1? | ✓ |

**User's choice:** Exactly one admin for v1; two roles total in the system (admin, neighbor/resident).
**Notes:** Confirms the schema's existing single `communities.admin_id` FK is correct; resolves the open question flagged in `research/ARCHITECTURE.md`.

---

## Bootstrap / seed data

| Option | Description | Selected |
|--------|-------------|----------|
| Seed migration with placeholder data | Migration automatically inserts the ASOBARCELONA community row | |
| Manual one-time setup | Admin/dev manually creates the community row after deploy | ✓ |

**User's choice:** Manual one-time setup.
**Notes:** No admin signup UI exists until Phase 2, so the community row is created manually (SQL/dashboard) rather than via an automated seed.

---

## Local dev database workflow

| Option | Description | Selected |
|--------|-------------|----------|
| Local Supabase via Docker + CLI migrations | Fully offline-capable local dev | |
| Develop directly against hosted Supabase project | Simpler, no Docker | ✓ |

**User's choice:** Develop directly against a single hosted Supabase project — no local Docker.

---

## Deployment environments

| Option | Description | Selected |
|--------|-------------|----------|
| Production only | One Vercel project, one Supabase project | ✓ |
| Production + preview/staging | Preview deployments per branch/PR | |

**User's choice:** Production only.
**Notes:** User described the project as small-scale ("we are small") — no need for a staging environment at this size.

---

## Claude's Discretion

- Exact migration file naming/structure and Supabase CLI workflow details
- Exact folder layout for `lib/supabase/` client helpers
- Making `communities.admin_id` nullable if not already, to support the manual-bootstrap decision

## Deferred Ideas

None — discussion stayed within phase scope.
