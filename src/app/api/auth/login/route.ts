import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { adminClient, signToken } from '@/lib/server-security';

// Giới hạn đoán mật khẩu: tối đa 8 lần sai trong 10 phút cho mỗi (email + địa chỉ IP) trên cùng một máy chủ
var attempts = new Map<string, number[]>();
function tooMany(key: string): boolean {
  var now = Date.now();
  var list = (attempts.get(key) || []).filter(function(t) { return now - t < 600000; });
  attempts.set(key, list);
  return list.length >= 8;
}
function noteFail(key: string) {
  var list = attempts.get(key) || [];
  list.push(Date.now());
  attempts.set(key, list);
}

type LoginRow = { id: string; email: string; name: string; role: string; assigned_shops: string[] | null; password: string | null };

export async function POST(req: NextRequest) {
  try {
    const c = adminClient();

    const body = await req.json();
    const email = (body.email || '').trim().toLowerCase();
    const password = (body.password || '').trim();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email và mật khẩu không được để trống' }, { status: 400 });
    }

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const limitKey = email + '|' + ip;
    if (tooMany(limitKey)) {
      return NextResponse.json({ error: 'Đăng nhập sai quá nhiều lần, hãy thử lại sau 10 phút' }, { status: 429 });
    }

    // Đọc tài khoản kèm mật khẩu qua hàm máy chủ (sau khi khóa bảng, cột mật khẩu chỉ đọc được bằng khóa của máy chủ).
    // Hàm chưa có (chưa khóa) thì đọc trực tiếp như cũ.
    let rows: LoginRow[] = [];
    const rpc = await c.rpc('amb_login_row', { p_email: email });
    if (!rpc.error && Array.isArray(rpc.data)) {
      rows = rpc.data as LoginRow[];
    } else {
      // So khớp email không phân biệt hoa/thường (tài khoản cũ có thể lưu chữ hoa, vd "Thao@gmail.com")
      const pattern = email.replace(/[\\%_]/g, function (ch: string) { return '\\' + ch; });
      const { data } = await c.from('users').select('*').ilike('email', pattern).limit(5);
      rows = (data || []) as LoginRow[];
    }
    const row = rows.find(function (r) { return String(r.email || '').trim().toLowerCase() === email; });
    if (!row) {
      noteFail(limitKey);
      return NextResponse.json({ error: 'Email hoặc mật khẩu không đúng' }, { status: 401 });
    }
    const storedPassword = row.password || '';

    let matched = false;
    if (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$')) {
      matched = await bcrypt.compare(password, storedPassword);
    } else {
      matched = storedPassword === password;
      if (matched && storedPassword) {
        const hashed = await bcrypt.hash(password, 10);
        await c.from('users').update({ password: hashed }).eq('id', row.id);
      }
    }

    if (!matched) {
      noteFail(limitKey);
      return NextResponse.json({ error: 'Email hoặc mật khẩu không đúng' }, { status: 401 });
    }

    const user = {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      assignedShops: row.assigned_shops || [],
    };

    return NextResponse.json({ user, token: signToken(row.id) });
  } catch {
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 });
  }
}
