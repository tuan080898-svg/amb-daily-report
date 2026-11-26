import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '@/lib/server-security';
import { cbMutate, cbReport } from '@/lib/canhbao-server';
import type { CbIncoming, CbKho } from '@/lib/canhbao';

// Cảnh báo nhập hàng. Admin và nhân sự kho được xem; chỉ admin sửa cài đặt và hàng đang về.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status: status, headers: { 'Cache-Control': 'no-store' } });
}
function ok(body: unknown) {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}

const isKho = (k: unknown): k is CbKho => k === 'HCM' || k === 'HN';
const okName = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= 120 && s !== '__proto__';
const okDays = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 365;
const str = (s: unknown, max: number) => (typeof s === 'string' ? s.slice(0, max) : '');

export async function GET(req: NextRequest) {
  try {
    const u = await sessionUser(req);
    if (!u) return fail(401, 'Chưa đăng nhập hoặc phiên đã hết hạn');
    if (u.role !== 'admin' && u.role !== 'warehouse') return fail(403, 'Không có quyền xem cảnh báo nhập hàng');
    return ok(await cbReport());
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : 'Lỗi hệ thống');
  }
}

export async function POST(req: NextRequest) {
  try {
    const u = await sessionUser(req);
    if (!u) return fail(401, 'Chưa đăng nhập hoặc phiên đã hết hạn');
    if (u.role !== 'admin') return fail(403, 'Chỉ admin được sửa');
    const body = await req.json();
    const action = String(body.action || '');
    const p = body.payload;
    if (!p || typeof p !== 'object') return fail(400, 'Dữ liệu không hợp lệ');
    const now = new Date().toISOString();

    if (action === 'settings') {
      if (!okDays(p.leadDays) || p.leadDays < 1 || !okDays(p.safetyDays) || !okDays(p.cycleDays) || p.cycleDays < 1) return fail(400, 'Số ngày không hợp lệ');
      await cbMutate(function(d) { d.settings = { leadDays: p.leadDays, safetyDays: p.safetyDays, cycleDays: p.cycleDays }; return d; });
    } else if (action === 'product') {
      // leadDays = 0 nghĩa là dùng số ngày chung
      if (!okName(p.product) || !okDays(p.leadDays) || typeof p.stop !== 'boolean') return fail(400, 'Dữ liệu không hợp lệ');
      await cbMutate(function(d) {
        if (!p.leadDays && !p.stop) delete d.products[p.product];
        else d.products[p.product] = { leadDays: p.leadDays || undefined, stop: p.stop || undefined };
        return d;
      });
    } else if (action === 'addIncoming') {
      if (!okName(p.product) || !isKho(p.kho) || typeof p.qty !== 'number' || !(p.qty > 0) || p.qty > 100000000 || !/^\d{4}-\d{2}-\d{2}$/.test(String(p.eta))) return fail(400, 'Lô hàng đang về không hợp lệ');
      const item: CbIncoming = { id: 'D' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), product: p.product, kho: p.kho, qty: p.qty, eta: p.eta, createdAt: now, by: str(p.by, 60), note: str(p.note, 200) };
      await cbMutate(function(d) {
        if (d.incoming.length >= 5000) d.incoming = d.incoming.filter(function(i) { return !i.doneAt; });
        d.incoming = d.incoming.concat([item]);
        return d;
      });
    } else if (action === 'doneIncoming') {
      // Hàng đã về hoặc hủy đặt: chỉ đánh dấu, không xóa. Tồn kho cập nhật qua đồng bộ Sapo.
      if (!okName(p.id)) return fail(400, 'Dữ liệu không hợp lệ');
      await cbMutate(function(d) { d.incoming = d.incoming.map(function(i) { return i.id === p.id ? { ...i, doneAt: now } : i; }); return d; });
    } else {
      return fail(400, 'Thao tác không hợp lệ');
    }
    return ok(await cbReport());
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : 'Lỗi hệ thống');
  }
}
