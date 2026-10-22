// Bảo mật phía máy chủ: phiên đăng nhập có chữ ký và khóa truy cập cơ sở dữ liệu.
// Chỉ dùng trong các route /api (chạy trên máy chủ). Bí mật gốc nằm ở biến môi trường AMB_SECRET trên Vercel, KHÔNG nằm trong mã nguồn.
//  - Phiên đăng nhập: mã thông báo ký HMAC (hết hạn 30 ngày), cấp lúc đăng nhập.
//  - Khóa cơ sở dữ liệu: dẫn xuất từ AMB_SECRET, máy chủ gửi kèm mọi truy vấn bảng nhạy cảm (header x-db-key);
//    Supabase chỉ cho phép đọc/ghi bảng giá vốn, lãi lỗ, ghi bảng tài khoản và đọc mật khẩu khi có đúng khóa này.
// Chưa đặt AMB_SECRET: chế độ tương thích (giữ app chạy như cũ, xem sessionUser).

import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const TOKEN_DAYS = 30;

export function secretReady(): boolean {
  return (process.env.AMB_SECRET || '').length >= 24;
}

function derive(purpose: string): string {
  return crypto.createHmac('sha256', process.env.AMB_SECRET || '').update(purpose).digest('hex');
}

export function dbKey(): string {
  return secretReady() ? derive('amb-db-key-v1') : '';
}

// Máy khách Supabase có kèm khóa truy cập (dùng cho bảng nhạy cảm). Khi chưa khóa bảng thì header bị bỏ qua, mọi thứ chạy như cũ.
export function adminClient(): SupabaseClient {
  const headers: Record<string, string> = {};
  if (secretReady()) headers['x-db-key'] = dbKey();
  return createClient(SUPABASE_URL, SUPABASE_ANON, { global: { headers: headers }, auth: { persistSession: false, autoRefreshToken: false } });
}

// Máy khách công khai thuần (không có khóa): dùng để kiểm tra xem dữ liệu còn mở cho người ngoài không
export function publicClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', derive('amb-token-v1')).update(payload).digest('base64url');
}

export function signToken(userId: string): string | null {
  if (!secretReady()) return null;
  const payload = Buffer.from(userId + '|' + (Date.now() + TOKEN_DAYS * 86400000)).toString('base64url');
  return payload + '.' + sign(payload);
}

function verifyToken(token: string): string | null {
  const i = token.indexOf('.');
  if (i < 1) return null;
  const payload = token.slice(0, i);
  const given = Buffer.from(token.slice(i + 1));
  const want = Buffer.from(sign(payload));
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return null;
  const parts = Buffer.from(payload, 'base64url').toString().split('|');
  const exp = Number(parts[parts.length - 1]);
  if (!isFinite(exp) || exp < Date.now()) return null;
  return parts.slice(0, -1).join('|') || null;
}

export interface SessionUser { id: string; role: string }

// Người đang gọi API. Đã đặt AMB_SECRET: bắt buộc có mã thông báo hợp lệ (Authorization: Bearer ...).
// Chưa đặt: chế độ tương thích, nhận mã người dùng trong header x-amb-user (an toàn ngang trước đây; chỉ là bước chuyển tiếp).
// Quyền luôn lấy từ bảng người dùng ngay lúc gọi, nên hạ quyền / xóa tài khoản có hiệu lực ngay.
export async function sessionUser(req: Request): Promise<SessionUser | null> {
  let uid: string | null = null;
  if (secretReady()) {
    const auth = req.headers.get('authorization') || '';
    const token = auth.indexOf('Bearer ') === 0 ? auth.slice(7).trim() : '';
    uid = token ? verifyToken(token) : null;
  } else {
    uid = req.headers.get('x-amb-user') || null;
  }
  if (!uid) return null;
  const { data } = await adminClient().from('users').select('id, role').eq('id', uid).maybeSingle();
  return data ? { id: String(data.id), role: String(data.role) } : null;
}
