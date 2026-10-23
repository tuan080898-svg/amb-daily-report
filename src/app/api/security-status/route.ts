import { NextResponse } from 'next/server';
import { adminClient, publicClient, secretReady } from '@/lib/server-security';

// Báo tình trạng bảo mật (không lộ bí mật nào): để Sếp / tôi kiểm tra từng bước đã đúng chưa.
//  secretSet: máy chủ đã có AMB_SECRET chưa
//  dbKeyMatches: khóa của máy chủ khớp với khóa đã cài trong Supabase chưa (chỉ đúng sau khi chạy file khóa)
//  costOpen / passwordsOpen / storageOpen: người ngoài có đọc được giá vốn / mật khẩu / file lãi lỗ cũ bằng khóa công khai không
export const dynamic = 'force-dynamic';

export async function GET() {
  const out: Record<string, unknown> = { secretSet: secretReady() };
  try {
    const pub = publicClient();
    const cost = await pub.from('cogs_entries').select('sku').limit(1);
    out.costOpen = !cost.error && Array.isArray(cost.data) && cost.data.length > 0;
    const imp = await pub.from('pnl_imports').select('id').limit(1);
    out.pnlOpen = !imp.error && Array.isArray(imp.data) && imp.data.length > 0;
    const pw = await pub.from('users').select('password').limit(1);
    out.passwordsOpen = !pw.error && Array.isArray(pw.data) && pw.data.length > 0;
    // ghi thử vào một tài khoản có thật với đúng giá trị hiện có (không đổi gì): còn ghi được thì trả về 1 dòng, bị chặn thì lỗi hoặc 0 dòng
    const one = await pub.from('users').select('id, name').limit(1);
    const row = one.data && one.data[0];
    if (row) {
      const upd = await pub.from('users').update({ name: row.name }).eq('id', row.id).select('id');
      out.usersWritableByPublic = !upd.error && Array.isArray(upd.data) && upd.data.length > 0;
    }
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    // file lãi lỗ / giá vốn cũ trong kho lưu trữ pnl-data: liệt kê bằng khóa công khai, thấy tên file nghĩa là còn mở
    const st = await fetch(base + '/storage/v1/object/list/pnl-data', { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: '', limit: 100 }), cache: 'no-store' });
    const files = st.ok ? await st.json() : [];
    out.storageOpen = Array.isArray(files) && files.some(function(f: { name?: string }) { return f.name === 'cogs.json' || f.name === 'imports.json'; });
    // dữ liệu đối chiếu sổ kho (có đánh giá nhân sự): đọc thử bằng khóa công khai, đọc được nghĩa là còn mở
    const dc = await fetch(base + '/storage/v1/object/authenticated/sku-data/doichieu/config.json', { headers: { apikey: key, Authorization: 'Bearer ' + key }, cache: 'no-store' });
    out.doichieuOpen = dc.ok;
    const chk = await adminClient().rpc('amb_key_check');
    out.dbKeyMatches = !chk.error && chk.data === true;
    out.lockInstalled = !chk.error;
  } catch (e) {
    out.error = e instanceof Error ? e.message : 'lỗi';
  }
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
