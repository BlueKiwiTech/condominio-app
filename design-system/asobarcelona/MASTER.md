# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/asobarcelona/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.
>
> This file replaces the tool's first auto-generated draft, which mis-categorized the
> project (it read "community" as a social forum and proposed claymorphism — chunky,
> toy-like, bubbly). This app tracks who owes money and since when; residents and admins
> need to trust the numbers at a glance. This version keeps the warmth the user asked for
> (warm palette, rounded shapes, approachable type) but grounds it in a "Soft UI Evolution"
> / financial-dashboard foundation instead of a playful one.

---

**Project:** ASOBARCELONA — condominio-app
**Product type:** Payments/dues management (admin) + self-service balance portal (resident)
**Stack:** Tailwind CSS v4 + shadcn/ui (replacing Once UI)

---

## Global Rules

### Color Palette

Warm-neutral base (not cold slate/gray) + terracotta brand accent + teal secondary +
semantic status colors that must stay visually distinct from the brand color, since
"who's paid / who's late" is the core thing this app communicates.

| Role | Light | Dark | CSS Variable |
|------|-------|------|--------------|
| Background | `#FBF9F6` | `#1C1917` | `--background` |
| Surface/Card | `#FFFFFF` | `#292524` | `--card` |
| Foreground (text) | `#292118` | `#FAFAF9` | `--foreground` |
| Muted text | `#57534E` | `#A8A29E` | `--muted-foreground` |
| Border | `#E7E2DA` | `#3F3A34` | `--border` |
| Primary (brand/terracotta) | `#C2410C` | `#FB923C` | `--primary` |
| Primary hover | `#9A3412` | `#F97316` | — |
| Primary foreground | `#FFFFFF` | `#1C1917` | `--primary-foreground` |
| Secondary (teal accent) | `#0F766E` | `#2DD4BF` | `--secondary` |
| Success / al día | `#15803D` bg `#F0FDF4` | `#4ADE80` bg `#14251A` | `--success` |
| Warning / próximo a vencer | `#B45309` bg `#FFFBEB` | `#FBBF24` bg `#2A2011` | `--warning` |
| Danger / moroso | `#B91C1C` bg `#FEF2F2` | `#F87171` bg `#2A1616` | `--destructive` |

**Rule:** Primary (terracotta) is for brand/interactive elements (buttons, active nav, links).
Never use it to encode payment status — status always uses success/warning/destructive so the
two systems (brand vs. "is this house behind") never get confused at a glance.

### Typography

- **Font:** Plus Jakarta Sans (single family, headings + body) — friendly, modern, approachable,
  reads well in dense tables and dashboards, holds up in Spanish (default locale) and English.
- **Google Fonts:** https://fonts.google.com/share?selection.family=Plus+Jakarta+Sans:wght@400;500;600;700;800
- **Scale:** body 16px/1.6, small/table text 14px/1.5 minimum (never below 14px for real content),
  h1 32-36px/700, h2 24-28px/700, h3 20px/600, label/eyebrow 13px/600 uppercase tracked.

### Spacing

8px base unit — `--space-1` 4px, `-2` 8px, `-3` 12px, `-4` 16px, `-6` 24px, `-8` 32px, `-12` 48px, `-16` 64px.
Use Tailwind's default scale directly (`p-4`, `gap-6`, etc.) rather than inventing custom tokens.

### Radius & Shadows (Soft UI Evolution, not claymorphism)

- Radius: `--radius: 0.65rem` (~10px) for cards/inputs/buttons, `1rem` for modals/sheets, full for pills/avatars.
- Shadows are single-layer and subtle — never double/inset "clay" shadows, never thick borders:
  - `--shadow-sm`: `0 1px 2px rgba(41,33,24,0.06)` — table rows, list items
  - `--shadow-md`: `0 2px 8px rgba(41,33,24,0.08)` — cards
  - `--shadow-lg`: `0 12px 24px rgba(41,33,24,0.12)` — dropdowns, popovers, modals
- Borders: 1px, `--border` color. No 3-4px chunky borders.

---

## Component Guidance (shadcn/ui primitives)

- **Buttons:** shadcn `Button` — primary variant uses terracotta; destructive variant (e.g. "eliminar
  cuota") uses `--destructive`; never repurpose destructive-red for anything except actual
  destructive actions or the "vencido" status badge.
- **Status badges:** small pill, colored background tint + matching text color from the
  success/warning/destructive trio above (e.g. `bg-[--success]/10 text-[--success]`). This is the
  single most-repeated component in the app (morosos tables, cuota lists, payment history) — build
  it once as `<StatusBadge status="al-dia" | "proximo" | "vencido" />` and reuse everywhere.
- **Cards:** `bg-card`, `rounded-[--radius]`, `shadow-md`, `border border-border`. Stat/KPI cards
  (saldo, total morosos) get a large 28-32px numeral + small label, per Financial/Executive
  Dashboard pattern — 4-6 max per row, no more.
- **Tables:** dense but readable (14px row text, 44px min row height for touch), sticky header,
  right-align monetary columns, status column uses the badge above, never color the whole row.
- **Forms:** react-hook-form + zod stays as-is; swap Once UI inputs for shadcn `Input`/`Select`/
  `Form` — labels always visible (never placeholder-as-label, residents include non-technical users).
- **Currency:** every amount keeps the existing es-VE thousands/decimal formatting; never lose that
  when migrating a component.

---

## Anti-Patterns (Do NOT Use)

- ❌ Claymorphism / toy-like shadows, thick borders, bubbly shapes — wrong trust register for money
- ❌ Emojis as icons — use `lucide-react` (shadcn's default icon set)
- ❌ Missing `cursor-pointer` on clickable rows/cards
- ❌ Using the primary/terracotta color to mean "paid" or "overdue" — status colors only
- ❌ Low-contrast muted text (never below `#57534E` on light backgrounds)
- ❌ Summing or comparing amounts across currencies (USD/Bs/USDT) — unrelated to visuals but a
  standing project rule worth repeating since reporting UI will display these side by side

## Pre-Delivery Checklist

- [ ] No emojis as icons (lucide-react only)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover/transition 150-300ms, `transform`/`opacity` only
- [ ] Light **and** dark mode checked — warm backgrounds, not pure white/black
- [ ] Text contrast 4.5:1 minimum (use the muted-foreground values above, not lighter)
- [ ] Focus rings visible (`--ring` = primary at reduced opacity)
- [ ] Responsive at 375 / 768 / 1024 / 1440px, no horizontal scroll
- [ ] Status badges only ever use success/warning/destructive, never primary
- [ ] Monetary values right-aligned in tables, formatted with es-VE separators
