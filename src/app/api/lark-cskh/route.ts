import { NextResponse, NextRequest } from 'next/server';

const LARK_APP_ID = process.env.LARK_APP_ID || '';
const LARK_APP_SECRET = process.env.LARK_APP_SECRET || '';
const LARK_BASE_TOKEN = process.env.LARK_BASE_APP_TOKEN || '';
const LARK_TABLE_ID = process.env.LARK_TABLE_ID || '';
const LARK_VIEW_ID = process.env.LARK_VIEW_ID || '';

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

export interface LarkCskhRecord {
  recordId: string;
  customerName: string;
  orderCode: string;
  phone: string;
  product: string;
  productType: string;
  initialStars: number;
  fixedStars: number;
  reason: string;
  badReviewReason: string;
  date: string;
  month: number;
  customerStatus: string;
  shop: string;
  shopManager: string;
  handler: string;
  processingResult: string;
  note: string;
  refundAmount: number;
  quantity: number;
}

function processRecord(recordId: string, fields: Record<string, unknown>): LarkCskhRecord {
  const dateMs = fields['Ngày xử lý'] as number | undefined;
  const date = dateMs ? new Date(dateMs).toISOString().split('T')[0] : '';

  let shopManager = '';
  const managerField = fields['Người phụ trách shop'] as { users?: { name: string }[] } | undefined;
  if (managerField?.users?.length) {
    shopManager = managerField.users.map(function(u) { return u.name; }).join(', ');
  }

  const handler = fields['Người xử lý'] as string | string[] | undefined;
  const handlerStr = Array.isArray(handler) ? handler.join(', ') : (handler || '');

  const result = fields['Kết quả xử lý'] as string | string[] | undefined;
  const resultStr = Array.isArray(result) ? result.join(', ') : (result || '');

  const productType = fields['Loại sản phẩm'] as string[] | undefined;
  const badReason = fields['Lý do đánh giá xấu'] as string[] | undefined;

  return {
    recordId,
    customerName: (fields['Tên khách hàng'] as string) || '',
    orderCode: (fields['Mã đơn hàng'] as string) || '',
    phone: (fields['Số điện thoại'] as string) || '',
    product: (fields['Sản phẩm'] as string) || '',
    productType: Array.isArray(productType) ? productType.join(', ') : '',
    initialStars: parseInt(String(fields['Số sao ban đầu'] || '0')) || 0,
    fixedStars: parseInt(String(fields['Số sao đã sửa'] || '0')) || 0,
    reason: (fields['Lý do'] as string) || '',
    badReviewReason: Array.isArray(badReason) ? badReason.join(', ') : '',
    date,
    month: (fields['Tháng (của ngày xử lý)'] as number) || 0,
    customerStatus: (fields['Trạng thái khách'] as string) || '',
    shop: (fields['SHOP'] as string) || '',
    shopManager,
    handler: handlerStr,
    processingResult: resultStr,
    note: (fields['ghi chú'] as string) || '',
    refundAmount: parseFloat(String(fields['Số tiền hoàn'] || '0')) || 0,
    quantity: parseInt(String(fields['Số lượng'] || '0')) || 0,
  };
}

function toLarkFields(data: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (data.customerName !== undefined) fields['Tên khách hàng'] = data.customerName;
  if (data.orderCode !== undefined) fields['Mã đơn hàng'] = data.orderCode;
  if (data.phone !== undefined) fields['Số điện thoại'] = data.phone;
  if (data.product !== undefined) fields['Sản phẩm'] = data.product;
  if (data.initialStars !== undefined) fields['Số sao ban đầu'] = String(data.initialStars);
  if (data.fixedStars !== undefined) fields['Số sao đã sửa'] = String(data.fixedStars);
  if (data.shop !== undefined) fields['SHOP'] = data.shop;
  if (data.handler !== undefined) fields['Người xử lý'] = data.handler;
  if (data.processingResult !== undefined) fields['Kết quả xử lý'] = data.processingResult;
  if (data.customerStatus !== undefined) fields['Trạng thái khách'] = data.customerStatus;
  if (data.note !== undefined) fields['ghi chú'] = data.note;
  if (data.refundAmount !== undefined) fields['Số tiền hoàn'] = String(data.refundAmount);
  if (data.quantity !== undefined) fields['Số lượng'] = String(data.quantity);
  if (data.date !== undefined) fields['Ngày xử lý'] = new Date(data.date as string).getTime();
  return fields;
}

async function fetchAllRecords(token: string): Promise<LarkCskhRecord[]> {
  const records: LarkCskhRecord[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ page_size: '500' });
    if (LARK_VIEW_ID) params.set('view_id', LARK_VIEW_ID);
    if (pageToken) params.set('page_token', pageToken);

    const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${LARK_BASE_TOKEN}/tables/${LARK_TABLE_ID}/records?${params}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (json.code !== 0) throw new Error('Lark fetch error: ' + json.msg);

    for (const item of (json.data.items || [])) {
      records.push(processRecord(item.record_id, item.fields));
    }

    pageToken = json.data.has_more ? json.data.page_token : undefined;
  } while (pageToken);

  return records;
}

export async function GET() {
  try {
    if (!LARK_APP_ID || !LARK_APP_SECRET) {
      return NextResponse.json({ error: 'Lark credentials not configured' }, { status: 500 });
    }
    const token = await getTenantToken();
    const records = await fetchAllRecords(token);
    return NextResponse.json({ records, total: records.length });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { recordId, ...data } = body;
    if (!recordId) {
      return NextResponse.json({ error: 'recordId required' }, { status: 400 });
    }

    const token = await getTenantToken();
    const fields = toLarkFields(data);

    const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${LARK_BASE_TOKEN}/tables/${LARK_TABLE_ID}/records/${recordId}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    const json = await res.json();
    if (json.code !== 0) throw new Error('Lark update error: ' + json.msg);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = await getTenantToken();
    const fields = toLarkFields(body);

    const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${LARK_BASE_TOKEN}/tables/${LARK_TABLE_ID}/records`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    const json = await res.json();
    if (json.code !== 0) throw new Error('Lark create error: ' + json.msg);

    return NextResponse.json({ success: true, recordId: json.data?.record?.record_id });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
