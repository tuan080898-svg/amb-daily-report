import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '@/lib/server-security';
import { dcGetConfig, dcSaveConfig, dcGetMonth, dcSaveSessions, dcDeleteSessions, isMonth, isDay } from '@/lib/doichieu-server';
import type { DcSession, DcBo, DcSettings } from '@/lib/doichieu';

// Đối chiếu sổ kho đánh giá từng nhân sự kho nên chỉ admin được xem và sửa. Quyền lấy từ phiên đăng nhập có chữ ký, không tin dữ liệu từ trình duyệt.
export const dynamic = 'force-dynamic';

function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status: status, headers: { 'Cache-Control': 'no-store' } });
}
function ok(body: unknown) {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}

function validSettings(s: unknown): s is DcSettings {
  const x = s as DcSettings;
  return !!x && typeof x.hoanVaoNhap === 'boolean' && typeof x.xuatKhac === 'boolean' && Array.isArray(x.cot) && x.cot.length <= 40 && x.cot.every(function(n) { return typeof n === 'string' && n.length <= 60; });
}
function validBo(list: unknown): list is DcBo[] {
  return Array.isArray(list) && list.length <= 3000 && list.every(function(b) {
    return b && typeof b.bo === 'string' && b.bo.length <= 40 && Array.isArray(b.parts) && b.parts.length <= 30 &&
      b.parts.every(function(p: unknown) { return Array.isArray(p) && typeof p[0] === 'string' && isFinite(Number(p[1])); });
  });
}
function validPairs(list: unknown, max: number): list is Array<[string, string]> {
  return Array.isArray(list) && list.length <= max && list.every(function(p) { return Array.isArray(p) && typeof p[0] === 'string' && p[0].length <= 60 && typeof p[1] === 'string' && p[1].length <= 200; });
}
function validSession(s: unknown): s is DcSession {
  const x = s as DcSession;
  return !!x && typeof x.ngay === 'string' && isDay(x.ngay) && Array.isArray(x.so) && x.so.length <= 3000 &&
    (x.sapo === null || (!!x.sapo && Array.isArray(x.sapo.rows) && x.sapo.rows.length <= 6000));
}

export async function GET(req: NextRequest) {
  try {
    const u = await sessionUser(req);
    if (!u) return fail(401, 'Chưa đăng nhập hoặc phiên đã hết hạn');
    if (u.role !== 'admin') return fail(403, 'Chỉ admin được xem đối chiếu sổ kho');
    const q = new URL(req.url).searchParams;
    const part = q.get('part') || 'config';
    if (part === 'config') return ok(await dcGetConfig());
    if (part === 'month') {
      const m = q.get('month') || '';
      if (!isMonth(m)) return fail(400, 'Tháng không hợp lệ');
      return ok({ month: m, sessions: await dcGetMonth(m) });
    }
    return fail(400, 'Yêu cầu không hợp lệ');
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : 'Lỗi hệ thống');
  }
}

export async function POST(req: NextRequest) {
  try {
    const u = await sessionUser(req);
    if (!u) return fail(401, 'Chưa đăng nhập hoặc phiên đã hết hạn');
    if (u.role !== 'admin') return fail(403, 'Chỉ admin được sửa đối chiếu sổ kho');
    const body = await req.json();
    const action = String(body.action || '');
    const p = body.payload;

    if (action === 'saveConfig') {
      if (!p || typeof p !== 'object') return fail(400, 'Dữ liệu không hợp lệ');
      if (p.settings !== undefined && !validSettings(p.settings)) return fail(400, 'Cài đặt không hợp lệ');
      if (p.bo !== undefined && !validBo(p.bo)) return fail(400, 'Danh sách bộ không hợp lệ');
      if (p.combos !== undefined && !validPairs(p.combos, 6000)) return fail(400, 'Danh sách combo không hợp lệ');
      if (p.catalog !== undefined && !validPairs(p.catalog, 12000)) return fail(400, 'Danh mục mã không hợp lệ');
      return ok(await dcSaveConfig({ settings: p.settings, bo: p.bo, combos: p.combos, catalog: p.catalog }));
    }
    if (action === 'saveSessions') {
      if (!Array.isArray(p) || p.length === 0 || p.length > 120 || !p.every(validSession)) return fail(400, 'Phiên đối chiếu không hợp lệ');
      await dcSaveSessions(p as DcSession[]);
      return ok({ ok: true });
    }
    if (action === 'deleteSessions') {
      if (!Array.isArray(p) || p.length === 0 || p.length > 400 || !p.every(function(d) { return typeof d === 'string' && isDay(d); })) return fail(400, 'Ngày không hợp lệ');
      return ok({ deleted: await dcDeleteSessions(p as string[]) });
    }
    return fail(400, 'Yêu cầu không hợp lệ');
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : 'Lỗi hệ thống');
  }
}
