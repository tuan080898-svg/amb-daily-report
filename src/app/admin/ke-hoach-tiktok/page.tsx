'use client';

// Kế hoạch doanh số TikTok: tổng doanh số tháng -> trần ADS + KOC (15%) -> từng sản phẩm -> giao việc từng shop / từng người -> chẻ ra tuần và ngày.

import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAppState } from '@/lib/store';
import { dbGetCostBasic, dbGetKhTiktok, dbSaveKhTiktok } from '@/lib/db';
import { getAllSkuCodes, getSkuProducts, subscribeSkuMap } from '@/lib/sku';
import { BookingSnapshot, OTHER_PRODUCT, PRODUCT_CATEGORIES, canonicalProduct } from '@/lib/booking';
import {
  KhPlan, KhProduct, khAllocGap, khAutoAlloc, khBookingRef, khBookingStaff, khCalc, khDays, khNewPlan, khNewProduct, khStaffCalc, khTopSku, khWeeklyRevenue, khWeeklySplit, khWeeks,
} from '@/lib/ke-hoach-tiktok';

function fmt(n: number): string { return Math.round(n).toLocaleString('vi-VN'); }
function short(n: number): string {
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a >= 1e9) return s + (a / 1e9).toFixed(2).replace('.', ',') + ' tỷ';
  if (a >= 1e6) return s + (a / 1e6).toFixed(1).replace('.', ',') + ' triệu';
  return s + fmt(a);
}
function pct(n: number): string { return n.toFixed(1).replace('.', ',') + '%'; }
function fd(d: string): string { return d.slice(8, 10) + '/' + d.slice(5, 7); }
function prevMonth(m: string): string {
  const y = parseInt(m.slice(0, 4), 10), mo = parseInt(m.slice(5, 7), 10);
  return mo === 1 ? (y - 1) + '-12' : y + '-' + (mo - 1 < 10 ? '0' + (mo - 1) : String(mo - 1));
}
function lastDay(m: string): string { return new Date(Date.UTC(parseInt(m.slice(0, 4), 10), parseInt(m.slice(5, 7), 10), 0)).toISOString().slice(0, 10); }
const DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

// Ô nhập số: hiện dấu chấm ngăn nghìn khi không gõ
function NumInput(p: { value: number; onChange: (n: number) => void; decimals?: boolean; className?: string; width?: string; placeholder?: string }) {
  const [focus, setFocus] = useState(false);
  const [raw, setRaw] = useState('');
  const shown = focus ? raw : (p.value ? (p.decimals ? String(p.value).replace('.', ',') : Math.round(p.value).toLocaleString('vi-VN')) : '');
  return (
    <input inputMode={p.decimals ? 'decimal' : 'numeric'} value={shown} placeholder={p.placeholder || '0'}
      onFocus={function() { setRaw(p.value ? String(p.value).replace('.', ',') : ''); setFocus(true); }}
      onBlur={function() { setFocus(false); }}
      onChange={function(e) {
        const t = p.decimals ? e.target.value.replace(/[^0-9,]/g, '') : e.target.value.replace(/\D/g, '');
        setRaw(t);
        const n = parseFloat(t.replace(',', '.'));
        p.onChange(isFinite(n) ? n : 0);
      }}
      className={'bg-slate-800 border border-slate-700 rounded px-2 py-1 text-right text-sm text-gray-100 ' + (p.width || 'w-28') + ' ' + (p.className || '')} />
  );
}

const card = 'bg-slate-900 border border-slate-700/50 rounded-xl p-5';
const th = 'text-xs text-slate-400 font-medium py-2 px-2 border-b border-slate-700/50';
const btn = 'px-3 py-1.5 text-sm rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800';
const btnP = 'px-4 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50';

