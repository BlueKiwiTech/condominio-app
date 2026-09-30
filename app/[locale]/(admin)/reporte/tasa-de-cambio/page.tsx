import { getExchangeRateHistory } from '@/lib/actions/exchangeRate';
import { ExchangeRateReportClient } from '@/components/reports/ExchangeRateReportClient';

// "Tasa de Cambio" report (RPRT — 2026-09-29 addition, last item of the
// Reportes nav group): month picker + combined BCV/Binance chart + raw-rows
// table, same "fetch a wide window once, filter client-side" split as
// ReportePage.
export default async function ExchangeRateReportPage() {
  const rates = await getExchangeRateHistory(12);

  return <ExchangeRateReportClient rates={rates} />;
}
