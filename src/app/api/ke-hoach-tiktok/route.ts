import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '@/lib/server-security';
import { khGetPlan, khSavePlan, khIsMonth } from '@/lib/ke-hoach-tiktok-server';
import type { KhPlan, KhProduct } from '@/lib/ke-hoach-tiktok';

// Kế hoạch TikTok có giá vốn hàng gửi KOC nên chỉ admin được xem và sửa.
export const dynamic = 'force-dynamic';

function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status: status, headers: { 'Cache-Control': 'no-store' } });
}
function ok(body: unknown) {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}

const money = function(x: unknown): number | null { const n = Number(x); return isFinite(n) && n >= 0 && n <= 1e13 ? n : null; };
const text = function(x: unknown, max: number): string { return typeof x === 'string' ? x.slice(0, max) : ''; };

// Chỉ giữ các trường đã biết, kiểm tra số liệu hợp lệ
function clean(x: unknown, by: string): KhPlan | null {
  if (!x || typeof x !== 'object') return null;
  const p = x as Partial<KhPlan>;
  if (typeof p.month !== 'string' || !khIsMonth(p.month)) return null;
  const totalRevenue = money(p.totalRevenue), capPct = money(p.capPct), shipFee = money(p.shipFee), saleWeight = money(p.saleWeight);
  if (totalRevenue === null || capPct === null || capPct > 100 || shipFee === null || saleWeight === null) return null;
  if (!Array.isArray(p.products) || p.products.length > 60 || !Array.isArray(p.staff) || p.staff.length > 30) return null;
  const staff = p.staff.map(function(s) { return text(s, 60); }).filter(Boolean);
  const products: KhProduct[] = [];
  for (const q of p.products as unknown[]) {
    const r = q as Partial<KhProduct>;
    const revenue = money(r.revenue), koc = money(r.koc), video = money(r.video), kocCost = money(r.kocCost);
    if (!r || typeof r.name !== 'string' || revenue === null || koc === null || video === null || kocCost === null) return null;
    const alloc: Record<string, number> = {};
    staff.forEach(function(s) { const a = money(r.alloc && (r.alloc as Record<string, number>)[s]); if (a) alloc[s] = Math.round(a); });
    products.push({ name: text(r.name, 100), revenue: revenue, koc: Math.round(koc), video: Math.round(video), kocCost: kocCost, alloc: alloc });
  }
  const shopRevenue: Record<string, number> = {};
  if (p.shopRevenue && typeof p.shopRevenue === 'object') {
    for (const k of Object.keys(p.shopRevenue).slice(0, 30)) { const v = money((p.shopRevenue as Record<string, number>)[k]); if (v !== null) shopRevenue[text(k, 60)] = v; }
  }
  return { month: p.month, totalRevenue: totalRevenue, capPct: capPct, shipFee: shipFee, saleWeight: saleWeight, shopRevenue: shopRevenue, products: products, staff: staff, updatedBy: by.slice(0, 60), updatedAt: new Date().toISOString() };
}

export async function GET(req: NextRequest) {
  try {
    const u = await sessionUser(req);
    if (!u) return fail(401, 'Chưa đăng nhập hoặc phiên đã hết hạn');
    if (u.role !== 'admin') return fail(403, 'Chỉ admin được xem kế hoạch TikTok');
    const month = new URL(req.url).searchParams.get('month') || '';
    if (!khIsMonth(month)) return fail(400, 'Tháng không hợp lệ');
    return ok({ plan: await khGetPlan(month) });
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : 'Lỗi hệ thống');
  }
}

export async function POST(req: NextRequest) {
  try {
    const u = await sessionUser(req);
    if (!u) return fail(401, 'Chưa đăng nhập hoặc phiên đã hết hạn');
    if (u.role !== 'admin') return fail(403, 'Chỉ admin được sửa kế hoạch TikTok');
    const body = await req.json();
    if (String(body.action || '') !== 'save') return fail(400, 'Yêu cầu không hợp lệ');
    const plan = clean(body.payload, String((body.payload && body.payload.updatedBy) || ''));
    if (!plan) return fail(400, 'Kế hoạch không hợp lệ (kiểm tra các con số)');
    await khSavePlan(plan);
    return ok({ plan: plan });
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : 'Lỗi hệ thống');
  }
}
