# Feature Research

**Domain:** Condo / HOA / closed-community payment-management software
**Researched:** 2026-09-04
**Confidence:** MEDIUM (WebSearch + one direct-fetch competitor site; no Context7-equivalent for this domain — SaaS product landscape, not a library)

## Cross-Check Summary vs. User's Spec

The user (via `docs/handoff-prompt.md` and `.planning/PROJECT.md`) has already specified a detailed v1 feature set. This research validates it against the condo/HOA payment-management category broadly (US-style HOA suites: Buildium, AppFolio, ManageCasa, Condo Control) and the Venezuela-specific niche (VecinosWeb, MeruSoft, Odoo Condominio) that most closely matches this project's context (Bs/USDT currencies, WhatsApp-adjacent culture, "cuota"/"moroso"/"saldo" vocabulary).

**Verdict: the user's v1 scope is realistic and well-matched to the domain.** It correctly includes the universal table stakes (dues management, payment registration, delinquency tracking, resident balance/history) and correctly excludes the features that make general HOA suites bloated (full accounting/budgeting, maintenance/work orders, amenity booking, architectural review, voting, document repository). One category is commonly expected but absent from the spec: **payment receipts/comprobantes** for residents. This is flagged below as a likely near-term addition, not a blocker for v1.

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes | In User's Spec? |
|---------|--------------|------------|-------|------------------|
| Dues/cuota definition (recurring + one-time) | Every condo/HOA tool exists to define what's owed and when — this is the core object model | MEDIUM | Recurring cadence (weekly/monthly/annual) + one-time/special cuotas is standard; the divisible/staggered-installment variant is a step up in complexity | YES — matches |
| Manual payment registration by admin | Even software that supports online payment processing (Buildium, AppFolio) still needs a manual/offline entry path for cash, transfer, check | LOW-MEDIUM | Must support partial payments and payments against multiple pending cuotas at once | YES — matches |
| Delinquency (morosos) tracking/dashboard | This is the #1 reason condo boards adopt software — "who owes what" is the core value prop across every competitor reviewed (VecinosWeb, MeruSoft, Buildium) | MEDIUM | Needs house, owner, amount owed, days overdue, currency — matches spec exactly | YES — matches |
| Resident balance (saldo) check | Table stakes across every resident portal reviewed — "view payment history" and "current balance" appear in all competitor feature lists | LOW-MEDIUM | Positive/negative balance framing (credit vs. debt) with oldest-unpaid-date is a reasonable, standard presentation | YES — matches |
| Resident payment history / cuota calendar | Universal in resident portals (VecinosWeb: "consulta de estado de cuenta," "historial de pagos") | MEDIUM | Calendar/grid with color-coded status (pending/paid/overdue/advance) is a nicer-than-average presentation of a standard feature | YES — matches |
| Financial/collection reports for admin | Every competitor offers monthly collection reports; Odoo Condominio and VecinosWeb both emphasize this for legal compliance (Venezuela's Ley de Propiedad Horizontal requires financial transparency to owners) | MEDIUM | Expected vs. paid vs. balance vs. status per house, filterable by month — matches spec | YES — matches |
| House/unit + owner records (CRUD) | Foundational data model for any property-based system | LOW | Straightforward CRUD | YES — matches |
| Multi-currency amount tracking | Not universal globally, but table stakes in Venezuela's condo-software niche specifically — VecinosWeb advertises "tasa BCV," multi-currency as a headline feature because Bs volatility makes USD/BS/crypto tracking mandatory in this market | LOW-MEDIUM (no conversion logic needed per user's explicit choice) | Storing currency as an enum per transaction, never converting, is simpler than competitors who also show live exchange rates — a reasonable v1 simplification | YES — matches (and deliberately simpler than competitors) |
| Payment receipt / proof of payment (comprobante) | Every competitor reviewed (VecinosWeb: "recibo instantáneo," general HOA portals: "download payment receipts") treats this as baseline — residents expect a receipt/confirmation after a payment is registered, both for their own records and because in Venezuela's cash/transfer-heavy payment culture, disputes over "did I pay?" are common | LOW-MEDIUM | Not in the current spec. Could be as simple as a printable/PDF view of a payment record with house, cuota, amount, date, currency, admin who registered it. Recommend flagging for v1 or immediate v1.x — this is the one clear gap versus domain norms | **NOT in spec — gap flagged** |
| Admin authentication with password reset | Standard for any admin-facing SaaS/internal tool | LOW (Supabase Auth handles this) | Already scoped correctly | YES — matches |

