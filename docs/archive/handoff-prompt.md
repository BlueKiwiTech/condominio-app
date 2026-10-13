# Handoff Prompt for Claude Code - condominio-app

## PROJECT OVERVIEW

- Name: condominio-app
- Description: Payment management platform for closed communities (calles cerradas, condominios, HOAs)
- Stack: Next.js 14+ (TypeScript) + Supabase + Vercel
- Design System: Once UI (open-source, MIT)
- i18n: English keys + Spanish localization (next-i18n-router or i18next)

## AUTHENTICATION & AUTHORIZATION

Admin Users:
- Email + password (Supabase Auth)
- Email verification required
- Password reset flow
- Role: `admin`

Residents (Vecinos):
- Hardcoded in Supabase (house_residents table)
- Select house (dropdown) → PIN/password (4 digits or simple password)
- No email required
- Role: `resident`

Row Level Security (RLS):
- Admins: Full access to all data
- Residents: Only their own house data (payments, cuotas, saldo)

## DATABASE SCHEMA (Supabase PostgreSQL)

```sql
-- Houses
CREATE TABLE houses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES communities(id),
  house_number VARCHAR UNIQUE NOT NULL,
  house_name VARCHAR,
  owner_name VARCHAR,
  owner_phone VARCHAR,
  owner_email VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Residents (hardcoded users)
CREATE TABLE house_residents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id UUID REFERENCES houses(id) ON DELETE CASCADE,
  resident_name VARCHAR NOT NULL,
  resident_phone VARCHAR,
  pin_hash VARCHAR, -- hashed PIN or password
  created_at TIMESTAMP DEFAULT NOW()
);

-- Cuotas (regular + special)
CREATE TABLE cuotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES communities(id),
  name VARCHAR NOT NULL, -- "Mantenimiento", "Cuota Especial", etc.
  description TEXT,
  cuota_type VARCHAR CHECK (cuota_type IN ('recurring', 'unique', 'special')),
  cadence VARCHAR CHECK (cadence IN ('weekly', 'monthly', 'annual', NULL)), -- NULL for unique/special
  amount DECIMAL(12, 2) NOT NULL,
  currency VARCHAR CHECK (currency IN ('USD', 'Bs', 'USDT')) NOT NULL,
  start_date DATE,
  number_of_installments INT, -- for recurring/special splits
  is_divided BOOLEAN DEFAULT FALSE, -- if special cuota is split
  parent_cuota_id UUID REFERENCES cuotas(id), -- for split cuotas
  applicable_houses UUID[] DEFAULT '{}', -- array of house IDs (empty = all)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Payments
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id UUID REFERENCES houses(id),
  cuota_id UUID REFERENCES cuotas(id),
  amount_paid DECIMAL(12, 2) NOT NULL,
  currency VARCHAR CHECK (currency IN ('USD', 'Bs', 'USDT')) NOT NULL,
  payment_date DATE NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id), -- admin who registered
  created_at TIMESTAMP DEFAULT NOW()
);

-- Community (settings)
CREATE TABLE communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL, -- "Calle Cerrada Los Pinos"
  address VARCHAR,
  phone VARCHAR,
  admin_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Audit Log (optional)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action VARCHAR, -- "created_cuota", "payment_registered", etc.
  entity_type VARCHAR, -- "cuota", "payment", "house"
  entity_id UUID,
  timestamp TIMESTAMP DEFAULT NOW()
);
```

## FOLDER STRUCTURE

