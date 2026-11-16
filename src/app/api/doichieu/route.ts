import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '@/lib/server-security';
import { dcGetConfig, dcSaveConfig, dcGetMonth, dcSaveSessions, dcDeleteSessions, dcGetAdj, dcAddAdj, dcRemoveAdj, dcGetSnaps, dcSaveSnap, dcDeleteSnap, isMonth, isDay } from '@/lib/doichieu-server';
import type { TdAdj, TdSnap } from '@/lib/doichieu-tudong';
import type { DcSession, DcBo, DcSettings } from '@/lib/doichieu';

// Đối chiếu sổ kho: admin và nhân sự kho được xem và đối chiếu (lưu phiên, sửa danh sách nhân sự/bộ/combo); chỉ admin được xóa ngày đã lưu.
// Quyền lấy từ phiên đăng nhập có chữ ký, không tin dữ liệu từ trình duyệt.
export const dynamic = 'force-dynamic';

function canUse(role: string): boolean { return role === 'admin' || role === 'warehouse'; }

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
    if (!canUse(u.role)) return fail(403, 'Không có quyền xem đối chiếu sổ kho');
    const q = new URL(req.url).searchParams;
    const part = q.get('part') || 'config';
    if (part === 'config') return ok(await dcGetConfig());
    if (part === 'month') {
      const m = q.get('month') || '';
      if (!isMonth(m)) return fail(400, 'Tháng không hợp lệ');
      return ok({ month: m, sessions: await dcGetMonth(m) });
    }
    if (part === 'snap') {
      const m = q.get('month') || '';
      if (!isMonth(m)) return fail(400, 'Tháng không hợp lệ');
      return ok({ month: m, items: await dcGetSnaps(m) });
    }
    if (part === 'adj') {
      const m = q.get('month') || '';
      if (!isMonth(m)) return fail(400, 'Tháng không hợp lệ');
      return ok({ month: m, items: await dcGetAdj(m) });
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
    if (!canUse(u.role)) return fail(403, 'Không có quyền sửa đối chiếu sổ kho');
    const body = await req.json();
    const action = String(body.action || '');
    const p = body.payload;

    if (action === 'saveConfig') {
      if (!p || typeof p !== 'object') return fail(400, 'Dữ liệu không hợp lệ');
      if (p.settings !== undefined && !validSettings(p.settings)) return fail(400, 'Cài đặt không hợp lệ');
      if (p.bo !== undefined && !validBo(p.bo)) return fail(400, 'Danh sách bộ không hợp lệ');
      if (p.combos !== undefined && !validPairs(p.combos, 6000)) return fail(400, 'Danh sách combo không hợp lệ');
      if (p.catalog !== undefined && !validPairs(p.catalog, 12000)) return fail(400, 'Danh mục mã không hợp lệ');
      if (u.role !== 'admin' && p.settings !== undefined) {
        // nhân sự kho được thêm/sửa danh sách nhân sự, nhưng không đổi cách tính (ảnh hưởng mọi ngày đã lưu)
        const cur = await dcGetConfig();
        if (p.settings.hoanVaoNhap !== cur.settings.hoanVaoNhap || p.settings.xuatKhac !== cur.settings.xuatKhac) return fail(403, 'Chỉ admin được đổi cách tính');
      }
      return ok(await dcSaveConfig({ settings: p.settings, bo: p.bo, combos: p.combos, catalog: p.catalog }));
    }
    if (action === 'saveSessions') {
      if (!Array.isArray(p) || p.length === 0 || p.length > 120 || !p.every(validSession)) return fail(400, 'Phiên đối chiếu không hợp lệ');
      await dcSaveSessions(p as DcSession[]);
      return ok({ ok: true });
    }
    if (action === 'addAdj') {
      if (!p || typeof p !== 'object' || typeof p.ngay !== 'string' || !isDay(p.ngay) || (p.loai !== 'huy' && p.loai !== 'loi')) return fail(400, 'Dữ liệu không hợp lệ');
      const product = typeof p.product === 'string' ? p.product.trim() : '';
      const sl = Number(p.sl);
      if (!product || product.length > 200 || !isFinite(sl) || sl <= 0 || sl > 100000) return fail(400, 'Sản phẩm hoặc số lượng không hợp lệ');
      const e: TdAdj = {
        id: 'T' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        ngay: p.ngay, loai: p.loai, product: product, sl: Math.round(sl * 1000) / 1000,
        ghiChu: typeof p.ghiChu === 'string' ? p.ghiChu.slice(0, 200) : '',
        by: typeof p.by === 'string' ? p.by.slice(0, 60) : '',
        at: new Date().toISOString(),
      };
      return ok({ items: await dcAddAdj(e) });
    }
    if (action === 'saveSnap') {
      const x = p as TdSnap;
      if (!x || typeof x !== 'object' || typeof x.ngay !== 'string' || !isDay(x.ngay) || !Array.isArray(x.rows) || x.rows.length > 800 ||
        !x.pxk || !x.sapo || !x.counts || !Array.isArray(x.adj) || x.adj.length > 600 || !Array.isArray(x.unknownSapo) || x.unknownSapo.length > 200) return fail(400, 'Bản chốt không hợp lệ');
      const clean: TdSnap = {
        ngay: x.ngay, kho: x.kho === 'HCM' || x.kho === 'HN' ? x.kho : '', staff: !!x.staff, xuatKhac: !!x.xuatKhac,
        nguoiLuu: typeof x.nguoiLuu === 'string' ? x.nguoiLuu.slice(0, 60) : '', luuLuc: new Date().toISOString(),
        pxk: x.pxk, sapo: x.sapo, counts: x.counts, rows: x.rows, unknownPxk: x.unknownPxk && typeof x.unknownPxk === 'object' ? x.unknownPxk : {},
        unknownSapo: x.unknownSapo, adj: x.adj,
      };
      return ok({ items: await dcSaveSnap(clean) });
    }
    if (action === 'deleteSnap') {
      if (u.role !== 'admin') return fail(403, 'Chỉ admin được xóa bản chốt');
      if (!p || typeof p.ngay !== 'string' || !isDay(p.ngay)) return fail(400, 'Ngày không hợp lệ');
      return ok({ items: await dcDeleteSnap(p.ngay) });
    }
    if (action === 'removeAdj') {
      if (!p || typeof p.id !== 'string' || p.id.length > 40 || typeof p.ngay !== 'string' || !isDay(p.ngay)) return fail(400, 'Dữ liệu không hợp lệ');
      return ok({ items: await dcRemoveAdj(p.id, p.ngay) });
    }
    if (action === 'deleteSessions') {
      if (u.role !== 'admin') return fail(403, 'Chỉ admin được xóa ngày đã lưu');
      if (!Array.isArray(p) || p.length === 0 || p.length > 400 || !p.every(function(d) { return typeof d === 'string' && isDay(d); })) return fail(400, 'Ngày không hợp lệ');
      return ok({ deleted: await dcDeleteSessions(p as string[]) });
    }
    return fail(400, 'Yêu cầu không hợp lệ');
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : 'Lỗi hệ thống');
  }
}
