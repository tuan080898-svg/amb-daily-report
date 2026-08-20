import { NextResponse, NextRequest } from 'next/server';

const LARK_APP_ID = process.env.LARK_APP_ID || '';
const LARK_APP_SECRET = process.env.LARK_APP_SECRET || '';
const REFUND_BASE_TOKEN = process.env.LARK_REFUND_BASE_TOKEN || '';

let cachedToken = { token: '', expiresAt: 0 };

async function getTenantToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken.token && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }
  cachedToken = { token: '', expiresAt: 0 };
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
  tableId: string;
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

function processRecord(recordId: string, tableId: string, fields: Record<string, unknown>): RefundRecord | null {
  const dateMs = fields['Ngày'] as number | undefined;
  const date = dateMs ? new Date(dateMs).toISOString().split('T')[0] : '';
  const customerName = (fields['Tên khách hàng'] as string) || '';
  if (!customerName && !dateMs) return null;

  return {
    recordId,
    tableId,
    customerName,
    orderCode: (fields['Mã đơn hàng'] as string) || '',
    phone: (fields['Số điện thoại'] as string) || '',
    product: (fields['Sản phẩm'] as string) || '',
    shop: (fields['Shop'] as string) || '',
    platform: (fields['Sàn'] as string) || '',
    refundAmount: (parseFloat(String(fields['Số tiền hoàn'] || '0')) || 0) * 1000,
    refundReason: (fields['Lý do hoàn'] as string) || '',
    status: (fields['Trạng thái'] as string) || '',
    handler: (fields['Người hoàn tiền'] as string) || '',
    date,
  };
}

function toLarkFields(data: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const setIfNotEmpty = (key: string, val: unknown) => {
    if (val !== undefined && val !== null && val !== '') fields[key] = val;
  };
  setIfNotEmpty('Tên khách hàng', data.customerName);
  setIfNotEmpty('Mã đơn hàng', data.orderCode);
  setIfNotEmpty('Số điện thoại', data.phone);
  setIfNotEmpty('Sản phẩm', data.product);
  setIfNotEmpty('Shop', data.shop);
  setIfNotEmpty('Sàn', data.platform);
  if (data.refundAmount !== undefined && data.refundAmount !== '' && Number(data.refundAmount) !== 0) {
    fields['Số tiền hoàn'] = Math.round(Number(data.refundAmount) / 1000);
  }
  setIfNotEmpty('Lý do hoàn', data.refundReason);
  setIfNotEmpty('Trạng thái', data.status);
  setIfNotEmpty('Người hoàn tiền', data.handler);
  if (data.date && String(data.date).length >= 10) {
    fields['Ngày'] = new Date(String(data.date)).getTime();
  }
  if (data.imageTokens !== undefined) {
    const tokens = data.imageTokens as string[];
    if (tokens.length > 0) fields['Ảnh bill'] = tokens.map(t => ({ file_token: t }));
  }
  return fields;
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
      const rec = processRecord(item.record_id, tableId, item.fields);
      if (rec) records.push(rec);
    }

    pageToken = json.data.has_more ? json.data.page_token : undefined;
  } while (pageToken);

  return records;
}

async function listTables(token: string): Promise<{ table_id: string; name: string }[]> {
  const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${REFUND_BASE_TOKEN}/tables`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json();
  if (json.code !== 0) throw new Error('Lark list tables error: ' + json.msg);
  return json.data.items || [];
}

export async function GET() {
  try {
    if (!LARK_APP_ID || !LARK_APP_SECRET || !REFUND_BASE_TOKEN) {
      return NextResponse.json({ error: 'Lark refund credentials not configured' }, { status: 500 });
    }
    const token = await getTenantToken();
    const tables = await listTables(token);
    const tableIds = tables.map(t => t.table_id);
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

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { recordId, tableId, ...data } = body;
    if (!recordId || !tableId) {
      return NextResponse.json({ error: 'recordId and tableId required' }, { status: 400 });
    }

    const token = await getTenantToken();
    const fields = toLarkFields(data);

    const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${REFUND_BASE_TOKEN}/tables/${tableId}/records/${recordId}`;
    let res = await fetch(url, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    let json = await res.json();

    if (res.status === 403 || json.code === 403) {
      const freshToken = await getTenantToken(true);
      res = await fetch(url, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${freshToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });
      json = await res.json();
    }

    if (json.code !== 0) throw new Error('Lark update error (code ' + json.code + '): ' + (json.msg || JSON.stringify(json)));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tableId, ...data } = body;

    const token = await getTenantToken();

    let targetTableId = tableId;
    if (!targetTableId) {
      const tables = await listTables(token);
      const dataTong = tables.find(t => t.name === 'Data tổng');
      targetTableId = dataTong ? dataTong.table_id : tables[0]?.table_id;
    }

    if (!targetTableId) {
      return NextResponse.json({ error: 'No target table found' }, { status: 400 });
    }

    const fields = toLarkFields(data);
    console.log('POST lark-refund payload:', JSON.stringify({ fields, targetTableId }));

    const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${REFUND_BASE_TOKEN}/tables/${targetTableId}/records`;
    let res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    let json = await res.json();

    if (res.status === 403 || json.code === 403) {
      const freshToken = await getTenantToken(true);
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${freshToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });
      json = await res.json();
    }

    if (json.code !== 0) {
      console.error('Lark create response:', JSON.stringify(json));
      throw new Error('Lark create error (code ' + json.code + '): ' + (json.msg || JSON.stringify(json)));
    }

    return NextResponse.json({ success: true, recordId: json.data?.record?.record_id });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('POST /api/lark-refund error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