```
condominio-app/
├── app/
│   ├── layout.tsx                    # Root layout
│   ├── globals.css                   # Global + Once UI tokens
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx              # Admin + Resident login
│   │   └── forgot-password/
│   │       └── page.tsx
│   ├── (admin)/
│   │   ├── layout.tsx                # Admin layout + sidebar
│   │   ├── dashboard/
│   │   │   └── page.tsx              # Dashboard (KPIs, morosos)
│   │   ├── houses/
│   │   │   ├── page.tsx              # House list
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx          # House details
│   │   │   └── new/
│   │   │       └── page.tsx          # Create/edit house modal
│   │   ├── cuotas/
│   │   │   ├── page.tsx              # Cuotas list
│   │   │   ├── new/
│   │   │   │   └── page.tsx          # Create cuota
│   │   │   └── [id]/
│   │   │       └── page.tsx          # Edit cuota
│   │   ├── payments/
│   │   │   ├── page.tsx              # Register payment
│   │   │   └── history/
│   │   │       └── page.tsx          # Payment history
│   │   ├── reports/
│   │   │   ├── monthly/
│   │   │   │   └── page.tsx          # Monthly report
│   │   │   └── morosos/
│   │   │       └── page.tsx          # Morosos dashboard
│   │   └── settings/
│   │       └── page.tsx              # Admin settings
│   ├── (resident)/
│   │   ├── layout.tsx                # Resident layout
│   │   ├── dashboard/
│   │   │   └── page.tsx              # My house + saldo
│   │   ├── cuotas/
│   │   │   └── page.tsx              # My cuotas (calendar)
│   │   ├── payments/
│   │   │   └── page.tsx              # Payment history
│   │   └── profile/
│   │       └── page.tsx              # My profile
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/
│   │   │   │   └── route.ts
│   │   │   └── logout/
│   │   │       └── route.ts
│   │   ├── cuotas/
│   │   │   ├── route.ts              # GET, POST
│   │   │   └── [id]/
│   │   │       └── route.ts          # GET, PATCH, DELETE
│   │   ├── payments/
│   │   │   ├── route.ts              # POST register payment
│   │   │   └── history/
│   │   │       └── route.ts
│   │   ├── houses/
│   │   │   ├── route.ts
│   │   │   └── [id]/
│   │   │       └── route.ts
│   │   └── reports/
│   │       ├── monthly/
│   │       │   └── route.ts
│   │       └── morosos/
│   │           └── route.ts
│   └── middleware.ts                 # Auth + i18n routing
├── components/
│   ├── ui/                           # Once UI wrapped/custom
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── Table.tsx
│   │   ├── Modal.tsx
│   │   ├── Select.tsx
│   │   └── Badge.tsx
│   ├── layout/
│   │   ├── AdminSidebar.tsx
│   │   ├── AdminHeader.tsx
│   │   └── ResidentLayout.tsx
│   ├── admin/
│   │   ├── DashboardKPIs.tsx
│   │   ├── MorososTable.tsx
│   │   ├── CuotaForm.tsx
│   │   ├── PaymentForm.tsx
│   │   └── ReportTable.tsx
│   └── resident/
│       ├── MyHouseCard.tsx
│       ├── CuotasCalendar.tsx
│       └── PaymentHistory.tsx
├── lib/
│   ├── supabase.ts                   # Supabase client
│   ├── auth.ts                       # Auth helpers
│   ├── types.ts                      # TypeScript types
│   ├── utils.ts                      # Utilities
│   ├── i18n.ts                       # i18n setup
│   └── constants.ts                  # Currency, roles, etc.
├── public/
│   ├── locales/
│   │   ├── en.json
│   │   └── es.json
│   └── icons/
│       ├── house.svg
│       ├── payment.svg
│       ├── calendar.svg
│       └── user.svg
├── styles/
│   └── once-ui-overrides.css         # Custom Once UI tokens
├── hooks/
│   ├── useAuth.ts
│   ├── useCuotas.ts
│   ├── usePayments.ts
│   └── useReports.ts
├── .env.local                        # Environment variables
├── .env.example
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts                # Once UI uses Tailwind
├── package.json
└── README.md
```

## ENVIRONMENT VARIABLES (.env.local)

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key (server-only)

# Vercel
VERCEL_ENV=production