### Differentiators (Competitive Advantage)

Note: since this is single-tenant, internal software for one community (not a market product competing for customers), "differentiator" here means "feature that meaningfully improves the experience for this specific community" rather than competitive positioning.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| No-email, house+PIN resident login | Most competitor portals assume residents have and check email; this community's residents may not. Removing email as a login requirement lowers adoption friction significantly for a closed, small community | MEDIUM (dual-auth architecture, custom RLS) | Correctly identified in PROJECT.md as "the trickiest architectural piece" — this is the project's real technical differentiator, not a feature bolt-on |
| Multi-currency without forced conversion (USD/Bs/USDT, shown as-entered) | Competitors like VecinosWeb show a live BCV exchange rate and often normalize to one currency for reporting; this app deliberately avoids that complexity and shows amounts exactly as paid/owed | LOW (once the "no conversion" decision is made, this is simpler than competitors, not harder) | This is a differentiator in the sense that it avoids scope competitors take on (exchange-rate feeds, conversion bugs) — a deliberate simplicity choice, not a feature to build |
| Divisible special cuotas with staggered installments (parent/child) | Lets the admin split a large one-time assessment (e.g., "repair the gate: $2000") into N smaller staggered payments without manually creating each one | MEDIUM-HIGH | Recursive generation logic flagged in PROJECT.md as core, non-incidental business logic — correctly prioritized |
| Color-coded cuota calendar/grid for residents | Visual status at a glance (pending/paid/overdue/advance) vs. the flat tables most competitor portals use | LOW-MEDIUM | Nice UX differentiator, low cost since it's a rendering choice on top of already-modeled data |
| Bilingual (ES/EN) UI | Not common in the Venezuela-specific competitor set (VecinosWeb, MeruSoft are Spanish-only); could matter if any owners are English-speaking or the app is shown to non-Spanish stakeholders | LOW-MEDIUM (i18n scaffolding) | Reasonable inclusion given low marginal cost with next-i18n-router/i18next already in the stack plan |

### Anti-Features (Commonly Requested, Often Problematic — Correctly or Recommended Excluded)

| Feature | Why Requested | Why Problematic for This Project | Alternative |
|---------|---------------|-----------------------------------|-------------|
| Online/card payment processing (Stripe, ACH, etc.) | Big HOA platforms (Buildium, AppFolio) lead with this; feels like the "modern" expectation | Adds PCI/compliance surface, payment-gateway integration, currency-gateway mismatch (no major processor natively handles Bs or USDT), and doesn't match how this community actually pays (cash/transfer/crypto wallet, then admin registers it) | Manual registration by admin after out-of-band payment — already correctly scoped as v1 approach in PROJECT.md |
| Full accounting suite (expense tracking, budgets, general ledger, financial statements) | US-style HOA suites (Buildium, AppFolio, ManageCasa) bundle full association accounting, not just dues collection | This app's core value is explicitly "who owes what, since when" (income/dues side only) — building a full double-entry accounting system triples scope for a single-tenant internal tool that doesn't need it | Keep scope to income/dues tracking; if expense tracking is ever needed, treat it as a distinct future module, not a v1 add-on |
| Maintenance/work orders, amenity booking, architectural review, e-voting, document repository | Bundled into every general HOA platform reviewed (Condo Control, AppFolio, Buildium) as part of "full community management" | None of these serve the stated core value (payment/morosos tracking); each is its own sub-domain with its own data model and UI, and building them dilutes focus from the thing that "must work before anything else" | Explicitly out of scope; revisit only if the community requests a specific one post-launch |
| Multi-tenant SaaS / multi-community support | Feels like "future-proofing" and the schema already has a `communities` table | Multi-tenant isolation, onboarding flows, and per-tenant billing are a different product entirely; adds RLS complexity now for a benefit that has no near-term payoff (one community, ASOBARCELONA) | Correctly already excluded in PROJECT.md; keep the `communities` table as a single-row placeholder only |
| Automated currency conversion / live exchange rate feed | Competitors like VecinosWeb show BCV rate conversions; feels "more useful" to show a USD-equivalent for Bs amounts | Exchange-rate feed integration, staleness/accuracy risk, and rounding disputes in a hyperinflation-prone currency are a rabbit hole; the user has explicitly decided against it | Store and display each amount in its original currency, never converted — already correctly scoped |
| Automated late-fee/penalty calculation | Standard in US HOA tools ("late fee automation... after configured grace period") | Adds a rules engine (grace periods, percentage vs. flat fee, currency-specific fee amounts) that the user hasn't requested; premature for a small, socially-managed community where late fees may be handled informally by the board, not by software | Defer; if requested later, add as a configurable rule on top of the existing cuota/payment model, not built into v1 |
| WhatsApp/SMS automated payment reminders | Common in Venezuela-market competitors (VecinosWeb, MeruSoft both lead with automated reminders); culturally very relevant given WhatsApp's dominance in Venezuela | Requires WhatsApp Business API integration (cost, approval process) or SMS gateway — real infra dependency and cost, not core to the "morosos tracking must be accurate" value prop | Defer to v1.x/v2; the resident-facing portal (self-checked saldo) partially substitutes for this in v1 by letting residents check their own status |
| CSV/report export | Nice-to-have in every competitor reviewed | Already explicitly deferred by the user in PROJECT.md as "optional... deferred past v1" — correctly excluded | Confirmed correct; add post-v1 if admin needs it for board meetings/external accountant |
| Audit log UI | Security/accountability feature present in enterprise HOA tools | Already explicitly deferred by the user — table exists in schema, no UI in v1 | Confirmed correct; the table can still be written to for future-proofing without needing a browsing UI now |

