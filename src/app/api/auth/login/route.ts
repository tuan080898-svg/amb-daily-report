import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email và mật khẩu không được để trống' }, { status: 400 });
    }

    const { data } = await supabase.from('users').select('*').eq('email', email).limit(1);
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Email hoặc mật khẩu không đúng' }, { status: 401 });
    }

    const row = data[0];
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
