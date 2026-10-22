import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { adminClient, sessionUser } from '@/lib/server-security';

// Thêm / sửa / xóa tài khoản: chỉ admin, và chỉ qua máy chủ (mật khẩu được mã hóa ở đây).
// Nhờ vậy sau khi khóa bảng trên Supabase, người ngoài không thể tự đổi vai trò hay mật khẩu bằng khóa công khai.
export const dynamic = 'force-dynamic';

const ROLES = ['admin', 'employee', 'warehouse', 'manager_hn', 'manager_hcm'];

function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status: status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  try {
    const u = await sessionUser(req);
    if (!u) return fail(401, 'Chưa đăng nhập hoặc phiên đã hết hạn');
    if (u.role !== 'admin') return fail(403, 'Chỉ admin được quản lý tài khoản');
    const body = await req.json();
    const action = String(body.action || '');
    const c = adminClient();

    if (action === 'delete') {
      const id = String(body.id || '');
      if (!id) return fail(400, 'Thiếu mã tài khoản');
      if (id === u.id) return fail(400, 'Không thể tự xóa tài khoản đang đăng nhập');
      const { error } = await c.from('users').delete().eq('id', id);
      if (error) return fail(500, 'Xóa user thất bại: ' + error.message);
      return NextResponse.json({ ok: true });
    }

    const user = body.user || {};
    const id = String(user.id || '');
    const email = String(user.email || '').trim().toLowerCase();
    const name = String(user.name || '').trim();
    const role = String(user.role || '');
    const assigned = Array.isArray(user.assignedShops) ? user.assignedShops.map(String) : [];
    if (!id || !email || !name) return fail(400, 'Thiếu thông tin tài khoản');
    if (ROLES.indexOf(role) < 0) return fail(400, 'Vai trò không hợp lệ');

    if (action === 'add') {
      const raw = String(user.password || '') || 'Amb@2024';
      const { error } = await c.from('users').insert({ id: id, email: email, name: name, role: role, assigned_shops: assigned, password: await bcrypt.hash(raw, 10) });
      if (error) return fail(500, 'Thêm user thất bại: ' + error.message);
      return NextResponse.json({ ok: true });
    }
    if (action === 'update') {
      const data: Record<string, unknown> = { email: email, name: name, role: role, assigned_shops: assigned };
      if (user.password) data.password = await bcrypt.hash(String(user.password), 10);
      const { error } = await c.from('users').update(data).eq('id', id);
      if (error) return fail(500, 'Cập nhật user thất bại: ' + error.message);
      return NextResponse.json({ ok: true });
    }
    return fail(400, 'Yêu cầu không hợp lệ');
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : 'Lỗi hệ thống');
  }
}
