// Đọc/ghi file JSON trong kho lưu trữ sku-data của Supabase từ phía máy chủ (chỉ dùng trong các route /api).
// Máy chủ gửi kèm khóa truy cập (x-db-key) để sau này khóa được từng thư mục bằng SQL mà không phải sửa mã.

import { dbKey, secretReady } from './server-security';

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const BUCKET = 'sku-data';

function headers(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { apikey: ANON, Authorization: 'Bearer ' + ANON };
  if (secretReady()) h['x-db-key'] = dbKey();
  return Object.assign(h, extra || {});
}

// Trả null khi file chưa có; ném lỗi khi lỗi mạng/quyền (để không nhầm "lỗi" với "rỗng")
export async function readJson<T>(path: string): Promise<T | null> {
  const res = await fetch(URL_BASE + '/storage/v1/object/authenticated/' + BUCKET + '/' + path, { headers: headers(), cache: 'no-store' });
  if (res.status === 404 || res.status === 400) {
    // Supabase trả 400 hoặc 404 cho file chưa có tùy phiên bản; chỉ coi là "chưa có" khi đúng là không thấy file
    let msg = '';
    try { msg = JSON.stringify(await res.json()).toLowerCase(); } catch { /* không phải JSON */ }
    if (msg.indexOf('not found') >= 0 || res.status === 404) return null;
    throw new Error('Đọc ' + path + ' thất bại: ' + msg);
  }
  if (!res.ok) throw new Error('Đọc ' + path + ' thất bại: HTTP ' + res.status);
  return (await res.json()) as T;
}

export async function writeJson(path: string, obj: unknown): Promise<void> {
  const res = await fetch(URL_BASE + '/storage/v1/object/' + BUCKET + '/' + path, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', 'x-upsert': 'true', 'cache-control': 'max-age=0' }),
    body: JSON.stringify(obj),
  });
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try { const j = await res.json(); msg = j.message || j.error || msg; } catch { /* không phải JSON */ }
    throw new Error('Lưu ' + path + ' thất bại: ' + msg);
  }
}
