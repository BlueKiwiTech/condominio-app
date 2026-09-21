import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getResidentSession } from '@/lib/auth/residentSession';
import { createServiceClient } from '@/lib/supabase/service';
import { ResidentSidebar } from '@/components/resident/ResidentSidebar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';

// Shared shell for every /mi-hogar, /mis-pagos, /mi-cartera screen.
// proxy.ts already gates all of these via RESIDENT_PROTECTED_PATHS + the
// signed jose cookie (Pattern A) — this redirect is defense in depth.
export default async function ResidentLayout({ children }: { children: React.ReactNode }) {
  const session = await getResidentSession();
  if (!session) redirect('/resident-login');

  // Pattern A: no Supabase Auth session for residents, so this is the same
  // service-role client + house_id-scoped read every other resident query
  // uses (lib/resident/queries.ts) — just the two columns needed for the
  // sidebar's account footer label.
  const service = createServiceClient();
  const { data: house } = await service
    .from('condo_houses')
    .select('house_number, house_name')
    .eq('id', session.house_id)
    .maybeSingle();
  const houseLabel = house ? (house.house_name ? `${house.house_number} · ${house.house_name}` : house.house_number) : null;

  return (
    <SidebarProvider>
      <ResidentSidebar houseLabel={houseLabel} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 md:hidden">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <Image src="/logo-abc-mark.png" alt="ABC" width={28} height={29} className="w-[28px] h-[29px]" />
        </header>
        <div className="flex flex-1 flex-col p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
