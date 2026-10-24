import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '@/lib/server-security';
import { skGet, skMutate } from '@/lib/sokho-server';
import type { SkAnchor, SkKho, SkMove } from '@/lib/sokho';

// Sổ kho thực tế. Admin và nhân sự kho được xem (nhân sự kho cần biết kho của mình); chỉ admin được nhập kiểm kho, nhập hàng, điều chỉnh, gán kho cho tài khoản.
// Hàng xuất theo phiếu không lưu ở đây: luôn tính từ chính các phiếu xuất kho (xem src/lib/sokho.ts).
export const dynamic = 'force-dynamic';

function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status: status, headers: { 'Cache-Control': 'no-store' } });
}
function ok(body: unknown) {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}

const isKho = (k: unknown): k is SkKho => k === 'HCM' || k === 'HN';
const okName = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= 120;
const okQty = (n: unknown): n is number => typeof n === 'number' && isFinite(n) && Math.abs(n) <= 100000000;
const okAt = (s: unknown): s is string => typeof s === 'string' && isFinite(Date.parse(s));
const str = (s: unknown, max: number) => (typeof s === 'string' ? s.slice(0, max) : '');
const newId = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export async function GET(req: NextRequest) {
  try {
    const u = await sessionUser(req);
    if (!u) return fail(401, 'Chưa đăng nhập hoặc phiên đã hết hạn');
    if (u.role !== 'admin' && u.role !== 'warehouse') return fail(403, 'Không có quyền xem sổ kho');
    return ok(await skGet());
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : 'Lỗi hệ thống');
  }
}

