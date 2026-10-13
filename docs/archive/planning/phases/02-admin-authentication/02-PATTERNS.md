# Phase 2: Admin Authentication - Pattern Map

**Mapped:** 2026-09-06
**Files analyzed:** 18 (create-new: 15, modify-existing: 3)
**Analogs found:** 8 / 18 in-repo (structural/file-convention matches); 10 / 18 have no in-repo analog (first Server Actions, first forms, first route-gating logic in this codebase) — those defer to `STACK.md`'s documented Supabase/Once UI primitives, cited per-file below.

## Repository State (relevant to this phase)

Phase 1 left a scaffold with **zero forms, zero Server Actions, zero protected routes, and zero non-empty message files**. The only in-repo precedent is the Supabase client-factory trio (`lib/supabase/server.ts`, `lib/supabase/client.ts`, `proxy.ts`) and the barebones `app/[locale]/layout.tsx` + `page.tsx` + `components/Providers.tsx`. Every auth *form*, *Server Action*, and *route-gating* file in this phase is a first-of-its-kind in this repo — treat the in-repo files below as **structural/convention** analogs (import style, client/server split, provider nesting), not as behavioral analogs, and lean on `STACK.md` §"Stack Patterns by Variant" + Once UI's own `.d.ts` component contracts (read directly from `node_modules`, quoted below) for the actual auth logic and form-component props.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `app/[locale]/(auth)/layout.tsx` | component (auth shell layout) | request-response (SSR render) | `app/[locale]/layout.tsx` | structural-match (only root layout in repo) |
| `app/[locale]/(auth)/signup/page.tsx` | component (page) | request-response | `app/[locale]/page.tsx` | structural-match (only page in repo) |
| `app/[locale]/(auth)/verify-email/page.tsx` | component (page) | request-response | `app/[locale]/page.tsx` | structural-match |
| `app/[locale]/(auth)/login/page.tsx` | component (page) | request-response | `app/[locale]/page.tsx` | structural-match |
| `app/[locale]/(auth)/forgot-password/page.tsx` | component (page) | request-response | `app/[locale]/page.tsx` | structural-match |
| `app/[locale]/(auth)/reset-password/page.tsx` | component (page) | request-response | `app/[locale]/page.tsx` | structural-match |
| `app/[locale]/(admin)/dashboard/page.tsx` (minimal stub, needed to prove route-gating success criterion 2) | component (page) | request-response | `app/[locale]/page.tsx` | structural-match |
| `components/auth/SignupForm.tsx` | component (client form) | request-response (client→Server Action) | `components/Providers.tsx` (only `'use client'` file in repo — import/directive convention only) | role-mismatch, convention-only |
| `components/auth/LoginForm.tsx` | component (client form) | request-response | same as above | role-mismatch, convention-only |
| `components/auth/ForgotPasswordForm.tsx` | component (client form) | request-response | same as above | role-mismatch, convention-only |
| `components/auth/ResetPasswordForm.tsx` | component (client form) | request-response | same as above | role-mismatch, convention-only |
| `lib/actions/auth.ts` (signup/login/logout/forgotPassword/resetPassword Server Actions) | service (Server Actions) | request-response | `lib/supabase/server.ts` (Supabase server-client factory it will call) | **no direct analog** — first Server Action file; use STACK.md Pattern A + Supabase `.d.ts` signatures |
| `lib/auth/allowlist.ts` | utility | transform (env check) | none | **no analog** — trivial, single-purpose env-var comparison |
| `lib/validation/auth.ts` | utility (zod schemas) | transform | none | **no analog** — first zod schema file in repo (installed but unused since Phase 1) |
| `proxy.ts` (modify) | middleware | request-response | itself (Phase 1 version, extend in place) | **exact file, extend existing pattern** |
| `.env.example` (modify) | config | — | itself | exact file, add one line |
| `messages/es.json`, `messages/en.json` (modify) | config (i18n) | transform | themselves (currently `{}`) | exact file, add `auth` namespace |

## Pattern Assignments

### `app/[locale]/(auth)/layout.tsx` (component, request-response)

**Analog:** `app/[locale]/layout.tsx` (full file read — 46 lines, quoted in full above in project context)