# i18n
NEXT_PUBLIC_DEFAULT_LOCALE=es
```

## DEPENDENCIES (package.json)

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@once-ui/core": "latest",
    "@supabase/supabase-js": "^2.38.0",
    "next-i18n-router": "^5.0.0",
    "i18next": "^23.0.0",
    "react-i18next": "^13.0.0",
    "recharts": "^2.10.0",
    "lucide-react": "latest",
    "clsx": "^2.0.0",
    "date-fns": "^2.30.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "tailwindcss": "^3.3.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  }
}
```

## KEY FEATURES & FLOWS

### 1. Admin: Create Recurring Cuota
- Form: type (recurring) → cadence (monthly/weekly/annual) → monto → currency → start date → # installments
- Apply to: all houses or select specific
- Save → creates N cuota records (one per installment)
- Validate: installments > 0, monto > 0

### 2. Admin: Create Special Cuota (divisible)
- Form: name → monto → currency → checkbox "Divide into smaller cuotas?" → if yes, input # smaller cuotas
- If divided: create parent + child cuota records
- Children inherit: monto (divided), currency, start date (staggered by cadence)

### 3. Admin: Register Payment
- Select house → show pending cuotas (table)
- Checkbox to select which cuotas paying for
- Monto pre-fill (sum of selected)
- Currency must match cuota (show in table)
- Payment date (default today, change if needed)
- Notes (optional)
- POST /api/payments → create payment record + update cuota status

### 4. Resident: View Cuotas Calendar
- Grid/calendar showing cuotas by month
- Color code: Pending (gray), Paid (green), Overdue (red), Advance (blue)
- Click cuota → modal with details

### 5. Resident: Check Saldo
- Calculate: sum(paid) - sum(due) for this house
- If positive: "Saldo a favor: $XXX"
- If negative: "Deuda: $XXX desde [oldest cuota date]"

### 6. Admin: Monthly Report
- Dropdown: select month/year
- Table: House # | Owner | Expected | Paid | Balance | Status
- Sort/filter
- Export to CSV (optional)

### 7. Admin: Morosos Dashboard
- Auto-query: cuotas with payment_date < today and no payment
- Table: House # | Owner | Owed | Since | Days Overdue | Currency
- Action button: quick payment register

## BUSINESS LOGIC

### Saldo Calculation
```
saldo = SUM(payments.amount_paid) - SUM(cuotas.amount)
For each house, filtered by currency
```

### Morosos Detection
```
WHERE cuota.start_date <= today
AND NOT EXISTS (payment for this cuota)
```

### Currency Handling
- No conversion
- Display with symbol: $, Bs., USDT
- Store as VARCHAR in DB
- UI shows currency in every transaction

### Date Handling
- Use date-fns for formatting (locale: es/en)
- Cuota start_date = first payment due date
- Cadence = recurrence interval

## SECURITY & BEST PRACTICES
- Supabase RLS enabled
- API routes use `getServerSession()` for auth
- Sensitive data (PIN) hashed with bcrypt
- Admin-only routes protected by middleware
- CORS headers configured
- Environment variables never exposed to client
- Audit logs for all sensitive actions

## DEPLOYMENT

Vercel:
1. Connect GitHub repo
2. Set environment variables in Vercel dashboard
3. Deploy on push to `main`
4. Auto-preview on PRs

Supabase:
1. Create Supabase project
2. Run SQL migrations
3. Enable RLS policies
4. Generate JWT secrets

## FIRST STEPS

1. Clone template or create new Next.js 14 app
2. Install dependencies
3. Setup Supabase project + run migrations
4. Create `.env.local` with credentials
5. Setup i18n (translations in `/public/locales`)
6. Create auth middleware
7. Build pages in order:
   - Login (admin + resident)
   - Admin dashboard
   - Cuota management
   - Payment registration
   - Resident dashboard
8. Test auth flows
9. Deploy to Vercel

## References
- Design System Docs: https://docs.once-ui.com
- Supabase Docs: https://supabase.com/docs
