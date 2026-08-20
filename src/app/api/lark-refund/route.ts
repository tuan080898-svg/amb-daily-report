import { NextResponse } from 'next/server';

const LARK_APP_ID = process.env.LARK_APP_ID || '';
const LARK_APP_SECRET = process.env.LARK_APP_SECRET || '';
const REFUND_BASE_TOKEN = process.env.LARK_REFUND_BASE_TOKEN || '';

let cachedToken = { token: '', expiresAt: 0 };

async function getTenantToken(): Promise<string> {
  if (cachedToken.token && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }
  const res = await fetch('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: LARK_APP_ID, app_secret: LARK_APP_SECRET }),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error('Lark token error: ' + json.msg);
  cachedToken = { token: json.tenant_access_token, expiresAt: Date.now() + (json.expire - 60) * 1000 };
  return cachedToken.token;
}

export interface RefundRecord {
  recordId: string;
  customerName: string;
  orderCode: string;
  phone: string;
  product: string;
  shop: string;
  platform: string;
  refundAmount: number;
  refundReason: string;
  status: string;
  handler: string;
  date: string;
}

function processRecord(recordId: string, fields: Record<string, unknown>): RefundRecord | null {
  const dateMs = fields['Ngày'] as number | undefined;
  const date = dateMs ? new Date(dateMs).toISOString().split('T')[0] : '';
  const customerName = (fields['Tên khách hàng'] as string) || '';
  if (!customerName && !dateMs) return null;

  return {
    recordId,
    customerName,
    orderCode: (fields['Mã đơn hàng'] as string) || '',
    phone: (fields['Số điện thoại'] as string) || '',
    product: (fields['Sản phẩm'] as string) || '',
    shop: (fields['Shop'] as string) || '',
    platform: (fields['Sàn'] as string) || '',
    refundAmount: parseFloat(String(fields['Số tiền hoàn'] || '0')) || 0,
    refundReason: (fields['Lý do hoàn'] as string) || '',
    status: (fields['Trạng thái'] as string) || '',
    handler: (fields['Người hoàn tiền'] as string) || '',
    date,
  };
}

async function fetchTableRecords(token: string, tableId: string): Promise<RefundRecord[]> {
  const records: RefundRecord[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ page_size: '500' });
    if (pageToken) params.set('page_token', pageToken);

    const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${REFUND_BASE_TOKEN}/tables/${tableId}/records?${params}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (json.code !== 0) break;

    for (const item of (json.data.items || [])) {
      const rec = processRecord(item.record_id, item.fields);
      if (rec) records.push(rec);
    }

    pageToken = json.data.has_more ? json.data.page_token : undefined;
  } while (pageToken);

  return records;
}

async function listMonthlyTables(token: string): Promise<string[]> {
  const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${REFUND_BASE_TOKEN}/tables`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json();
  if (json.code !== 0) throw new Error('Lark list tables error: ' + json.msg);

  return (json.data.items || [])
    .filter((t: { name: string }) => t.name.startsWith('Tháng'))
    .map((t: { table_id: string }) => t.table_id);
}

export async function GET() {
  try {
    if (!LARK_APP_ID || !LARK_APP_SECRET || !REFUND_BASE_TOKEN) {
      return NextResponse.json({ error: 'Lark refund credentials not configured' }, { status: 500 });
    }
    const token = await getTenantToken();
    const tableIds = await listMonthlyTables(token);
    const allRecords: RefundRecord[] = [];

    for (const tableId of tableIds) {
      const recs = await fetchTableRecords(token, tableId);
      allRecords.push(...recs);
    }

    allRecords.sort(function(a, b) { return b.date.localeCompare(a.date); });

    return NextResponse.json({ records: allRecords, total: allRecords.length });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
