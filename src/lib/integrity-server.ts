// Lưu dữ liệu Integrity ở phía máy chủ (chỉ dùng trong route /api/integrity).
// Mỗi người một file sku-data/integrity/<mã người dùng>.json để nhiều người cùng ghi không đè lên nhau.
import crypto from 'crypto';
import { readJson, writeJson } from './storage-server';
import { adminClient } from './server-security';
import type { IgCommit, IgUser } from './integrity';

function path(userId: string): string {
  return 'integrity/' + encodeURIComponent(userId) + '.json';
}

export async function igUsers(): Promise<IgUser[]> {
  const { data, error } = await adminClient().from('users').select('id, name, role').order('name');
  if (error) throw new Error('Đọc danh sách người dùng thất bại: ' + error.message);
  return (data || []).map(function(u) { return { id: String(u.id), name: String(u.name), role: String(u.role) }; });
}

// Mã Lark của thành viên (để gắn tên trong tin): sku-data/integrity/_lark.json
const LARK_IDS = 'integrity/_lark.json';

export async function igLarkIds(): Promise<Record<string, string>> {
  const j = await readJson<{ ids?: Record<string, string> }>(LARK_IDS);
  return (j && j.ids) || {};
}

export async function igSaveLarkIds(ids: Record<string, string>): Promise<void> {
  await writeJson(LARK_IDS, { ids: ids });
}

// Danh sách người dùng kèm mã Lark, chỉ dùng để soạn tin. Không đọc được mã thì vẫn gửi tin với tên thường.
export async function igWithLark(users: IgUser[]): Promise<IgUser[]> {
  const ids: Record<string, string> = await igLarkIds().catch(function() { return {}; });
  return users.map(function(u) { return ids[u.id] ? Object.assign({}, u, { larkId: ids[u.id] }) : u; });
}

export async function igItemsOf(userId: string): Promise<IgCommit[]> {
  const j = await readJson<{ items?: IgCommit[] }>(path(userId));
  return (j && j.items) || [];
}

export async function igAll(users: IgUser[]): Promise<IgCommit[]> {
  const lists = await Promise.all(users.map(function(u) { return igItemsOf(u.id); }));
  return lists.reduce(function(all, l) { return all.concat(l); }, [] as IgCommit[]);
}

// Đọc bản mới nhất -> áp thay đổi -> ghi lại. Hàm fn ném lỗi thì không ghi gì.
export async function igMutate(userId: string, fn: (items: IgCommit[]) => IgCommit[]): Promise<void> {
  const next = fn(await igItemsOf(userId));
  await writeJson(path(userId), { items: next });
}

export function igLarkReady(): boolean {
  return /^https:\/\/open\.(larksuite\.com|feishu\.cn)\/open-apis\/bot\//.test(process.env.LARK_INTEGRITY_WEBHOOK || '');
}

export async function igSendLark(text: string): Promise<void> {
  if (!igLarkReady()) throw new Error('Chưa cài LARK_INTEGRITY_WEBHOOK (địa chỉ bot của nhóm Lark) trên Vercel');
  const body: Record<string, unknown> = { msg_type: 'text', content: { text: text } };
  const secret = process.env.LARK_INTEGRITY_SIGN || '';
  if (secret) {
    const ts = String(Math.floor(Date.now() / 1000));
    body.timestamp = ts;
    body.sign = crypto.createHmac('sha256', ts + '\n' + secret).update('').digest('base64');
  }
  const res = await fetch(process.env.LARK_INTEGRITY_WEBHOOK!, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
  const j = await res.json().catch(function() { return null; });
  // Lark trả HTTP 200 cả khi từ chối tin: phải xem mã lỗi trong nội dung
  const code = j ? (j.code ?? j.StatusCode) : null;
  if (!res.ok || code !== 0) throw new Error('Lark từ chối tin: ' + (j && (j.msg || j.StatusMessage) || 'HTTP ' + res.status));
}