## Feature Dependencies

```
House management (CRUD)
    └──requires (upstream)──> nothing — foundational

Recurring/Special Cuota creation
    └──requires──> House management (cuotas apply to houses or "all houses")

Divisible special cuota (parent/child installments)
    └──requires──> Cuota creation (extends the base cuota model with self-reference)

Payment registration
    └──requires──> Cuota creation (payments are registered against existing pending cuotas)
    └──requires──> House management (payments belong to a house)

Morosos (delinquency) dashboard
    └──requires──> Cuota creation + Payment registration (delinquency = cuota exists, due date passed, no matching payment)

Saldo (balance) calculation
    └──requires──> Cuota creation + Payment registration (saldo = sum(paid) - sum(due), per currency)

Resident cuota calendar/grid
    └──requires──> Cuota creation + Payment registration (status color-coding needs both)

Monthly report
    └──requires──> Cuota creation + Payment registration + House management (aggregates all three per house per month)

Resident self-service portal (any resident-facing view)
    └──requires──> House + resident (PIN) auth flow (dual-auth architecture)
    └──requires──> Saldo calculation (for balance display)

Payment receipt/comprobante [gap, not in current spec]
    └──requires──> Payment registration (receipt is generated from an existing payment record)
    └──enhances──> Resident payment history (residents can download/view proof)

WhatsApp/SMS reminders [deferred, v2]
    └──requires──> Morosos dashboard (reminders are triggered by delinquency state)
    └──conflicts with──> "no email required for residents" simplicity goal if implemented via email instead of WhatsApp/SMS
```

### Dependency Notes

- **Payment registration requires Cuota creation:** the spec's flow (admin selects a house, sees pending cuotas, checks which ones a payment applies to) means cuotas must exist before any payment UI is meaningful. This confirms cuota management must ship in an earlier phase than payment registration.
- **Morosos dashboard and Saldo calculation both require Cuota creation + Payment registration:** these are derived/computed views, not independent features. They should not be built (or even deeply tested) until the underlying cuota generation and payment registration logic is solid — this matches PROJECT.md's stated core value ("accurate morosos and saldo tracking... must work before anything else"), which in practice means the *data model underneath* morosos/saldo must be correct first.
- **Divisible special cuota (parent/child) enhances but is not required by basic recurring cuotas:** a v1 could ship recurring + simple one-time cuotas without the divisible/staggered variant and still be useful, but the user's spec treats it as core, not optional — flagged in PROJECT.md as "core business logic, not incidental," which this research confirms is a reasonable but genuinely higher-complexity design choice worth calling out to whoever builds the roadmap (it's a good candidate for its own phase or sub-phase given the recursive generation logic).
- **Resident portal requires dual-auth (house+PIN) to exist first:** no resident-facing feature (calendar, saldo, payment history) can be meaningfully tested until the custom PIN-based auth and RLS policies are working — this is consistent with treating dual-auth as an early, foundational phase rather than a late add-on.
- **Payment receipt/comprobante enhances resident payment history:** it's not a blocker for v1 launch (residents can still see payment history without a formal receipt), but it's the one gap identified against domain norms — recommend it as an early v1.x addition rather than a hard v1 blocker.

