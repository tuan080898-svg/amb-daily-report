import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await req.json();
    const email = (body.email || '').trim().toLowerCase();
    const password = (body.password || '').trim();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email và mật khẩu không được để trống' }, { status: 400 });
    }

    // So khớp email không phân biệt hoa/thường (tài khoản cũ có thể lưu chữ hoa, vd "Thao@gmail.com")
    const pattern = email.replace(/[\\%_]/g, function (c: string) { return '\\' + c; });
    const { data } = await supabase.from('users').select('*').ilike('email', pattern).limit(5);
    const row = (data || []).find(function (r) { return String(r.email || '').trim().toLowerCase() === email; });
    if (!row) {
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
        await supabase.from('users').update({ password: hashed }).eq('id', row.id);
      }
    }

    if (!matched) {
      return NextResponse.json({ error: 'Email hoặc mật khẩu không đúng' }, { status: 401 });
    }

    const user = {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      assignedShops: row.assigned_shops || [],
    };

    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 });
  }
}
