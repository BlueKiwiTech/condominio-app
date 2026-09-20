# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/asobarcelona/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.
>
> This file replaces the tool's first auto-generated draft, which mis-categorized the
> project (it read "community" as a social forum and proposed claymorphism — chunky,
> toy-like, bubbly). This app tracks who owes money and since when; residents and admins
> need to trust the numbers at a glance. It grounds the UI in a "Soft UI Evolution" /
> financial-dashboard foundation instead of a playful one.
>
> **2026-09-19 update:** the community's actual brand is "ABC" (ASOBARCELONA CENTRO) — an
> illustrated navy/yellow logo (gate house + barrier + car) supplied by the board, plus a
> "mascot" used elsewhere to indicate debe/no debe (owes/doesn't owe). The color system
> below now uses the board's official palette in place of the earlier placeholder
> terracotta. The illustrated logo mark and mascot are not yet integrated as image assets
> — pending the source files — the sidebar/auth "ABC" monogram is a text placeholder until
> then.

---

**Project:** ASOBARCELONA CENTRO ("ABC") — condominio-app
**Product type:** Payments/dues management (admin) + self-service balance portal (resident)
**Stack:** Tailwind CSS v4 + shadcn/ui (replacing Once UI)

---

## Global Rules

### Color Palette

Official ABC institutional palette (navy + yellow, from the board-supplied brand sheet) +
semantic status colors that must stay visually distinct from the brand colors, since
"who's paid / who's late" is the core thing this app communicates. The sidebar is
navy-branded (a deliberate identity statement matching the logo's dominant navy field);
the main content area stays light for data readability.

| Role | Light | Dark | CSS Variable |
|------|-------|------|--------------|
| Background | `#FCFAF1` (abc-white) | `#000C1D` (abc-navy-dark) | `--background` |
| Surface/Card | `#FFFFFF` | `#00152F` (abc-navy-deep) | `--card` |
| Foreground (text) | `#022856` (abc-navy) | `#FCFAF1` | `--foreground` |
| Muted text | `#45566E` | `#9AB0C9` | `--muted-foreground` |
| Border | `#E6E2D2` | `#FFFFFF1A` | `--border` |
| Primary (brand/navy) | `#022856` | `#FBCB32` (abc-yellow) | `--primary` |
| Primary foreground | `#FFFFFF` | `#022856` | `--primary-foreground` |
| Secondary (brand/yellow) | `#FBCB32` (abc-yellow) | `#134E87` (abc-blue) | `--secondary` |
| Success / al día | `#2B6C3C` (abc-green-dark) bg tint 10% | `#6FBF7F` | `--success` |
| Warning / próximo a vencer | `#92600F` (deep gold, distinct from brand yellow) | `#FCE392` | `--warning` |
| Danger / moroso | `#FA482C` (abc-red) | `#FA482C` | `--destructive` |
| Sidebar background | `#022856` (abc-navy) | `#000C1D` | `--sidebar` |
| Sidebar active item | `#FBCB32` bg / `#022856` text | same | `--sidebar-primary` |

**Rule:** Primary (navy) and secondary (yellow) are for brand/interactive elements (buttons,
active nav, links, the sidebar's dark field). Never use them to encode payment status —
status always uses success/warning/destructive so the two systems (brand vs. "is this
house behind") never get confused at a glance. Warning deliberately uses a deep gold
(`#92600F`), not the vivid brand yellow, so a "pay soon" badge is never mistaken for a
brand CTA.

**Sidebar-specific tokens:** anything rendered directly on the navy `Sidebar` background
must use `text-sidebar-foreground` / `text-sidebar-foreground/70` (muted) / `bg-sidebar-accent`
— the generic `--muted-foreground`/`--accent` tokens are tuned for the light main-content
area and will be unreadable against navy.

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

- **Buttons:** shadcn `Button` — primary variant uses navy (yellow in dark mode); destructive
  variant (e.g. "eliminar cuota") uses `--destructive`; never repurpose destructive-red for
  anything except actual destructive actions or the "vencido" status badge.
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
- ❌ Using the primary/navy or secondary/yellow color to mean "paid" or "overdue" — status colors only
- ❌ Low-contrast muted text (never below `#45566E` on light backgrounds, or `text-sidebar-foreground/70` on the navy sidebar)
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
