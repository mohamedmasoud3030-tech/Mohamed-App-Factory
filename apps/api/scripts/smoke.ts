export {};
/**
 * Live smoke run against a RUNNING server (real network, real cookies):
 * cashier logs in → sees catalog → sells → sale is read back as a receipt.
 *   API_URL=http://localhost:3000 npm run api:smoke
 */
const API = process.env.API_URL ?? 'http://localhost:3000';
let cookie = '';

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(API + path, {
    method,
    headers: { origin: API, ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.getSetCookie();
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const egp = (minor: number) => (minor / 100).toFixed(2);
const step = (n: number, label: string, ok: boolean, extra = '') => console.log(`${ok ? '✅' : '❌'} ${n}. ${label}${extra ? ' — ' + extra : ''}`);

const login = await call('POST', '/api/auth/sign-in/email', { email: 'cashier@nile.demo', password: 'demo1234' });
step(1, 'تسجيل دخول الكاشير (cashier@nile.demo / demo1234)', login.status === 200, `HTTP ${login.status}`);

const me = await call('GET', '/api/v1/me');
step(2, 'السيرفر حدّد الشركة والدور بنفسه', me.status === 200, `${me.body?.tenant?.name} / ${me.body?.role}`);

const cat = await call('GET', '/api/v1/catalog/items');
const variants = (cat.body?.items ?? []).flatMap((i: any) => i.variants.map((v: any) => ({ ...v, item: i })));
step(3, 'عرض الأصناف', cat.status === 200, `${cat.body?.items?.length} أصناف`);
const pick = (sku: string) => variants.find((v: any) => v.sku === sku);

const sale = await call('POST', '/api/v1/sales', {
  idempotencyKey: `smoke-${Date.now()}`,
  lines: [
    { variantId: pick('WTR-600').id, quantity: '2' },
    { variantId: pick('COF-250').id, quantity: '1' },
    { variantId: pick('CHS-ROUMY').id, quantity: '0.250' },
  ],
});
step(4, 'تنفيذ عملية بيع', sale.status === 201, `HTTP ${sale.status}`);

const back = await call('GET', `/api/v1/sales/${sale.body?.sale?.id}`);
step(5, 'قراءة الفاتورة من قاعدة البيانات', back.status === 200);

const s = back.body.sale;
console.log('\n──────────── فاتورة / RECEIPT ────────────');
console.log(`رقم: ${s.id.slice(0, 8).toUpperCase()}   ${new Date(s.createdAt).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}`);
for (const l of s.lines) console.log(`${l.nameAr.padEnd(22)} ${l.quantity.padStart(8)} × ${egp(l.unitPriceMinor).padStart(7)} = ${egp(l.lineTotalMinor).padStart(8)}`);
console.log('──────────────────────────────────────────');
console.log(`الإجمالي: ${egp(s.totalMinor)} ج.م`);
