// Ứng dụng Lark (bot) của Integrity: gửi thẻ riêng, tra mã người dùng, kiểm tra yêu cầu Lark gửi tới. Chỉ chạy trên máy chủ.
// Biến môi trường trên Vercel: LARK_APP_ID, LARK_APP_SECRET (đã có), LARK_VERIFY_TOKEN, tùy chọn LARK_ENCRYPT_KEY.
import crypto from 'crypto';

const API = 'https://open.larksuite.com/open-apis';
let cached: { token: string; until: number } | null = null;

export function igAppConfigured(): boolean {
  return !!process.env.LARK_APP_ID && !!process.env.LARK_APP_SECRET;
}

// Đủ để gửi thẻ và nhận nút bấm. Chưa đặt LARK_VERIFY_TOKEN thì không gửi thẻ (nút bấm sẽ không chạy).
export function igAppReady(): boolean {
  return igAppConfigured() && !!process.env.LARK_VERIFY_TOKEN;
}

async function tenantToken(): Promise<string> {
  if (cached && cached.until > Date.now()) return cached.token;
  const res = await fetch(API + '/auth/v3/tenant_access_token/internal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
    body: JSON.stringify({ app_id: process.env.LARK_APP_ID, app_secret: process.env.LARK_APP_SECRET }),
  });
  const j = await res.json().catch(function() { return null; });
  if (!j || j.code !== 0) throw new Error('Lark không cấp quyền cho ứng dụng: ' + ((j && j.msg) || 'HTTP ' + res.status));
  cached = { token: j.tenant_access_token, until: Date.now() + (j.expire - 60) * 1000 };
  return cached.token;
}

async function call(path: string, body: unknown): Promise<{ data?: Record<string, unknown> }> {
  const res = await fetch(API + path, {
    method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: 'Bearer ' + (await tenantToken()) },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(function() { return null; });
  if (!j || j.code !== 0) throw new Error('Lark từ chối (mã ' + (j ? j.code : res.status) + '): ' + ((j && j.msg) || 'không rõ lý do'));
  return j;
}

// Nhắn riêng một thẻ. larkId là Open ID (ou_...) hoặc User ID.
export async function igSendCard(larkId: string, card: unknown): Promise<void> {
  const type = larkId.indexOf('ou_') === 0 ? 'open_id' : 'user_id';
  await call('/im/v1/messages?receive_id_type=' + type, { receive_id: larkId, msg_type: 'interactive', content: JSON.stringify(card) });
}

// Tra Open ID theo email hoặc số điện thoại đăng ký Lark (ứng dụng cần quyền contact:user.id:readonly)
export async function igLookupOpenId(contact: { email?: string; mobile?: string }): Promise<string> {
  const j = await call('/contact/v3/users/batch_get_id?user_id_type=open_id', contact.email ? { emails: [contact.email] } : { mobiles: [contact.mobile] });
  const list = ((j.data && j.data.user_list) || []) as Array<{ user_id?: string }>;
  return (list[0] && list[0].user_id) || '';
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function igDecrypt(encrypted: string, key: string): string {
  const buf = Buffer.from(encrypted, 'base64');
  const d = crypto.createDecipheriv('aes-256-cbc', crypto.createHash('sha256').update(key).digest(), buf.subarray(0, 16));
  return Buffer.concat([d.update(buf.subarray(16)), d.final()]).toString('utf8');
}

type LarkBody = Record<string, unknown> & { encrypt?: string; token?: string; header?: { token?: string } };

// Đọc yêu cầu từ Lark. Chỉ chấp nhận khi mang đúng Verification Token (mã bí mật chỉ Lark và máy chủ app biết).
// Có bật Encrypt Key thì nội dung được giải mã trước. Trả null nếu không tin được.
export function igReadCallback(raw: string): LarkBody | null {
  const want = process.env.LARK_VERIFY_TOKEN || '';
  if (!want) return null;
  try {
    let body = JSON.parse(raw) as LarkBody;
    if (typeof body.encrypt === 'string') {
      const key = process.env.LARK_ENCRYPT_KEY || '';
      if (!key) return null;
      body = JSON.parse(igDecrypt(body.encrypt, key)) as LarkBody;
    }
    const got = (body.header && body.header.token) || body.token || '';
    return typeof got === 'string' && same(got, want) ? body : null;
  } catch {
    return null;
  }
}