export default function KeHoachTiktokPage() {
  const { currentUser, shops, users, reports, monthlyKPIs, updateKPI } = useAppState();
  const now = new Date();
  const [month, setMonth] = useState(function() { const n = new Date(now.getFullYear(), now.getMonth() + 1, 1); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0'); }); // mặc định: tháng sau
  const [plan, setPlan] = useState<KhPlan>(khNewPlan(month));
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [snap, setSnap] = useState<BookingSnapshot | null>(null);
  const [cogs, setCogs] = useState<Record<string, number>>({});
  const [skuVer, setSkuVer] = useState(0);
  const [view, setView] = useState<'tuan' | 'ngay'>('tuan');
  const [addCat, setAddCat] = useState('');
  const initFor = useRef('');

  useEffect(function() { return subscribeSkuMap(function() { setSkuVer(function(v) { return v + 1; }); }); }, []);

  // Số liệu booking (tham khảo) và giá vốn
  useEffect(function() {
    let alive = true;
    fetch('/api/lark-booking', { cache: 'no-store' }).then(function(r) { return r.ok ? r.json() : null; })
      .then(function(j) { if (alive && j && j.version === 2) setSnap(j as BookingSnapshot); }).catch(function() { /* không có số tham khảo */ });
    dbGetCostBasic().then(function(c) {
      if (!alive) return;
      const m: Record<string, number> = {};
      c.cogs.forEach(function(e) { m[String(e.sku).trim().toUpperCase()] = Number(e.cost) || 0; });
      setCogs(m);
    }).catch(function() { /* không đọc được giá vốn: nhập tay */ });
    return function() { alive = false; };
  }, []);

  // Tải kế hoạch của tháng đang chọn
  useEffect(function() {
    let alive = true;
    setLoaded(false); setDirty(false); setMsg('');
    dbGetKhTiktok(month).then(function(p) {
      if (!alive) return;
      setPlan(p || khNewPlan(month));
      initFor.current = p ? month : '';
      setLoaded(true);
    }).catch(function(e) { if (alive) { setMsg('Không tải được kế hoạch: ' + (e instanceof Error ? e.message : '')); setPlan(khNewPlan(month)); setLoaded(true); } });
    return function() { alive = false; };
  }, [month]);

  const tiktokShops = useMemo(function() { return shops.filter(function(s) { return s.channel === 'TikTok'; }); }, [shops]);

  const codeIndex = useMemo(function() {
    const m = new Map<string, string>();
    getAllSkuCodes().forEach(function(c) { m.set(c.trim().toUpperCase(), c); });
    return m;
  }, [skuVer]); // eslint-disable-line react-hooks/exhaustive-deps
  const catOf = useMemo(function() {
    return function(code: string): string | null {
      const real = codeIndex.get(code.trim().toUpperCase());
      if (!real) return null;
      const items = getSkuProducts(real);
      if (items.length === 0) return null;
      for (let i = 0; i < items.length; i++) { const c = canonicalProduct(items[i].product); if (c && c !== OTHER_PRODUCT) return c; }
      return items[0].product;
    };
  }, [codeIndex]);

  const pm = prevMonth(month);
  const refPrev = useMemo(function() { return snap ? khBookingRef(snap, pm + '-01', lastDay(pm), catOf) : null; }, [snap, pm, catOf]);
  const ref90 = useMemo(function() {
    if (!snap) return null;
    const d = new Date(month + '-01T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 90);
    return khBookingRef(snap, d.toISOString().slice(0, 10), lastDay(pm), catOf);
  }, [snap, month, pm, catOf]);

  // Gợi ý giá vốn gói gửi KOC = giá vốn của mã SKU hay gửi nhất của loại hàng đó
  function suggest(cat: string): { cost: number; sku: string | null } {
    const sku = ref90 ? khTopSku(ref90, cat) : null;
    return { cost: sku ? (cogs[sku.toUpperCase()] || 0) : 0, sku: sku };
  }

  // Kế hoạch mới: lấy sẵn nhân sự booking và KPI các shop (nếu đã có)
  useEffect(function() {
    if (!loaded || initFor.current === month || !snap) return;
    initFor.current = month;
    setPlan(function(p) {
      if (p.month !== month || p.products.length > 0 || p.staff.length > 0) return p;
      const shopRevenue: Record<string, number> = {};
      let total = 0;
      tiktokShops.forEach(function(s) { const k = monthlyKPIs.find(function(x) { return x.shopId === s.id && x.month === month; }); if (k && k.kpiAmount > 0) { shopRevenue[s.id] = k.kpiAmount; total += k.kpiAmount; } });
      return Object.assign({}, p, { staff: khBookingStaff(snap), shopRevenue: shopRevenue, totalRevenue: p.totalRevenue || total });
    });
  }, [loaded, month, snap, tiktokShops, monthlyKPIs]);

  function edit(fn: (p: KhPlan) => KhPlan) { setPlan(function(p) { return fn(p); }); setDirty(true); setMsg(''); }
  function setProd(i: number, patch: Partial<KhProduct>) {
    edit(function(p) { return Object.assign({}, p, { products: p.products.map(function(x, j) { return j === i ? Object.assign({}, x, patch) : x; }) }); });
  }

  const calc = useMemo(function() { return khCalc(plan); }, [plan]);
  const staffCalc = useMemo(function() { return khStaffCalc(plan); }, [plan]);
  const weeks = useMemo(function() { return khWeeks(month); }, [month]);
  const days = useMemo(function() { return khDays(plan, calc); }, [plan, calc]);
  const nW = weeks.length;

  const prevRevByShop = useMemo(function() {
    const m: Record<string, number> = {};
    reports.forEach(function(r) { if (r.date.slice(0, 7) === pm) m[r.shopId] = (m[r.shopId] || 0) + (Number(r.actualRevenue) || 0); });
    return m;
  }, [reports, pm]);

  if (!currentUser || currentUser.role !== 'admin') return <div className="p-6 text-red-400">Bạn không có quyền truy cập trang này.</div>;

  function addProduct(name: string) {
    if (!name || plan.products.some(function(x) { return x.name === name; })) return;
    const s = suggest(name);
    edit(function(p) { return Object.assign({}, p, { products: p.products.concat([khNewProduct(name, s.cost)]) }); });
  }
  function addSentLastMonth() {
    if (!refPrev) return;
    const names = Object.keys(refPrev.byCat).filter(function(n) { return refPrev.byCat[n].sent > 0 || refPrev.byCat[n].video > 0; })
      .sort(function(a, b) { return refPrev.byCat[b].sent - refPrev.byCat[a].sent; });
    edit(function(p) {
      const have = new Set(p.products.map(function(x) { return x.name; }));
      const add = names.filter(function(n) { return !have.has(n); }).map(function(n) { return khNewProduct(n, suggest(n).cost); });
      return Object.assign({}, p, { products: p.products.concat(add) });
    });
  }
  function shopSplit(mode: 'prev' | 'equal') {
    edit(function(p) {
      const sr: Record<string, number> = {};
      const totalPrev = tiktokShops.reduce(function(s, x) { return s + (prevRevByShop[x.id] || 0); }, 0);
      let used = 0;
      tiktokShops.forEach(function(s, i) {
        const share = mode === 'prev' && totalPrev > 0 ? (prevRevByShop[s.id] || 0) / totalPrev : 1 / tiktokShops.length;
        const v = i === tiktokShops.length - 1 ? p.totalRevenue - used : Math.round(p.totalRevenue * share / 1000) * 1000;
        sr[s.id] = Math.max(0, v); used += v;
      });
      return Object.assign({}, p, { shopRevenue: sr });
    });
  }
  function toggleStaff(n: string) {
    edit(function(p) { return Object.assign({}, p, { staff: p.staff.indexOf(n) >= 0 ? p.staff.filter(function(x) { return x !== n; }) : p.staff.concat([n]) }); });
  }
  function autoAlloc() { edit(function(p) { return Object.assign({}, p, { products: khAutoAlloc(p) }); }); }

  async function save() {
    setSaving(true); setMsg('');
    try {
      const saved = await dbSaveKhTiktok(Object.assign({}, plan, { updatedBy: currentUser ? currentUser.name : '' }));
      setPlan(saved); setDirty(false);
      setMsg('Đã lưu kế hoạch tháng ' + month.slice(5) + '/' + month.slice(0, 4) + '.');
    } catch (e) { setMsg('Lưu không thành công: ' + (e instanceof Error ? e.message : '')); }
    setSaving(false);
  }

  function applyKpi() {
    const rows = tiktokShops.filter(function(s) { return (plan.shopRevenue[s.id] || 0) > 0; });
    if (rows.length === 0) { setMsg('Chưa có doanh số giao cho shop nào.'); return; }
    const lines = rows.map(function(s) {
      const old = monthlyKPIs.find(function(k) { return k.shopId === s.id && k.month === month; });
      return s.name + ': ' + fmt(old ? old.kpiAmount : 0) + ' → ' + fmt(plan.shopRevenue[s.id]);
    });
    if (!window.confirm('Cập nhật KPI doanh số tháng ' + month + ' của các shop TikTok (cũ → mới):\n\n' + lines.join('\n') + '\n\nĐồng ý?')) return;
    rows.forEach(function(s) { updateKPI({ shopId: s.id, month: month, kpiAmount: plan.shopRevenue[s.id] }); });
    setMsg('Đã cập nhật KPI doanh số tháng ' + month + ' cho ' + rows.length + ' shop.');
  }

  function changeMonth(m: string) {
    if (!m || m === month) return;
    if (dirty && !window.confirm('Kế hoạch đang sửa chưa lưu. Đổi tháng sẽ mất các thay đổi này. Đổi tháng?')) return;
    setMonth(m);
  }

  // ----- số liệu hiển thị -----
  const adsShare = function(shopId: string): number { const s = calc.shopSum; return s > 0 ? (plan.shopRevenue[shopId] || 0) / s : 0; };
  const shopWeekRev = function(shopId: string): number[] { return khWeeklyRevenue(plan.shopRevenue[shopId] || 0, days, nW, plan.saleWeight); };
  const shopWeekAds = function(shopId: string): number[] { return khWeeklyRevenue(Math.max(0, calc.adsTotal) * adsShare(shopId), days, nW, plan.saleWeight); };
  const weekRev = khWeeklyRevenue(plan.totalRevenue, days, nW, plan.saleWeight);
  const weekAds = khWeeklyRevenue(Math.max(0, calc.adsTotal), days, nW, plan.saleWeight);
  const weekKoc = khWeeklySplit(calc.kocTotal, days, nW);
  const weekVideo = khWeeklySplit(calc.videoTotal, days, nW);
  const wLabel = function(i: number): string { return 'Tuần ' + (i + 1) + ' (' + fd(weeks[i].from) + '–' + fd(weeks[i].to) + ')'; };

  const issues: string[] = [];
  if (plan.totalRevenue > 0 && Math.abs(calc.revenueGap) > 1000) issues.push('Tổng doanh số các sản phẩm ' + (calc.revenueGap > 0 ? 'thiếu ' : 'vượt ') + short(Math.abs(calc.revenueGap)) + ' so với tổng doanh số tháng.');
  if (plan.totalRevenue > 0 && Math.abs(calc.shopGap) > 1000) issues.push('Tổng doanh số giao các shop ' + (calc.shopGap > 0 ? 'thiếu ' : 'vượt ') + short(Math.abs(calc.shopGap)) + ' so với tổng doanh số tháng.');
  calc.products.filter(function(x) { return x.over; }).forEach(function(x) { issues.push(x.name + ': chi phí KOC (' + short(x.kocSpend) + ') vượt trần MKT của sản phẩm (' + short(x.cap) + '), không còn ngân sách ADS.'); });
  plan.products.forEach(function(x) { const g = khAllocGap(plan, x); if (x.koc > 0 && plan.staff.length > 0 && g !== 0) issues.push(x.name + ': ' + (g > 0 ? 'còn ' + g + ' KOC chưa giao cho nhân sự booking.' : 'giao thừa ' + (-g) + ' KOC so với chỉ tiêu.')); });
  plan.products.forEach(function(x) { if (x.koc > 0 && !x.kocCost) issues.push(x.name + ': chưa có giá vốn gói gửi KOC (chi phí KOC đang chỉ tính ship).'); });

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    const a1: Array<Array<string | number>> = [
      ['Kế hoạch TikTok tháng', month], [],
      ['Tổng doanh số', plan.totalRevenue], ['Trần ADS + KOC (%)', plan.capPct], ['Trần MKT (đ)', calc.mktCap],
      ['Chi phí hàng + ship gửi KOC', calc.kocSpend], ['Ngân sách ADS', calc.adsTotal], ['Phí ship / gói', plan.shipFee], [],
      ['Shop', 'Người phụ trách', 'Doanh số', 'Ngân sách ADS'],
    ];
    tiktokShops.forEach(function(s) {
      const owners = users.filter(function(u) { return s.assignedTo.indexOf(u.id) >= 0; }).map(function(u) { return u.name; }).join(', ');
      a1.push([s.name, owners, plan.shopRevenue[s.id] || 0, Math.round(Math.max(0, calc.adsTotal) * adsShare(s.id))]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a1), 'Tong quan');
    const a2: Array<Array<string | number>> = [['Loại hàng', 'Doanh số', 'Trần MKT', 'KOC cần book', 'Video cần lên', 'Giá vốn gói', 'Chi phí 1 KOC', 'Chi phí KOC', 'ADS còn lại', 'ADS %', 'KOC %']];
    calc.products.forEach(function(x) { a2.push([x.name, x.revenue, Math.round(x.cap), x.koc, x.video, plan.products.find(function(q) { return q.name === x.name; })!.kocCost, x.unit, Math.round(x.kocSpend), Math.round(x.ads), Math.round(x.adsPct * 10) / 10, Math.round(x.kocPct * 10) / 10]); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a2), 'San pham');
    const a3: Array<Array<string | number>> = [['Nhân sự booking', 'Loại hàng', 'KOC cần book', 'Video cần lên']];
    staffCalc.forEach(function(s) {
      Object.keys(s.byProduct).forEach(function(n) { a3.push([s.name, n, s.byProduct[n].koc, s.byProduct[n].video]); });
      a3.push([s.name + ' (tổng)', '', s.koc, s.video]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a3), 'Booking nhan su');
    const a4: Array<Array<string | number>> = [['Tuần', 'Từ', 'Đến', 'Doanh số', 'ADS', 'KOC book', 'Video']];
    weeks.forEach(function(w, i) { a4.push([i + 1, w.from, w.to, weekRev[i], weekAds[i], weekKoc[i], weekVideo[i]]); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a4), 'Theo tuan');
    const a5: Array<Array<string | number>> = [['Ngày', 'Thứ', 'Loại ngày', 'Doanh số', 'ADS', 'KOC book', 'Video']];
    days.forEach(function(d) { a5.push([d.date, DOW[d.dow], d.type === 'regular' ? 'Thường' : 'Sale', d.revenue, d.ads, d.koc, d.video]); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a5), 'Theo ngay');
    XLSX.writeFile(wb, 'ke-hoach-tiktok-' + month + '.xlsx');
  }

  const catOptions = Array.from(new Set(PRODUCT_CATEGORIES.concat(refPrev ? Object.keys(refPrev.byCat) : []))).filter(function(n) { return !plan.products.some(function(x) { return x.name === n; }); }).sort(function(a, b) { return a.localeCompare(b, 'vi'); });

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-100">Kế hoạch TikTok</h1>
          <p className="text-xs text-slate-500 mt-0.5">Tổng doanh số → trần ADS + KOC → từng sản phẩm → giao việc từng shop và từng người → chia ra tuần và ngày. Chỉ admin xem được.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="month" value={month} onChange={function(e) { changeMonth(e.target.value); }} className="bg-slate-800 border border-slate-700 text-sm text-slate-200 rounded px-3 py-1.5" />
          <button className={btn} onClick={exportExcel}>Tải Excel</button>
          <button className={btnP} disabled={saving || !loaded || !dirty} onClick={save}>{saving ? 'Đang lưu…' : dirty ? 'Lưu kế hoạch' : 'Đã lưu'}</button>
        </div>
      </div>
      {msg && <p className={'text-sm ' + (/^(Lưu không|Không|Chưa)/.test(msg) ? 'text-rose-400' : 'text-emerald-400')}>{msg}</p>}
      {plan.updatedAt && <p className="text-xs text-slate-500 -mt-3">Lưu lần cuối {new Date(plan.updatedAt).toLocaleString('vi-VN')}{plan.updatedBy ? ' bởi ' + plan.updatedBy : ''}.</p>}

      {/* 1. Tham số */}
      <div className={card}>
        <h2 className="text-sm font-semibold text-gray-200 mb-3">1. Mục tiêu tổng và trần chi phí</h2>
        <div className="flex flex-wrap gap-5 items-end">
          <label className="text-xs text-slate-400">Tổng doanh số TikTok tháng (đ)<br />
            <NumInput value={plan.totalRevenue} width="w-44" onChange={function(n) { edit(function(p) { return Object.assign({}, p, { totalRevenue: n }); }); }} />
            <span className="ml-2 text-slate-500">{plan.totalRevenue > 0 ? '= ' + short(plan.totalRevenue) : ''}</span>
          </label>
          <label className="text-xs text-slate-400">Trần ADS + KOC (% doanh số)<br />
            <NumInput decimals value={plan.capPct} width="w-20" onChange={function(n) { edit(function(p) { return Object.assign({}, p, { capPct: n }); }); }} />
          </label>
          <label className="text-xs text-slate-400">Phí ship bình quân / gói gửi KOC (đ)<br />
            <NumInput value={plan.shipFee} width="w-24" onChange={function(n) { edit(function(p) { return Object.assign({}, p, { shipFee: n }); }); }} />
          </label>
          <label className="text-xs text-slate-400">Hệ số ngày sale (ngày 15, 25, ngày đôi)<br />
            <NumInput decimals value={plan.saleWeight} width="w-20" onChange={function(n) { edit(function(p) { return Object.assign({}, p, { saleWeight: n }); }); }} />
          </label>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/30"><p className="text-xs text-slate-400">Trần MKT ({pct(plan.capPct)})</p><p className="text-xl font-bold text-blue-400">{short(calc.mktCap)}</p></div>
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/30"><p className="text-xs text-slate-400">Hàng + ship gửi KOC</p><p className="text-xl font-bold text-amber-400">{short(calc.kocSpend)}</p><p className="text-xs text-slate-500">{pct(calc.kocPct)} doanh số</p></div>
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/30"><p className="text-xs text-slate-400">Ngân sách ADS (còn lại)</p><p className={'text-xl font-bold ' + (calc.overCap ? 'text-rose-400' : 'text-emerald-400')}>{short(calc.adsTotal)}</p><p className="text-xs text-slate-500">{pct(calc.adsPct)} doanh số</p></div>
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/30"><p className="text-xs text-slate-400">KOC cần book</p><p className="text-xl font-bold text-violet-400">{fmt(calc.kocTotal)}</p></div>
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/30"><p className="text-xs text-slate-400">Video cần lên</p><p className="text-xl font-bold text-pink-400">{fmt(calc.videoTotal)}</p></div>
        </div>
        {issues.length > 0 && (
          <ul className="mt-4 space-y-1 text-xs text-amber-400 list-disc pl-5">{issues.map(function(t, i) { return <li key={i}>{t}</li>; })}</ul>
        )}
        {issues.length === 0 && plan.totalRevenue > 0 && plan.products.length > 0 && <p className="mt-4 text-xs text-emerald-400">Kế hoạch khớp: ADS + KOC = {pct(calc.totalPct)} doanh số.</p>}
      </div>

      {/* 2. Sản phẩm */}
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-gray-200">2. Mục tiêu từng sản phẩm</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button className={btn} onClick={addSentLastMonth} disabled={!refPrev}>Thêm loại hàng đã gửi KOC tháng trước</button>
            <select value={addCat} onChange={function(e) { setAddCat(e.target.value); }} className="bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-2 py-1.5">
              <option value="">Chọn loại hàng…</option>
              {catOptions.map(function(n) { return <option key={n} value={n}>{n}</option>; })}
            </select>
            <button className={btn} disabled={!addCat} onClick={function() { addProduct(addCat); setAddCat(''); }}>Thêm</button>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-2">Sếp nhập doanh số, số KOC cần book và số video cho từng sản phẩm. Chi phí KOC = số KOC × (giá vốn gói gửi + ship). ADS còn lại = trần MKT của sản phẩm − chi phí KOC. Cột “Tháng trước” lấy từ báo cáo booking ({pm.slice(5)}/{pm.slice(0, 4)}).</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={th + ' text-left'}>Loại hàng</th>
                <th className={th + ' text-right'}>Doanh số (đ)</th>
                <th className={th + ' text-right'} title="KOC xác nhận / đã gửi / video lên của tháng trước">Tháng trước<br /><span className="font-normal">xác nhận / gửi / video</span></th>
                <th className={th + ' text-right'}>KOC book</th>
                <th className={th + ' text-right'}>Video lên</th>
                <th className={th + ' text-right'}>Giá vốn gói (đ)</th>
                <th className={th + ' text-right'}>Chi phí KOC</th>
                <th className={th + ' text-right'}>Trần MKT</th>
                <th className={th + ' text-right'}>ADS còn lại</th>
                <th className={th + ' text-right'}>ADS % / KOC %</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {plan.products.length === 0 && <tr><td colSpan={11} className="py-6 text-center text-slate-500">Chưa có sản phẩm. Bấm “Thêm loại hàng đã gửi KOC tháng trước” hoặc chọn loại hàng để thêm.</td></tr>}
              {plan.products.map(function(x, i) {
                const c = calc.products[i];
                const r = refPrev ? refPrev.byCat[x.name] : undefined;
                const sg = suggest(x.name);
                return (
                  <tr key={x.name} className="hover:bg-slate-800/40">
                    <td className="py-2 px-2 text-gray-200">{x.name}</td>
                    <td className="px-2 text-right"><NumInput value={x.revenue} width="w-32" onChange={function(n) { setProd(i, { revenue: n }); }} /></td>
                    <td className="px-2 text-right text-xs text-slate-400 whitespace-nowrap">{r ? r.confirmed + ' / ' + r.sent + ' / ' + r.video : '—'}</td>
                    <td className="px-2 text-right"><NumInput value={x.koc} width="w-16" onChange={function(n) { setProd(i, { koc: Math.round(n) }); }} /></td>
                    <td className="px-2 text-right"><NumInput value={x.video} width="w-16" onChange={function(n) { setProd(i, { video: Math.round(n) }); }} /></td>
                    <td className="px-2 text-right">
                      <NumInput value={x.kocCost} width="w-24" onChange={function(n) { setProd(i, { kocCost: n }); }} />
                      {sg.sku && <div className="text-[10px] text-slate-500 mt-0.5">gợi ý {sg.sku}{sg.cost ? ': ' + fmt(sg.cost) : ' (chưa có giá vốn)'}</div>}
                    </td>
                    <td className="px-2 text-right text-amber-300 whitespace-nowrap">{fmt(c.kocSpend)}</td>
                    <td className="px-2 text-right text-slate-300 whitespace-nowrap">{fmt(c.cap)}</td>
                    <td className={'px-2 text-right whitespace-nowrap font-medium ' + (c.over ? 'text-rose-400' : 'text-emerald-400')}>{fmt(c.ads)}</td>
                    <td className="px-2 text-right text-xs text-slate-400 whitespace-nowrap">{c.revenue > 0 ? pct(c.adsPct) + ' / ' + pct(c.kocPct) : '—'}</td>
                    <td className="px-2"><button className="text-slate-500 hover:text-rose-400" title="Bỏ sản phẩm này" onClick={function() { edit(function(p) { return Object.assign({}, p, { products: p.products.filter(function(_, j) { return j !== i; }) }); }); }}>✕</button></td>
                  </tr>
                );
              })}
              {plan.products.length > 0 && (
                <tr className="font-semibold border-t border-slate-600">
                  <td className="py-2 px-2 text-gray-100">Tổng</td>
                  <td className="px-2 text-right text-gray-100">{fmt(calc.prodRevenue)}</td>
                  <td></td>
                  <td className="px-2 text-right text-violet-300">{fmt(calc.kocTotal)}</td>
                  <td className="px-2 text-right text-pink-300">{fmt(calc.videoTotal)}</td>
                  <td></td>
                  <td className="px-2 text-right text-amber-300">{fmt(calc.kocSpend)}</td>
                  <td className="px-2 text-right text-slate-200">{fmt(calc.products.reduce(function(s, x) { return s + x.cap; }, 0))}</td>
                  <td className="px-2 text-right text-emerald-400">{fmt(calc.products.reduce(function(s, x) { return s + x.ads; }, 0))}</td>
                  <td></td><td></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Vận hành sàn */}
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-gray-200">3. Giao doanh số và ADS cho vận hành sàn (từng shop)</h2>
          <div className="flex flex-wrap gap-2">
            <button className={btn} onClick={function() { shopSplit('prev'); }}>Chia theo tỷ trọng tháng trước</button>
            <button className={btn} onClick={function() { shopSplit('equal'); }}>Chia đều</button>
            <button className={btn} onClick={applyKpi}>Áp dụng làm KPI tháng của shop</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr>
              <th className={th + ' text-left'}>Shop</th><th className={th + ' text-left'}>Người phụ trách</th>
              <th className={th + ' text-right'}>Tháng trước (đ)</th><th className={th + ' text-right'}>Doanh số giao (đ)</th><th className={th + ' text-right'}>Tỷ trọng</th><th className={th + ' text-right'}>Ngân sách ADS</th><th className={th + ' text-right'}>Mỗi người</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-800">
              {tiktokShops.map(function(s) {
                const owners = users.filter(function(u) { return s.assignedTo.indexOf(u.id) >= 0; });
                const rev = plan.shopRevenue[s.id] || 0;
                const ads = Math.max(0, calc.adsTotal) * adsShare(s.id);
                const n = Math.max(1, owners.length);
                return (
                  <tr key={s.id} className="hover:bg-slate-800/40">
                    <td className="py-2 px-2 text-gray-200">{s.name}</td>
                    <td className="px-2 text-slate-300 text-xs">{owners.length ? owners.map(function(u) { return u.name; }).join(', ') : <span className="text-amber-400">chưa gán người phụ trách</span>}</td>
                    <td className="px-2 text-right text-slate-400">{fmt(prevRevByShop[s.id] || 0)}</td>
                    <td className="px-2 text-right"><NumInput value={rev} width="w-36" onChange={function(v) { edit(function(p) { return Object.assign({}, p, { shopRevenue: Object.assign({}, p.shopRevenue, { [s.id]: v }) }); }); }} /></td>
                    <td className="px-2 text-right text-slate-400">{calc.shopSum > 0 ? pct(rev / calc.shopSum * 100) : '—'}</td>
                    <td className="px-2 text-right text-emerald-300">{fmt(ads)}</td>
                    <td className="px-2 text-right text-xs text-slate-400 whitespace-nowrap">{owners.length > 1 ? fmt(rev / n) + ' DS · ' + fmt(ads / n) + ' ADS' : '—'}</td>
                  </tr>
                );
              })}
              <tr className="font-semibold border-t border-slate-600">
                <td className="py-2 px-2 text-gray-100">Tổng</td><td></td><td className="px-2 text-right text-slate-300">{fmt(tiktokShops.reduce(function(s, x) { return s + (prevRevByShop[x.id] || 0); }, 0))}</td>
                <td className={'px-2 text-right ' + (Math.abs(calc.shopGap) > 1000 ? 'text-amber-400' : 'text-gray-100')}>{fmt(calc.shopSum)}</td><td></td><td className="px-2 text-right text-emerald-300">{fmt(Math.max(0, calc.adsTotal))}</td><td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Booking */}
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-gray-200">4. Giao chỉ tiêu KOC và video cho đội booking (từng người)</h2>
          <button className={btn} onClick={autoAlloc} disabled={plan.staff.length === 0 || plan.products.length === 0}>Chia đều KOC cho nhân sự</button>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {(snap ? khBookingStaff(snap) : plan.staff).map(function(n) {
            const on = plan.staff.indexOf(n) >= 0;
            return <button key={n} onClick={function() { toggleStaff(n); }} aria-pressed={on} className={'px-3 py-1 rounded-full text-xs border ' + (on ? 'bg-blue-600 text-white border-blue-500' : 'border-slate-600 text-slate-400')}>{n}</button>;
          })}
          <span className="text-xs text-slate-500 self-center">Chọn nhân sự tham gia tháng này</span>
        </div>
        {plan.staff.length === 0 || plan.products.length === 0 ? <p className="text-sm text-slate-500">Chọn nhân sự và thêm sản phẩm ở mục 2 để giao chỉ tiêu.</p> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr>
                  <th className={th + ' text-left'}>Loại hàng (KOC cần book)</th>
                  {plan.staff.map(function(n) { return <th key={n} className={th + ' text-right'}>{n}</th>; })}
                  <th className={th + ' text-right'}>Chênh</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-800">
                  {plan.products.map(function(x, i) {
                    const g = khAllocGap(plan, x);
                    return (
                      <tr key={x.name} className="hover:bg-slate-800/40">
                        <td className="py-2 px-2 text-gray-200">{x.name} <span className="text-xs text-slate-500">({x.koc} KOC, {x.video} video)</span></td>
                        {plan.staff.map(function(n) {
                          return <td key={n} className="px-2 text-right"><NumInput value={x.alloc[n] || 0} width="w-14" onChange={function(v) { setProd(i, { alloc: Object.assign({}, x.alloc, { [n]: Math.round(v) }) }); }} /></td>;
                        })}
                        <td className={'px-2 text-right text-xs ' + (g === 0 ? 'text-emerald-400' : 'text-amber-400')}>{g === 0 ? 'khớp' : g > 0 ? 'thiếu ' + g : 'thừa ' + (-g)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <h3 className="text-xs font-semibold text-slate-300 mt-4 mb-2">Mục tiêu tháng của từng người (video chia theo tỷ lệ KOC được giao)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr><th className={th + ' text-left'}>Nhân sự</th><th className={th + ' text-right'}>KOC cần book</th><th className={th + ' text-right'}>Video cần lên</th><th className={th + ' text-right'}>Chi phí hàng + ship gửi</th><th className={th + ' text-left'}>Theo sản phẩm</th></tr></thead>
                <tbody className="divide-y divide-slate-800">
                  {staffCalc.map(function(s) {
                    return (
                      <tr key={s.name} className="hover:bg-slate-800/40">
                        <td className="py-2 px-2 text-gray-200">{s.name}</td>
                        <td className="px-2 text-right text-violet-300 font-medium">{fmt(s.koc)}</td>
                        <td className="px-2 text-right text-pink-300 font-medium">{fmt(s.video)}</td>
                        <td className="px-2 text-right text-amber-300">{fmt(s.spend)}</td>
                        <td className="px-2 text-xs text-slate-400">{Object.keys(s.byProduct).map(function(n) { return n + ' ' + s.byProduct[n].koc + '/' + s.byProduct[n].video; }).join(' · ') || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* 5. Chẻ tuần và ngày */}
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-gray-200">5. Chia ra tuần và ngày để đo lường</h2>
          <div className="flex rounded-lg overflow-hidden border border-slate-700">
            {(['tuan', 'ngay'] as const).map(function(v) {
              return <button key={v} onClick={function() { setView(v); }} className={'px-3 py-1.5 text-sm ' + (view === v ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300')}>{v === 'tuan' ? 'Theo tuần' : 'Theo ngày'}</button>;
            })}
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3">Doanh số và ADS chia theo ngày (ngày sale nặng gấp {String(plan.saleWeight).replace('.', ',')} lần). KOC và video chia đều các ngày làm việc, không giao ngày Chủ nhật.</p>
        {view === 'tuan' ? (
          <div className="space-y-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr><th className={th + ' text-left'}>Tuần</th><th className={th + ' text-right'}>Doanh số</th><th className={th + ' text-right'}>ADS</th><th className={th + ' text-right'}>KOC book</th><th className={th + ' text-right'}>Video</th></tr></thead>
                <tbody className="divide-y divide-slate-800">
                  {weeks.map(function(w, i) {
                    return <tr key={i} className="hover:bg-slate-800/40"><td className="py-2 px-2 text-gray-200">{wLabel(i)}</td><td className="px-2 text-right text-slate-200">{fmt(weekRev[i])}</td><td className="px-2 text-right text-emerald-300">{fmt(weekAds[i])}</td><td className="px-2 text-right text-violet-300">{fmt(weekKoc[i])}</td><td className="px-2 text-right text-pink-300">{fmt(weekVideo[i])}</td></tr>;
                  })}
                  <tr className="font-semibold border-t border-slate-600"><td className="py-2 px-2 text-gray-100">Cả tháng</td><td className="px-2 text-right">{fmt(plan.totalRevenue)}</td><td className="px-2 text-right text-emerald-300">{fmt(Math.max(0, calc.adsTotal))}</td><td className="px-2 text-right text-violet-300">{fmt(calc.kocTotal)}</td><td className="px-2 text-right text-pink-300">{fmt(calc.videoTotal)}</td></tr>
                </tbody>
              </table>
            </div>
            {tiktokShops.length > 0 && (
              <div className="overflow-x-auto">
                <h3 className="text-xs font-semibold text-slate-300 mb-2">Vận hành sàn: doanh số / ADS theo tuần của từng shop</h3>
                <table className="w-full text-sm">
                  <thead><tr><th className={th + ' text-left'}>Shop</th>{weeks.map(function(_, i) { return <th key={i} className={th + ' text-right'}>{'Tuần ' + (i + 1)}</th>; })}</tr></thead>
                  <tbody className="divide-y divide-slate-800">
                    {tiktokShops.map(function(s) {
                      const rv = shopWeekRev(s.id), ad = shopWeekAds(s.id);
                      return <tr key={s.id}><td className="py-2 px-2 text-gray-200">{s.name}</td>{weeks.map(function(_, i) { return <td key={i} className="px-2 text-right text-xs whitespace-nowrap"><span className="text-slate-200">{short(rv[i])}</span> <span className="text-emerald-400">/ {short(ad[i])}</span></td>; })}</tr>;
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {plan.products.length > 0 && (
              <div className="overflow-x-auto">
                <h3 className="text-xs font-semibold text-slate-300 mb-2">Booking: KOC / video theo tuần của từng sản phẩm</h3>
                <table className="w-full text-sm">
                  <thead><tr><th className={th + ' text-left'}>Loại hàng</th>{weeks.map(function(_, i) { return <th key={i} className={th + ' text-right'}>{'Tuần ' + (i + 1)}</th>; })}<th className={th + ' text-right'}>Tháng</th></tr></thead>
                  <tbody className="divide-y divide-slate-800">
                    {plan.products.map(function(x) {
                      const k = khWeeklySplit(x.koc, days, nW), v = khWeeklySplit(x.video, days, nW);
                      return <tr key={x.name}><td className="py-2 px-2 text-gray-200">{x.name}</td>{weeks.map(function(_, i) { return <td key={i} className="px-2 text-right text-xs whitespace-nowrap text-slate-300">{k[i]} / {v[i]}</td>; })}<td className="px-2 text-right text-xs text-gray-100 whitespace-nowrap">{x.koc} / {x.video}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {staffCalc.length > 0 && (
              <div className="overflow-x-auto">
                <h3 className="text-xs font-semibold text-slate-300 mb-2">Booking: KOC / video theo tuần của từng người</h3>
                <table className="w-full text-sm">
                  <thead><tr><th className={th + ' text-left'}>Nhân sự</th>{weeks.map(function(_, i) { return <th key={i} className={th + ' text-right'}>{'Tuần ' + (i + 1)}</th>; })}<th className={th + ' text-right'}>Tháng</th></tr></thead>
                  <tbody className="divide-y divide-slate-800">
                    {staffCalc.map(function(s) {
                      const k = khWeeklySplit(s.koc, days, nW), v = khWeeklySplit(s.video, days, nW);
                      return <tr key={s.name}><td className="py-2 px-2 text-gray-200">{s.name}</td>{weeks.map(function(_, i) { return <td key={i} className="px-2 text-right text-xs whitespace-nowrap text-slate-300">{k[i]} / {v[i]}</td>; })}<td className="px-2 text-right text-xs text-gray-100 whitespace-nowrap">{s.koc} / {s.video}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr><th className={th + ' text-left'}>Ngày</th><th className={th + ' text-left'}>Loại</th><th className={th + ' text-right'}>Doanh số</th><th className={th + ' text-right'}>ADS</th><th className={th + ' text-right'}>KOC book</th><th className={th + ' text-right'}>Video</th></tr></thead>
              <tbody className="divide-y divide-slate-800">
                {days.map(function(d, i) {
                  const startWeek = i === 0 || days[i - 1].week !== d.week;
                  return (
                    <tr key={d.date} className={'hover:bg-slate-800/40 ' + (startWeek ? 'border-t-2 border-slate-600' : '') + (d.working ? '' : ' text-slate-600')}>
                      <td className="py-1.5 px-2 whitespace-nowrap">{DOW[d.dow]} {fd(d.date)}{startWeek && <span className="ml-2 text-[10px] text-blue-400">Tuần {d.week + 1}</span>}</td>
                      <td className="px-2 text-xs">{d.type === 'regular' ? '' : <span className="text-amber-400">Sale</span>}</td>
                      <td className="px-2 text-right">{fmt(d.revenue)}</td>
                      <td className="px-2 text-right text-emerald-300">{fmt(d.ads)}</td>
                      <td className="px-2 text-right text-violet-300">{d.working ? d.koc : '—'}</td>
                      <td className="px-2 text-right text-pink-300">{d.working ? d.video : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