**Imports pattern** (root layout, lines 1-10):
```typescript
import '@once-ui-system/core/css/styles.css';
import '@once-ui-system/core/css/tokens.css';
import '@/resources/custom.css';
import classNames from 'classnames';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { fonts } from '@/resources/once-ui.config';
import { Providers } from '@/components/Providers';
```
The route-group layout does **not** repeat the CSS imports or `NextIntlClientProvider`/`Providers` wrapping (those live once in the root `app/[locale]/layout.tsx` and apply to all nested segments, including `(auth)`). The `(auth)/layout.tsx` should be a much thinner Server Component whose only job is the UI-SPEC's "single centered Card layout" (Once UI `Column` centering wrapper), reusing the same async-`params`-less shape since route groups don't add a URL segment.

**Core pattern to copy** — centering wrapper, per UI-SPEC "Spacing Scale" (`xl`=32px card-to-viewport-edge on mobile, `2xl`=48px vertical centering padding on desktop) and `app/[locale]/page.tsx`'s existing `Column fillWidth center paddingY="64"` convention (`app/[locale]/page.tsx` lines 1-12, quoted above):
```typescript
import { Column } from '@once-ui-system/core';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Column fillWidth center paddingY="48" paddingX="32" style={{ minHeight: '100vh' }}>
      {children}
    </Column>
  );
}
```

---

### `app/[locale]/(auth)/{signup,login,forgot-password,reset-password,verify-email}/page.tsx` (component, request-response)