## MVP Definition

### Launch With (v1) — matches user's already-active requirements

- [ ] Admin auth (email/password, Supabase Auth, email verification, password reset) — required for any admin action to be secure
- [ ] Resident auth (house dropdown + PIN, no email) — required for the resident-facing value prop
- [ ] RLS enforcing admin-sees-all / resident-sees-own-house — required before any real data is stored
- [ ] House CRUD — foundational data
- [ ] Recurring cuota creation (cadence, amount, currency, applicable houses) — core dues model
- [ ] Special/divisible cuota creation (parent/child installments) — core, per user's explicit prioritization
- [ ] Manual payment registration (multi-cuota select, currency match, date, notes) — core value delivery mechanism
- [ ] Admin dashboard: KPIs + morosos list — the stated "must work before anything else" feature
- [ ] Admin monthly report (expected/paid/balance/status per house) — table stakes reporting
- [ ] Resident cuotas calendar (color-coded status) — table stakes resident view
- [ ] Resident saldo + payment history — table stakes resident view
- [ ] Multi-currency tracking, no conversion (USD/Bs/USDT) — required given the community's real payment behavior
- [ ] Bilingual UI (ES default, EN available) — low-cost, already scoped

### Add After Validation (v1.x)

- [ ] Payment receipt/comprobante (printable/PDF view of a registered payment) — trigger: residents or admin ask "can I get proof of this payment," which is highly likely given domain norms found in this research
- [ ] CSV/Excel export of reports — trigger: admin needs to share data with an external accountant or present to the board (already flagged as deferred-but-likely by the user)
- [ ] Audit log UI — trigger: a dispute arises over who changed/registered what, and the raw table needs a browsable interface
- [ ] Basic due-date reminder (in-app banner or resident-portal highlight, not push/SMS) — trigger: residents report forgetting upcoming cuotas

### Future Consideration (v2+)

- [ ] WhatsApp/SMS automated payment reminders — defer until v1's manual/self-check flow proves insufficient; requires external API integration and cost the user hasn't committed to
- [ ] Automated late-fee/penalty rules — defer until the board decides it wants software-enforced penalties rather than social/manual enforcement
- [ ] Expense tracking / budget module (full accounting) — defer indefinitely unless the community's needs expand beyond dues collection into full financial management
- [ ] Multi-tenant support — defer indefinitely per PROJECT.md; only relevant if this app is ever offered to other communities
- [ ] Online/card/crypto payment processing — defer; would require picking a gateway that supports Bs and/or USDT, which is a nontrivial integration decision on its own

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Dual auth (admin email, resident house+PIN) + RLS | HIGH | HIGH | P1 |
| House CRUD | HIGH | LOW | P1 |
| Recurring cuota creation | HIGH | MEDIUM | P1 |
| Divisible/special cuota (parent/child) | HIGH | HIGH | P1 |
| Manual payment registration | HIGH | MEDIUM | P1 |
| Morosos dashboard | HIGH | MEDIUM | P1 |
| Saldo calculation + resident history | HIGH | MEDIUM | P1 |
| Resident cuota calendar (color-coded) | MEDIUM | MEDIUM | P1 |
| Monthly report | MEDIUM | MEDIUM | P1 |
| Multi-currency (no conversion) | HIGH | LOW | P1 |
| Bilingual UI | LOW-MEDIUM | LOW | P1 (low cost, already scoped) |
| Payment receipt/comprobante | MEDIUM-HIGH | LOW | P2 |
| CSV export | LOW-MEDIUM | LOW | P2 |
| Audit log UI | LOW | LOW-MEDIUM | P3 |
| Due-date reminders (in-app) | LOW-MEDIUM | LOW | P2 |
| WhatsApp/SMS reminders | MEDIUM | HIGH (external integration) | P3 |
| Automated late fees | LOW-MEDIUM | MEDIUM | P3 |
| Expense/budget/accounting module | LOW (out of stated scope) | HIGH | P3 (likely never, unless scope changes) |
| Online/card/crypto payment processing | LOW (contradicts manual-registration model) | HIGH | P3 |

