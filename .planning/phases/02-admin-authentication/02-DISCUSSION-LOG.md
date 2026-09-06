# Phase 2: Admin Authentication - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-06
**Phase:** 02-admin-authentication
**Areas discussed:** Signup gating strategy

---

## Signup gating strategy

### Q1: How should admin signup be gated?

| Option | Description | Selected |
|--------|-------------|----------|
| Allowlist via env var | Pre-approved emails only, extensible to a treasurer later without code changes | ✓ |
| One-time bootstrap (first signup wins) | Open until first admin exists, then signup route rejects further attempts | |
| Fully open signup | Anyone with the URL can register as admin | |

**User's choice:** Allowlist via env var.

### Q2: What should happen when a non-allowlisted email tries to sign up?

| Option | Description | Selected |
|--------|-------------|----------|
| Clear rejection message | "This app is invite-only" — honest, no account created | ✓ |
| Generic/silent failure | Appears to succeed, no usable account created — anti-enumeration hardening | |

**User's choice:** Clear rejection message.

### Q3: Given the schema's single admin_id FK, what if the allowlist ever has a second email (treasurer)?

| Option | Description | Selected |
|--------|-------------|----------|
| Allowlist is single-email for now | Matches the schema exactly; second admin is a future phase | ✓ |
| Allow multiple emails, second signup succeeds but isn't linked to admin_id | Full account created but not authoritative admin | |

**User's choice:** Allowlist is single-email for now.

**Notes:** This closes the loop on D-03 from Phase 1 ("communities.admin_id stays nullable until Phase 2 admin signup links it") — with a single-email allowlist, there's no ambiguity about which account gets linked.

---

## Claude's Discretion

- Exact allowlist env var name/format
- Email verification enforcement details (which routes are reachable pre-verification)
- Session persistence specifics (duration, remember-me UX)
- Password reset flow UI/copy

## Deferred Ideas

- Second admin / treasurer account support — requires a schema change (communities.admin_id is currently a single FK), explicitly deferred to a future phase if ever needed.