**Analog:** `app/[locale]/page.tsx` (full file, 12 lines):
```typescript
import { Column, Heading, Text } from '@once-ui-system/core';

export default function Home() {
  return (
    <Column fillWidth center paddingY="64" gap="16">
      <Heading variant="display-strong-l">ASOBARCELONA</Heading>
      <Text variant="body-default-m" onBackground="neutral-weak">
        Condominio App — foundation deployed.
      </Text>
    </Column>
  );
}
```
Pattern to carry forward: default-export Server Component function, Once UI layout primitives imported directly from `@once-ui-system/core`, no data-fetching in this placeholder. For the 5 auth pages, each `page.tsx` should stay a thin Server Component that renders the `Card` (per UI-SPEC "Screens in Scope" — every screen shares one Card shell) with a `Heading` (per UI-SPEC Typography: 20px/600, e.g. `variant="heading-strong-m"` — verify against Once UI's actual Heading variant list, `display-strong-l` above is the only confirmed-working variant from Phase 1) and delegate the interactive form to a `'use client'` component from `components/auth/*` (form state, `react-hook-form`, and the Server Action call must live in a Client Component — Server Components cannot hold `useForm()` state).

**Reset-password page detail:** must read the Supabase reset token from the URL (search params passed via Next.js's `page.tsx` `searchParams` prop) and pass it through to `ResetPasswordForm`, since `supabase.auth.updateUser({ password })` in a reset-callback flow relies on the recovery session already being established by Supabase's own `/auth/v1/verify` redirect — confirm exact flow against `STACK.md`'s `getUser()`-before-any-sensitive-action rule (STACK.md line 86) before wiring.

---

### `app/[locale]/(admin)/dashboard/page.tsx` (minimal stub — needed for AUTH success criterion 2)

**Analog:** `app/[locale]/page.tsx` (same as above — trivial placeholder, no new pattern)

This stub only needs to exist so `proxy.ts`'s new route-gating logic has a real `(admin)/*` path to redirect *from*. Keep it to a one-line authenticated placeholder (e.g. `<Text>Admin dashboard placeholder — Phase 3+ builds real content.</Text>`) — building out real dashboard content is explicitly out of this phase's scope per `02-CONTEXT.md`'s Phase Boundary.

---

### `components/auth/{Signup,Login,ForgotPassword,ResetPassword}Form.tsx` (component, client form, request-response)

**Analog (directive/import convention only):** `components/Providers.tsx` lines 1-12:
```typescript
"use client";

import { style, dataStyle } from "@/resources/once-ui.config";
import {
  LayoutProvider,
  ThemeProvider,
  DataThemeProvider,
  ToastProvider,
  IconProvider,
} from "@once-ui-system/core";
import { iconLibrary } from "@/resources/icons";
```
This is the **only** `'use client'` file in the repo — copy its directive-at-top-of-file convention and its style of importing multiple named exports from `@once-ui-system/core` in one destructured import. It is not a form and has no react-hook-form/zod precedent to copy; that logic must come from the library contracts below (confirmed via direct `.d.ts` reads, not assumed):

**Form field components (confirmed prop contracts from `node_modules/@once-ui-system/core/dist/components/*.d.ts`):**
```typescript
// Input.d.ts — id and error/errorMessage are the validation-display hooks
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label?: string;
  error?: boolean;
  errorMessage?: ReactNode;
  description?: ReactNode;
  loading?: boolean;
  // ...
}

// PasswordInput.d.ts — same InputProps contract, built-in show/hide toggle
export const PasswordInput: React.ForwardRefExoticComponent<InputProps & React.RefAttributes<HTMLInputElement>>;

// Feedback.d.ts — the inline error/success banner (allowlist rejection, invalid creds, etc.)
interface FeedbackProps extends Omit<React.ComponentProps<typeof Flex>, "title"> {
  variant?: "info" | "danger" | "warning" | "success";
  icon?: boolean;
  title?: string;
  description?: string;
  showCloseButton?: boolean;
  onClose?: () => void;
}

// SmartLink.d.ts — "¿Olvidaste tu contraseña?" / "¿No tienes cuenta?" links
interface SmartLinkCommonProps {
  href?: string;
  children: ReactNode;
  // ...
}

// Button.d.ts — primary CTA
interface ButtonCommonProps {
  variant?: "primary" | "secondary" | "tertiary" | ... | "danger";
  loading?: boolean;
  disabled?: boolean;
  fillWidth?: boolean;
  children?: ReactNode;
}
```

**Core client-form pattern (no in-repo precedent — synthesize from installed-but-unused deps + STACK.md):** every form component should follow the standard `react-hook-form` + `zod` + `@hookform/resolvers` + Server Action wiring already locked in as this project's stack (`STACK.md` line 29-31; `package.json` already has `react-hook-form@^7.87.0`, `zod@^4.5.4`, `@hookform/resolvers@^5.9.1` installed since Phase 1 but unused):
```typescript
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useTransition } from 'react';
import { Column, Input, PasswordInput, Button, Feedback, SmartLink } from '@once-ui-system/core';
import { loginSchema, type LoginInput } from '@/lib/validation/auth';
import { login } from '@/lib/actions/auth';

export function LoginForm() {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginInput) => {
    setServerError(null);
    startTransition(async () => {
      const result = await login(data);
      if (result?.error) setServerError(result.error);
      // success path: Server Action performs the redirect server-side
    });
  };

  return (
    <Column as="form" onSubmit={handleSubmit(onSubmit)} gap="16" fillWidth>
      {serverError && <Feedback variant="danger" description={serverError} />}
      <Input id="email" label="Correo" {...register('email')} error={!!errors.email} errorMessage={errors.email?.message} />
      <PasswordInput id="password" label="Contraseña" {...register('password')} error={!!errors.password} errorMessage={errors.password?.message} />
      <Button type="submit" variant="primary" fillWidth loading={isPending}>Iniciar sesión</Button>
      <SmartLink href="/forgot-password">¿Olvidaste tu contraseña?</SmartLink>
    </Column>
  );
}
```
Apply the same shape to `SignupForm` (email + password fields, allowlist-rejection `Feedback` on submit failure per D-04), `ForgotPasswordForm` (email field only, non-committal success `Feedback` per UI-SPEC copy table), and `ResetPasswordForm` (password + confirm-password fields, expired-token `Feedback` on failure).

---

### `lib/actions/auth.ts` (service, Server Actions, request-response) — **no in-repo analog, first Server Action file**

**Structural analog for the Supabase client call:** `lib/supabase/server.ts` (full file, 26 lines, quoted above):
```typescript
// lib/supabase/server.ts — Server Components / Server Actions
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { ... }, setAll(cookiesToSet) { ... } } },
  );
}
```
Every Server Action in `lib/actions/auth.ts` must call this same `createClient()` factory (never construct its own Supabase client, never import `lib/supabase/client.ts`'s browser factory — that would be the exact client/server mixing bug Phase 1's research flagged, see `01-CONTEXT.md`/RESEARCH.md Pitfall 6 references above).

**Auth method calls — no in-repo precedent; use STACK.md's locked guidance (STACK.md lines 96-98, 86):**
```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { loginSchema, signupSchema } from '@/lib/validation/auth';
import { isAllowlistedAdminEmail } from '@/lib/auth/allowlist';

export async function signup(input: SignupInput) {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return { error: 'Datos inválidos.' };

  if (!isAllowlistedAdminEmail(parsed.data.email)) {
    // D-04: explicit, honest rejection — never silently fail or create an unusable account
    return { error: 'Este sistema es solo por invitación. Si crees que esto es un error, contacta al administrador de ASOBARCELONA.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { error: error.message };

  // D-05: link this account to condo_communities.admin_id (single-admin schema, no ambiguity)
  await supabase.from('condo_communities').update({ admin_id: data.user!.id }).is('admin_id', null);

  redirect('/verify-email');
}

export async function login(input: LoginInput) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { error: 'Datos inválidos.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Supabase returns a generic invalid-credentials error for both wrong password
    // AND unverified email in some configs — check error.message/status per
    // Supabase docs before mapping to the two distinct UI-SPEC copy strings.
    return { error: 'Correo o contraseña incorrectos. Verifica tus datos e intenta de nuevo.' };
  }
  redirect('/dashboard');
}
```
**Critical rule carried from STACK.md line 86 (`getSession()` ban):** never gate an authorization decision on `getSession()`. Server Actions that need to confirm *who* the current user is before a sensitive write (not needed for signup/login themselves, since those establish the session, but relevant for any future admin-only action) must call `getUser()` (network-verified), never `getSession()`.

**No analog for:** `forgotPassword` (→ `supabase.auth.resetPasswordForEmail(email, { redirectTo })`) and `resetPassword` (→ `supabase.auth.updateUser({ password })`) — both are standard, single-call Supabase Auth methods with no project precedent; implement directly per Supabase's documented signatures, wrapped in the same `'use server'` + zod-validate + try/catch shape as `login`/`signup` above.

---

### `lib/validation/auth.ts` (utility, transform) — no in-repo analog

No zod schema exists yet in this repo (dependency installed in Phase 1, unused). Follow STACK.md's locked convention ("zod... for all form/Server Action inputs... validate... before touching the DB", STACK.md line 29) and the shared shape needed by both `react-hook-form`'s `zodResolver` (client) and the Server Action's own `safeParse` (server) — the **same schema object must be imported by both** to avoid client/server validation drift:
```typescript
import { z } from 'zod';

export const signupSchema = z.object({
  email: z.string().email('Correo inválido.'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email('Correo inválido.'),
  password: z.string().min(1, 'Ingresa tu contraseña.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: z.string().email('Correo inválido.') });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Las contraseñas no coinciden.',
  path: ['confirmPassword'],
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
```

---

### `lib/auth/allowlist.ts` (utility, transform) — no in-repo analog

Single-purpose env-var comparison per D-01/D-02/D-03. No project precedent; per `02-CONTEXT.md` code_context section, must be a **server-only** env var (no `NEXT_PUBLIC_` prefix — this convention is explicitly established in `02-CONTEXT.md` line 62, matching Phase 1's `SUPABASE_SERVICE_ROLE_KEY` server-only precedent visible in `.env.example` line 3):
```typescript
export function isAllowlistedAdminEmail(email: string): boolean {
  const allowlist = process.env.ADMIN_ALLOWLIST_EMAIL ?? '';
  return allowlist
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .includes(email.trim().toLowerCase());
}
```
Comma-split now (even though D-02 locks it to exactly one email) keeps the format forward-compatible with a future second-admin decision (noted as Deferred in `02-CONTEXT.md`) without a breaking format change later.

---

### `proxy.ts` (middleware, request-response) — **modify existing file in place**

**Current file (full, 43 lines, already quoted above):** composes `next-intl`'s `handleI18nRouting` with a no-op `supabase.auth.getClaims()` call. Phase 2 extends this exact function — do not rewrite from scratch, do not rename to `middleware.ts` (Next 16 renamed this convention, per Phase 1's `01-PATTERNS.md` "Next.js 16 File Convention Renames" shared pattern, still binding).

**Extension point** (currently a no-op, lines 28-33):
```typescript
// getClaims() validates the JWT locally against the project's published
// public keys on every call -- safe for authorization decisions, no
// network round-trip to the auth server (unlike the alternative session
// helpers). No routes are gated yet in Phase 1; this wires the correct
// pattern for Phase 2/3 to build route-gating on.
await supabase.auth.getClaims();

return response;
```
**Add here (do not replace the existing `getClaims()` call — extend the result):**
```typescript
const { data } = await supabase.auth.getClaims();
const isAdminRoute = /^\/(?:es|en)?\/?\(admin\)|\/(?:es|en)?\/?admin(\/|$)/.test(request.nextUrl.pathname);
// NOTE: exact admin-route-group matching depends on final URL shape once
// app/[locale]/(admin)/ is scaffolded — verify actual pathname shape
// (route groups don't appear in the URL) before finalizing this regex;
// prefer matching on the literal known prefix, e.g. `/dashboard`, once
// the (admin) route group's real segments are known.
if (isAdminRoute && !data?.claims) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  return NextResponse.redirect(loginUrl);
}

return response;
```
**Critical constraint from STACK.md (line 86, 130):** `getClaims()` is correct here (fast, locally-verified, no network round-trip — appropriate for a middleware/proxy redirect check). Do **not** upgrade this to `getUser()` inside `proxy.ts` — `getUser()` belongs in the Server Action/Route Handler layer for the actual sensitive-write authorization gate (STACK.md explicitly separates these two use cases), and middleware must stay Edge-runtime-safe (no service-role client, no `pgcrypto`/`bcryptjs`, per STACK.md line 130 — not relevant to admin auth but a hard boundary for this file regardless).

---

### `.env.example` (modify) — add one line

**Current file (full, 3 lines):**
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxxxx...
```
Add, following the existing no-`NEXT_PUBLIC_`-prefix-for-server-secrets convention already established by line 3 above:
```
ADMIN_ALLOWLIST_EMAIL=admin@asobarcelona.example
```

---

### `messages/{es,en}.json` (modify) — add `auth` namespace

**Current files (full content, both):** `{}`

Both are empty placeholders per Phase 1's explicit deferral ("`messages/es.json` / `messages/en.json` can be near-empty placeholders in this phase — do not write real translation content yet", `01-PATTERNS.md` line 91). Phase 2 is the first phase that needs real content in these files, since the UI-SPEC's Copywriting Contract (lines 106-129) requires bilingual copy for every auth screen. Populate a top-level `auth` key in each, keyed to the exact strings in the UI-SPEC's Copywriting Contract table — do not paraphrase the locked copy. Structure to follow (`next-intl`'s standard nested-namespace convention, consumed via `useTranslations('auth')` in Client Components or `getTranslations('auth')` in Server Components — both are `next-intl` library conventions, not project-specific, since no prior namespace exists to copy from):
```json
{
  "auth": {
    "signup": { "cta": "Crear cuenta", "heading": "Crear cuenta" },
    "login": { "cta": "Iniciar sesión", "heading": "Iniciar sesión" },
    "forgotPassword": { "cta": "Enviar enlace de recuperación" },
    "resetPassword": { "cta": "Restablecer contraseña", "heading": "Restablecer contraseña" },
    "verifyEmail": { "heading": "Verifica tu correo", "body": "Enviamos un enlace de verificación a {email}. Ábrelo para activar tu cuenta y acceder al panel de administración." },
    "errors": {
      "allowlistRejected": "Este sistema es solo por invitación. Si crees que esto es un error, contacta al administrador de ASOBARCELONA.",
      "invalidCredentials": "Correo o contraseña incorrectos. Verifica tus datos e intenta de nuevo.",
      "unverifiedEmail": "Tu correo aún no está verificado. Revisa tu bandeja de entrada para activar tu cuenta.",
      "expiredResetLink": "Este enlace de recuperación ya no es válido. Solicita uno nuevo."
    },
    "success": {
      "resetEmailSent": "Si el correo existe en nuestro sistema, enviamos un enlace de recuperación.",
      "passwordUpdated": "Tu contraseña se actualizó correctamente. Ya puedes iniciar sesión."
    }
  }
}
```
(English `en.json` mirrors the same key structure with the UI-SPEC's English column.)

## Shared Patterns

### Supabase server-client factory (applies to: `lib/actions/auth.ts`, every Server Action added this phase)

**Source:** `lib/supabase/server.ts` (full file quoted above)
**Apply to:** every function in `lib/actions/auth.ts` — always call `await createClient()` from this file, never instantiate `createServerClient` directly inline, never import the browser factory (`lib/supabase/client.ts`).

### `getClaims()` vs `getUser()` vs `getSession()` split (applies to: `proxy.ts`, `lib/actions/auth.ts`)

**Source:** `STACK.md` lines 86, 96-98, 105 (Pattern A description) + Phase 1's `01-PATTERNS.md` "Next.js 16 File Convention Renames"
**Rule:** `getClaims()` only in `proxy.ts` (fast, local, redirect-only decisions). `getUser()` for any Server Action that needs a network-verified identity before a sensitive action. `getSession()` is banned everywhere as an authorization gate (STACK.md line 86 — explicit "what NOT to use" entry).

### Once UI form-field error contract (applies to: all four `components/auth/*Form.tsx` files)

**Source:** `Input.d.ts` / `PasswordInput.d.ts` (quoted above)
**Apply to:** every field — always pass `error={!!errors.<field>}` and `errorMessage={errors.<field>?.message}` from react-hook-form's `formState.errors`, matching Once UI's own `error`/`errorMessage` prop names exactly (not a custom error-display pattern).

### Env var server/client boundary (applies to: `lib/auth/allowlist.ts`, `.env.example`)

**Source:** `02-CONTEXT.md` line 62 (explicit instruction) + `.env.example`'s existing `SUPABASE_SERVICE_ROLE_KEY` (no-prefix) precedent vs. `NEXT_PUBLIC_SUPABASE_*` (prefixed) precedent
**Apply to:** `ADMIN_ALLOWLIST_EMAIL` must never get a `NEXT_PUBLIC_` prefix and must only be read inside server-only files (`lib/actions/auth.ts` via `lib/auth/allowlist.ts`) — never imported into a `'use client'` file.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `lib/actions/auth.ts` | service (Server Actions) | request-response | First Server Action file in the repo — no `'use server'` file exists from Phase 1. Use STACK.md Pattern A (lines 96-98) + Supabase Auth method signatures (`signUp`, `signInWithPassword`, `resetPasswordForEmail`, `updateUser`) directly. |
| `lib/validation/auth.ts` | utility (zod schemas) | transform | `zod`/`react-hook-form`/`@hookform/resolvers` installed in Phase 1 but never used — no schema file exists anywhere in the repo yet. |
| `lib/auth/allowlist.ts` | utility | transform | Single-purpose, no precedent needed beyond a plain env-var string comparison. |
| `components/auth/*Form.tsx` (4 files) | component (client form) | request-response | First interactive forms in the repo; Phase 1 shipped zero forms. `components/Providers.tsx` only supplies the `'use client'` directive convention, not form logic. |
| `app/[locale]/(admin)/dashboard/page.tsx` | component (page stub) | request-response | First route inside an `(admin)` route group — group itself doesn't exist yet; created here only as the minimal target for route-gating verification. |

## Metadata

**Analog search scope:** entire repository (`app/`, `components/`, `lib/`, `i18n/`, `messages/`, `proxy.ts`, `resources/`, root config files) — confirmed via `find`/`ls` that Phase 1 produced exactly 10 non-planning source files plus `messages/{es,en}.json`, `package.json`, `.env.example`. Once UI's actual shipped `.d.ts` component contracts were read directly from `node_modules/@once-ui-system/core/dist/components/{Input,PasswordInput,Feedback,SmartLink,Button,Card}.d.ts` rather than assumed from the UI-SPEC's component names alone.
**Files scanned:** 10 in-repo source files read in full (`app/[locale]/layout.tsx`, `app/[locale]/page.tsx`, `lib/supabase/client.ts`, `lib/supabase/server.ts`, `proxy.ts`, `components/Providers.tsx`, `i18n/routing.ts`, `i18n/request.ts`, `messages/es.json`, `messages/en.json`), plus `package.json`, `.env.example`, `supabase/migrations/*.sql` (grep for `admin_id`), 6 Once UI `.d.ts` files, and Phase 1's `01-PATTERNS.md`/`01-05-SUMMARY.md` for established conventions.
**Pattern extraction date:** 2026-09-06
