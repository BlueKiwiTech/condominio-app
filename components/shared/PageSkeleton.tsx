import { Skeleton } from '@/components/ui/skeleton';

// Shared loading-skeleton patterns, dropped into each admin/resident
// route's `loading.tsx` — Next.js's App Router renders this automatically
// while the sibling `page.tsx` (an async Server Component awaiting
// Supabase queries) is still resolving.

// Generic list/table screens: Houses, Cuotas, Pagos, Reporte.
export function ListPageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex w-full flex-col gap-6 px-4 py-8 md:px-8">
      <Skeleton className="h-8 w-48" />
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-11 flex-1 basis-[220px]" />
        <Skeleton className="h-11 flex-none basis-[140px]" />
      </div>
      <div className="flex w-full flex-col gap-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    </div>
  );
}

// A2 · Dashboard: heading + KPI card row + chart + list.
export function DashboardSkeleton() {
  return (
    <div className="flex w-full flex-col gap-6 px-4 py-8 md:px-8">
      <Skeleton className="h-8 w-48" />
      <div className="flex w-full flex-wrap gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 flex-1 basis-[220px]" />
        ))}
      </div>
      <Skeleton className="h-56 w-full" />
      <div className="flex w-full flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    </div>
  );
}

// Resident (mobile) screens: greeting/card stack, no table.
export function ResidentPageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="flex w-full flex-col gap-4 px-5 py-6">
      <Skeleton className="h-6 w-32" />
      {Array.from({ length: cards }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}