**Priority key:**
- P1: Must have for launch (matches user's "Active" requirements in PROJECT.md)
- P2: Should have, add when possible (v1.x)
- P3: Nice to have, future consideration (v2+, several likely never needed for a single-tenant internal tool)

## Competitor Feature Analysis

| Feature | VecinosWeb / MeruSoft (Venezuela niche) | Buildium / AppFolio / Condo Control (US general HOA) | Our Approach |
|---------|------------------------------------------|--------------------------------------------------------|--------------|
| Dues/cuota management | Yes, automated billing | Yes, plus budgeting/GL | Match: cuota management, no GL |
| Payment registration | Automated + manual | Online gateway + manual | Manual only (deliberate, matches real payment behavior) |
| Morosos/delinquency tracking | Core feature, 2+ month flagging, auto-reminders | Delinquency tracking + automated late fees | Core feature (dashboard), no auto reminders/fees in v1 |
| Multi-currency | Yes, with live BCV rate conversion | No (USD-only assumption) | Yes, but no conversion — simpler and more honest for a volatile-currency market |
| Resident portal | Balance, history, receipts, bulletin board | Balance, history, receipts, maintenance requests, amenities | Balance, history, calendar view — no bulletin/maintenance/amenities |
| Auth model | Standard email/password assumed | Standard email/password assumed | No-email PIN login for residents — genuinely differentiated for this audience |
| Notifications | WhatsApp/Telegram bot integration | Email/SMS automated reminders | None in v1 (residents self-check); flagged as v2 candidate |
| Reports | PDF/Excel export, collection analysis | Full financial statements, GL reports | Monthly expected/paid/balance report only, no export in v1 |
| Full accounting (expenses/budget) | Partial (Odoo Condominio has this) | Yes, extensively | Explicitly out of scope |
| Maintenance/amenities/voting | No (Venezuela niche tools stay lean) | Yes, extensively | Explicitly out of scope |

## Sources

- [Top Rated HOA Software with Payment processing 2026 | GetApp](https://www.getapp.com/real-estate-property-software/hoa/f/payment-processing/)
- [Best HOA Management Software Review | 2026 Guide | Buildium](https://www.buildium.com/blog/best-hoa-management-software-platforms/)
- [HOA Management Software for Community Associations 2026 | ManageCasa](https://managecasa.com/hoa-management-software)
- [Best HOA Management Software: What to Look For in 2026 | CondoControl](https://www.condocontrol.com/blog/best-hoa-management-software/)
- [Best HOA Software 2026 | Capterra](https://www.capterra.com/hoa-software/)
- [Best Payment Software for Property Managers 2026 | ManageCasa](https://managecasa.com/articles/best-payment-software-for-property-management)
- [Software Administrativo Sistema Contable Condominios Venezuela | Odoo Condominio](https://odoocondominio.com/venezuela-software-administrativo-y-sistema-contable-para-condominios)
- [MeruSoft Condominio | Software de Gestión y Administración](https://merusoft.net/condominio)
- [VecinosWeb | Software de Administración de Condominios en Venezuela](https://vecinosweb.com/) — direct-fetched, MEDIUM confidence
- [HOA Board Management Tools 2026 | MemberSplash](https://www.membersplash.com/managing-your-hoa-just-got-easier-top-tools-for-boards/)
- [How to Choose Resident Portal Software in 2026 | ConciergePlus](https://blog.conciergeplus.com/how-to-choose-resident-portal-software-in-2026)
- [HOA Dues Collection Software: 2026 Buyer's Guide | TenantEvaluation](https://blog.tenantevaluation.ai/best-hoa-dues-collection-software/)
- Project context: `docs/handoff-prompt.md` and `.planning/PROJECT.md` (user-supplied spec, cross-checked against above)

---
*Feature research for: condo/HOA/closed-community payment-management software*
*Researched: 2026-09-04*
