import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { fetchCommunityBalance, fetchMovementsPage } from '@/lib/reporting/communityBalanceQuery';
import { CommunityBalancePageClient } from '@/components/saldo/CommunityBalancePageClient';

export default async function SaldoComunidadPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const t = await getTranslations('communityBalance');
  const supabase = await createClient();
  const { page: pageParam } = await searchParams;
  const page = Number.parseInt(pageParam ?? '1', 10);

  let data: {
    balance: Awaited<ReturnType<typeof fetchCommunityBalance>>;
    ledger: Awaited<ReturnType<typeof fetchMovementsPage>>;
  } | null = null;
  try {
    const [balance, ledger] = await Promise.all([fetchCommunityBalance(supabase), fetchMovementsPage(supabase, page)]);
    data = { balance, ledger };
  } catch (err) {
    console.error('[saldo-comunidad] could not load the page:', err);
  }

  return (
    <div className="flex w-full flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t('heading')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      {data ? (
        <CommunityBalancePageClient
          balance={data.balance}
          movements={data.ledger.movements}
          total={data.ledger.total}
          pageSize={data.ledger.pageSize}
          page={data.ledger.page}
        />
      ) : (
        <p className="text-sm text-destructive">{t('loadError')}</p>
      )}
    </div>
  );
}