export async function POST(req: NextRequest) {
  try {
    const u = await sessionUser(req);
    if (!u) return fail(401, 'Chưa đăng nhập hoặc phiên đã hết hạn');
    if (u.role !== 'admin') return fail(403, 'Chỉ admin được sửa sổ kho');
    const body = await req.json();
    const action = String(body.action || '');
    const p = body.payload;
    if (!p || typeof p !== 'object') return fail(400, 'Dữ liệu không hợp lệ');
    const now = new Date().toISOString();

    if (action === 'addCount') {
      if (!isKho(p.kho) || !okAt(p.at) || !Array.isArray(p.items) || p.items.length === 0 || p.items.length > 600) return fail(400, 'Phiếu kiểm kho không hợp lệ');
      if (!p.items.every(function(i: { product: unknown; qty: unknown }) { return okName(i.product) && okQty(i.qty) && i.qty >= 0; })) return fail(400, 'Có sản phẩm hoặc số lượng không hợp lệ');
      if (Date.parse(p.at) > Date.now() + 5 * 60000) return fail(400, 'Thời điểm kiểm kho không được ở tương lai');
      const session = newId('K');
      const kho: SkKho = p.kho;
      const list: SkAnchor[] = p.items.map(function(i: { product: string; qty: number }, n: number) {
        return { id: session + '-' + n, session: session, kho: kho, product: i.product.trim(), qty: i.qty, at: new Date(p.at).toISOString(), savedAt: now, by: str(p.by, 60), note: str(p.note, 200) };
      });
      return ok(await skMutate(function(d) {
        if (d.anchors.length + list.length > 40000) throw new Error('Số dòng kiểm kho quá lớn');
        d.anchors = d.anchors.concat(list);
        return d;
      }));
    }
    if (action === 'addMove') {
      if (!isKho(p.kho) || !okName(p.product) || !okQty(p.qty) || p.qty === 0 || !okAt(p.at) || (p.type !== 'import' && p.type !== 'adjust')) return fail(400, 'Dữ liệu không hợp lệ');
      if (p.type === 'import' && p.qty < 0) return fail(400, 'Nhập hàng phải là số dương');
      const m: SkMove = { id: newId('M'), kho: p.kho, product: p.product.trim(), qty: p.qty, type: p.type, at: new Date(p.at).toISOString(), savedAt: now, by: str(p.by, 60), note: str(p.note, 200) };
      return ok(await skMutate(function(d) { d.moves = d.moves.concat([m]); return d; }));
    }
    if (action === 'setKhoUser') {
      if (!okName(p.userId) || (p.kho !== null && !isKho(p.kho))) return fail(400, 'Dữ liệu không hợp lệ');
      const uid: string = p.userId;
      return ok(await skMutate(function(d) {
        const k = Object.assign({}, d.khoUsers);
        if (p.kho === null) delete k[uid]; else k[uid] = p.kho;
        d.khoUsers = k;
        return d;
      }));
    }
    if (action === 'hideProduct') {
      if (!isKho(p.kho) || !okName(p.product) || typeof p.hide !== 'boolean') return fail(400, 'Dữ liệu không hợp lệ');
      const kh: SkKho = p.kho;
      const name: string = p.product.trim();
      return ok(await skMutate(function(d) {
        const cur = (d.hidden[kh] || []).filter(function(x) { return x !== name; });
        d.hidden = Object.assign({}, d.hidden, { [kh]: p.hide ? cur.concat([name]) : cur });
        return d;
      }));
    }
    if (action === 'bulkProducts') {
      // áp một lần nhiều thay đổi danh sách sản phẩm của một kho (nhập từ file Excel): hiện lại / ẩn / thêm tự do
      const lists = ['show', 'hide', 'addExtra'].map(function(k) { return p[k] === undefined ? [] : p[k]; });
      if (!isKho(p.kho) || !lists.every(function(l) { return Array.isArray(l) && l.length <= 700 && l.every(okName); })) return fail(400, 'Dữ liệu không hợp lệ');
      const k2: SkKho = p.kho;
      const show = new Set<string>((lists[0] as string[]).map(function(x) { return x.trim(); }));
      const hide = (lists[1] as string[]).map(function(x) { return x.trim(); });
      const add = (lists[2] as string[]).map(function(x) { return x.trim(); });
      return ok(await skMutate(function(d) {
        const ex = new Set<string>(d.extra || []);
        add.forEach(function(x) { ex.add(x); });
        if (ex.size > 500) throw new Error('Quá nhiều sản phẩm tự thêm');
        d.extra = Array.from(ex);
        const hid = new Set<string>(d.hidden[k2] || []);
        hide.forEach(function(x) { hid.add(x); });
        show.forEach(function(x) { hid.delete(x); });
        d.hidden = Object.assign({}, d.hidden, { [k2]: Array.from(hid) });
        return d;
      }));
    }
    if (action === 'setDeduct') {
      if (typeof p.on !== 'boolean') return fail(400, 'Dữ liệu không hợp lệ');
      const on: boolean = p.on;
      return ok(await skMutate(function(d) { d.deductFromSlips = on; return d; }));
    }
    if (action === 'addExtra') {
      if (!okName(p.name)) return fail(400, 'Tên sản phẩm không hợp lệ');
      const nm: string = p.name.trim();
      return ok(await skMutate(function(d) {
        if ((d.extra || []).length >= 500) throw new Error('Quá nhiều sản phẩm tự thêm');
        if ((d.extra || []).indexOf(nm) < 0) d.extra = (d.extra || []).concat([nm]);
        d.hidden = { HCM: d.hidden.HCM.filter(function(x) { return x !== nm; }), HN: d.hidden.HN.filter(function(x) { return x !== nm; }) };
        return d;
      }));
    }
    if (action === 'removeExtra') {
      if (!okName(p.name)) return fail(400, 'Tên sản phẩm không hợp lệ');
      const nm2: string = p.name.trim();
      return ok(await skMutate(function(d) { d.extra = (d.extra || []).filter(function(x) { return x !== nm2; }); return d; }));
    }
    if (action === 'removeEntries') {
      const sessions: string[] = Array.isArray(p.sessions) ? p.sessions.filter(function(x: unknown) { return typeof x === 'string'; }) : [];
      const moves: string[] = Array.isArray(p.moveIds) ? p.moveIds.filter(function(x: unknown) { return typeof x === 'string'; }) : [];
      if (!sessions.length && !moves.length) return fail(400, 'Không có mục nào để xóa');
      return ok(await skMutate(function(d) {
        d.anchors = d.anchors.filter(function(a) { return sessions.indexOf(a.session) < 0; });
        d.moves = d.moves.filter(function(m) { return moves.indexOf(m.id) < 0; });
        return d;
      }));
    }
    return fail(400, 'Yêu cầu không hợp lệ');
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : 'Lỗi hệ thống');
  }
}
