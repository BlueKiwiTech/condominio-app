// Datos de partida para las pruebas del agente QA. SOLO contra el Supabase local.
// Se ejecuta desde qa/start.sh (node --env-file=.env.test.local qa/seed.mjs).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!url.startsWith('http://127.0.0.1') || !key) {
  console.error('ABORTO: el seed solo corre contra el Supabase local (127.0.0.1).');
  process.exit(1);
}
const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
const rest = async (method, path, body) => {
  const r = await fetch(`${url}/rest/v1${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path}: ${t}`);
  return t ? JSON.parse(t) : null;
};
// Día calendario de Venezuela (UTC-4): el servidor de pruebas corre en UTC.
const day = (offset = 0) => new Date(Date.now() - 4 * 3600000 + offset * 86400000).toISOString().slice(0, 10);

const community = (await rest('GET', '/condo_communities?select=id&limit=1'))[0].id;
const PIN = '1234';
const pinHash = (await rest('POST', '/rpc/condo_hash_pin', { p_pin: PIN })) ?? null;

const recurring = (await rest('POST', '/condo_installment_templates', { community_id: community, name: 'Mantenimiento mensual', installment_type: 'recurring', cadence: 'monthly', amount: 100, currency: 'USD', start_date: day(-30) }))[0].id;
const special = (await rest('POST', '/condo_installment_templates', { community_id: community, name: 'Cuota especial portón', installment_type: 'special', amount: 100, currency: 'USD', start_date: day(0) }))[0].id;

async function house(number, owner) {
  const h = (await rest('POST', '/condo_houses', { community_id: community, house_number: number, house_name: `Casa ${number}`, owner_name: owner, pin_hash: pinHash }))[0].id;
  const cuota = (tpl, name, due, amount, currency, num, extra = {}) =>
    rest('POST', '/condo_installments', { house_id: h, community_id: community, template_id: tpl, installment_number: num, name, amount, currency, due_date: day(due), status: 'pending', amount_paid: 0, ...extra }).then((r) => r[0].id);
  return { h, cuota };
}

// QA-01: una recurrente vencida y dos especiales (una a 10 días y otra a 45), todo en USD.
const q1 = await house('QA-01', 'Ana Prueba');
await q1.cuota(recurring, 'Mantenimiento QA-01', -10, 100, 'USD', 1);
await q1.cuota(special, 'Portón QA-01 (10 d)', 10, 100, 'USD', 1);
await q1.cuota(special, 'Portón QA-01 (45 d)', 45, 100, 'USD', 2);
// QA-02: cuota en Bs vencida.
const q2 = await house('QA-02', 'Beto Prueba');
await q2.cuota(recurring, 'Mantenimiento QA-02', -5, 50000, 'Bs', 1);
// QA-03: al día (todo pagado).
const q3 = await house('QA-03', 'Carla Prueba');
await q3.cuota(recurring, 'Mantenimiento QA-03', -20, 100, 'USD', 1, { status: 'paid', amount_paid: 100 });
// QA-04: saldo a favor de 30 USD y una cuota pendiente de 100 USD.
const q4 = await house('QA-04', 'Dario Prueba');
await q4.cuota(recurring, 'Mantenimiento QA-04', -2, 100, 'USD', 1);
await rest('POST', '/condo_house_credits', { house_id: q4.h, currency: 'USD', balance: 30 });
// QA-05: cuota pendiente y un reporte de pago de residente por revisar.
const q5 = await house('QA-05', 'Elena Prueba');
const q5c = await q5.cuota(recurring, 'Mantenimiento QA-05', -1, 100, 'USD', 1);
await rest('POST', '/condo_payment_reports', { house_id: q5.h, amount: 100, currency: 'USD', payment_date: day(0), installment_ids: [q5c], status: 'pending', reference: 'REF-QA-05', notes: 'Pago por transferencia' });
// QA-06: sin ninguna cuota (para depósitos a cartera).
await house('QA-06', 'Fabio Prueba');

// Tasa BCV vigente (24 h) y euro.
const noon = `${day(0)}T12:00:00Z`;
await rest('POST', '/condo_exchange_rates', { rate_type: 'bcv', rate: 40, source: 'admin', updated_at: noon });
await rest('POST', '/condo_exchange_rates', { rate_type: 'eur', rate: 45, source: 'admin', updated_at: noon });

// Gastos pendientes en cada moneda.
const cat = (await rest('POST', '/condo_expense_categories', { community_id: community, name: 'Operación' }))[0].id;
async function expense(name, currency, amount) {
  const t = (await rest('POST', '/condo_expense_templates', { community_id: community, name, category_id: cat, provider: 'Proveedor QA', kind: 'variable', currency, default_amount: amount, start_date: day(0), installment_count: 1 }))[0].id;
  await rest('POST', '/condo_expenses', { template_id: t, category_id: cat, provider: 'Proveedor QA', currency, amount, installment_number: 1, period_date: day(0) });
}
await expense('Vigilancia', 'USD', 110);
await expense('Jardinería', 'Bs', 8800);
await expense('Servicio en USDT', 'USDT', 25);

// Saldo inicial de la comunidad: solo USD (Bs y USDT quedan en cero a propósito, para probar el bloqueo).
const opening = await rest('POST', '/rpc/condo_add_community_movement', { p_community_id: community, p_type: 'opening', p_currency: 'USD', p_amount: 500, p_note: null, p_occurred_on: day(0) });
if (!opening?.ok) throw new Error(`no se pudo registrar el saldo inicial: ${JSON.stringify(opening)}`);

console.log('Seed listo: casas QA-01..QA-06 (PIN 1234), tasas BCV 40 y EUR 45, 3 gastos pendientes, saldo inicial 500 USD.');
