import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { createServiceClient } from '@/lib/supabase/service';
import { ResidentLoginForm } from '@/components/residentAuth/ResidentLoginForm';

// Unauthenticated screen (V1) — the house picker needs house_number/house_name
// (+ owner_name, "for confirmation" per the mockup) for every house, which is
// not sensitive data on its own but IS beyond what RLS grants an anonymous
// caller (deny-by-default). Fetched here via the service-role client,
// server-side only — never exposed as an API route.
export default async function ResidentLoginPage() {
  const t = await getTranslations('residentAuth');
  const service = createServiceClient();
  const { data: houses } = await service
    .from('condo_houses')
    .select('house_number, house_name, owner_name')
    .order('house_number');

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="items-center gap-4 text-center">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
          AB
        </div>
        <h1 className="text-2xl font-bold">{t('heading')}</h1>
      </CardHeader>
      <CardContent>
        <ResidentLoginForm houses={houses ?? []} />
      </CardContent>
    </Card>
  );
}
