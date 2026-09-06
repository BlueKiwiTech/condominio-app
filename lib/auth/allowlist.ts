// Single-admin signup gate (D-01/D-02/D-03, PLAN.md Phase 2). Server-only —
// ADMIN_ALLOWLIST_EMAIL must never get a NEXT_PUBLIC_ prefix and must only be
// imported from server-side code (Server Actions), never a 'use client' file.
//
// Comma-split even though the current design locks this to exactly one email:
// keeps the format forward-compatible with a future second-admin/treasurer
// decision (PLAN.md Phase 2 "Deferred Ideas") without a breaking format change.
export function isAllowlistedAdminEmail(email: string): boolean {
  const allowlist = process.env.ADMIN_ALLOWLIST_EMAIL ?? '';
  return allowlist
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.trim().toLowerCase());
}
