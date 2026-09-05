---
phase: 01
slug: foundation-deployment
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-05
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None exists yet — greenfield repo, `create-next-app` doesn't install one by default |
| **Config file** | none — Wave 0 introduces smoke-check scripts, not a test framework |
| **Quick run command** | `npm run build` |
| **Full suite command** | `npm run build` + deployed-URL smoke check + RLS/policy-count SQL check |
| **Estimated runtime** | ~60 seconds (build) + ~30 seconds (deploy smoke check) |

---

## Sampling Rate

- **After every task commit:** Run `npm run build`
- **After every plan wave:** Run `npm run build` + the migration dry-run (`supabase db push --linked --dry-run`) against the linked project
- **Before `/gsd-verify-work`:** Full suite must be green — build succeeds, deployed URL smoke-checked, RLS/policy-count query confirmed across all 7 tables
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 0 | DPLY-01 | — | Smoke-check script exists to confirm deployed URL renders | script | `bash scripts/smoke-check.sh <url>` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 0 | DPLY-02 | T-01-01 | RLS-check script exists to confirm RLS enabled + zero policies on all 7 tables | sql script | `psql "$DATABASE_URL" -f scripts/check-rls.sql` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | DPLY-01 | — | `npm run build` completes with no errors after scaffold + Once UI wiring | build | `npm run build` | ✅ | ⬜ pending |
| 01-03-01 | 03 | 1 | DPLY-02 | T-01-01 | Migration applies cleanly; `pg_class.relrowsecurity` true and `pg_policies` empty for all 7 tables | sql | `psql "$DATABASE_URL" -f scripts/check-rls.sql` | ❌ W0 | ⬜ pending |
| 01-04-01 | 04 | 2 | DPLY-01 | T-01-02 | Deployed Vercel URL returns 200 and contains the expected shell marker; secret key not present in `.next/` build output | script | `bash scripts/smoke-check.sh <url>` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/smoke-check.sh` — curl-based check that the deployed URL renders without error (DPLY-01)
- [ ] `scripts/check-rls.sql` — SQL query asserting RLS enabled with zero policies across all 7 tables (DPLY-02)
- [ ] No unit-test framework introduction in this phase — first real business logic (worth a `vitest`/equivalent framework) arrives in Phase 4 (cuota engine) per `ARCHITECTURE.md`'s build order; adding one now would be premature per research findings.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Confirm actual Supabase project key naming (publishable/secret vs. legacy anon/service_role) | DPLY-01 | Depends on live dashboard rollout state at project-creation time, not scriptable in advance | After `supabase projects create`, check Settings → API Keys in the dashboard; name `.env.example`/Vercel env vars to match whichever convention is issued |
| Confirm secret key never appears in client bundle | DPLY-01 | One-time sanity grep against build output, not worth a persistent automated test in this phase | `grep -r "<secret-key-value>" .next/` after `npm run build`, expect no matches |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
