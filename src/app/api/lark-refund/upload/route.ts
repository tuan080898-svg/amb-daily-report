import { NextResponse, NextRequest } from 'next/server';

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

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const token = await getTenantToken();
    const buffer = Buffer.from(await file.arrayBuffer());

    const larkForm = new FormData();
    larkForm.append('file_name', file.name || 'bill.png');
    larkForm.append('parent_type', 'bitable_file');
    larkForm.append('parent_node', REFUND_BASE_TOKEN);
    larkForm.append('size', String(buffer.length));
    larkForm.append('file', new Blob([buffer], { type: file.type }), file.name || 'bill.png');

    const res = await fetch('https://open.larksuite.com/open-apis/drive/v1/medias/upload_all', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: larkForm,
    });
    const json = await res.json();
    if (json.code !== 0) throw new Error('Lark upload error: ' + json.msg);

    return NextResponse.json({ file_token: json.data?.file_token });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
