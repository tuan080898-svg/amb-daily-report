'use client';

// Kế hoạch TikTok theo từng bước: 1 Mục tiêu -> 2 Sản phẩm -> 3 Giao việc -> 4 Tuần & ngày.
// Thanh tóm tắt luôn hiện ở trên cùng; mỗi bước chỉ hiện nội dung của bước đó để dễ đọc.

import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAppState } from '@/lib/store';
import { dbGetCostBasic, dbGetKhTiktok, dbSaveKhTiktok } from '@/lib/db';
import { getAllSkuCodes, getSkuProducts, subscribeSkuMap } from '@/lib/sku';
import { BookingSnapshot, OTHER_PRODUCT, PRODUCT_CATEGORIES, canonicalProduct } from '@/lib/booking';
import {
  KhPlan, KhProduct, khAllocGap, khAutoAlloc, khBookingRef, khBookingStaff, khCalc, khDays, khDistribute, khNewPlan, khNewProduct, khStaffCalc, khTopSku, khWeeks,
} from '@/lib/ke-hoach-tiktok';

// ---------- định dạng ----------
function fmt(n: number): string { return Math.round(n).toLocaleString('vi-VN'); }
function short(n: number): string {
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a >= 1e9) return s + (a / 1e9).toFixed(2).replace('.', ',') + ' tỷ';
  if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e8 ? 0 : 1).replace('.', ',') + ' triệu';
  return s + fmt(a) + ' đ';
}
function pct(n: number): string { return n.toFixed(1).replace('.', ',') + '%'; }
function fd(d: string): string { return d.slice(8, 10) + '/' + d.slice(5, 7); }
function prevMonth(m: string): string {
  const y = parseInt(m.slice(0, 4), 10), mo = parseInt(m.slice(5, 7), 10);
  return mo === 1 ? (y - 1) + '-12' : y + '-' + (mo - 1 < 10 ? '0' + (mo - 1) : String(mo - 1));
}
function lastDay(m: string): string { return new Date(Date.UTC(parseInt(m.slice(0, 4), 10), parseInt(m.slice(5, 7), 10), 0)).toISOString().slice(0, 10); }
const DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

// ---------- thành phần giao diện nhỏ ----------
// Ô nhập số: có dấu chấm ngăn nghìn khi không gõ
function NumInput(p: { value: number; onChange: (n: number) => void; decimals?: boolean; width?: string; placeholder?: string; big?: boolean }) {
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
      className={'bg-slate-800 border border-slate-600 focus:border-blue-500 outline-none rounded-lg px-3 text-right text-gray-100 ' + (p.big ? 'py-2.5 text-lg ' : 'py-2 text-base ') + (p.width || 'w-full')} />
  );
}

function Field(p: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={'block ' + (p.className || '')}>
      <span className="block text-sm text-slate-300 mb-1.5">{p.label}</span>
      {p.children}
      {p.hint && <span className="block text-xs text-slate-500 mt-1.5">{p.hint}</span>}
    </label>
  );
}

// Thanh chia ngân sách: phần gửi KOC và phần ADS trong trần MKT
function SplitBar(p: { koc: number; ads: number; over?: boolean }) {
  const total = Math.max(1, p.koc + Math.max(0, p.ads));
  const k = Math.min(100, p.koc / total * 100);
  return (
    <div className="h-2.5 rounded-full bg-slate-700 overflow-hidden flex">
      {p.over ? <div className="bg-rose-500 w-full" /> : (<><div className="bg-amber-400" style={{ width: k + '%' }} /><div className="bg-emerald-500 flex-1" /></>)}
    </div>
  );
}

const card = 'bg-slate-900 border border-slate-700/60 rounded-2xl p-5 md:p-6';
const btn = 'px-4 py-2 text-sm rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800 disabled:opacity-40';
const btnP = 'px-5 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50';

type Tab = 1 | 2 | 3 | 4;
const TABS: Array<{ n: Tab; label: string }> = [{ n: 1, label: 'Mục tiêu' }, { n: 2, label: 'Sản phẩm' }, { n: 3, label: 'Giao việc' }, { n: 4, label: 'Tuần & ngày' }];

export default function KeHoachTiktokPage() {
  const { currentUser, shops, users, reports, monthlyKPIs, updateKPI } = useAppState();
  const now = new Date();
  const [month, setMonth] = useState(function() { const n = new Date(now.getFullYear(), now.getMonth() + 1, 1); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0'); }); // mặc định: tháng sau
  const [plan, setPlan] = useState<KhPlan>(khNewPlan(month));
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [snap, setSnap] = useState<BookingSnapshot | null>(null);
  const [cogs, setCogs] = useState<Record<string, number>>({});
  const [skuVer, setSkuVer] = useState(0);
  const [tab, setTab] = useState<Tab>(1);
  const [addCat, setAddCat] = useState('');
  const [openPerson, setOpenPerson] = useState('');
  const [showIssues, setShowIssues] = useState(false);
  const [subject, setSubject] = useState('all');
  const [view, setView] = useState<'tuan' | 'ngay'>('tuan');
  const initFor = useRef('');

  useEffect(function() { return subscribeSkuMap(function() { setSkuVer(function(v) { return v + 1; }); }); }, []);

  // Số liệu booking (để tham khảo) và giá vốn
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
    setLoaded(false); setDirty(false); setMsg(null);
    dbGetKhTiktok(month).then(function(p) {
      if (!alive) return;
      setPlan(p || khNewPlan(month));
      initFor.current = p ? month : '';
      setLoaded(true);
    }).catch(function(e) { if (alive) { setMsg({ ok: false, text: 'Không tải được kế hoạch: ' + (e instanceof Error ? e.message : '') }); setPlan(khNewPlan(month)); setLoaded(true); } });
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

  function edit(fn: (p: KhPlan) => KhPlan) { setPlan(function(p) { return fn(p); }); setDirty(true); setMsg(null); }
  function setProd(i: number, patch: Partial<KhProduct>) {
    edit(function(p) { return Object.assign({}, p, { products: p.products.map(function(x, j) { return j === i ? Object.assign({}, x, patch) : x; }) }); });
  }

  const calc = useMemo(function() { return khCalc(plan); }, [plan]);
  const staffCalc = useMemo(function() { return khStaffCalc(plan); }, [plan]);
  const weeks = useMemo(function() { return khWeeks(month); }, [month]);
  const days = useMemo(function() { return khDays(plan, calc); }, [plan, calc]);

  // ADS thực tế tháng trước của các shop TikTok (để so với kế hoạch)
  const prevActual = useMemo(function() {
    const ids = new Set(tiktokShops.map(function(s) { return s.id; }));
    const byShop: Record<string, number> = {}; let rev = 0, ads = 0;
    reports.forEach(function(r) {
      if (r.date.slice(0, 7) !== pm || !ids.has(r.shopId)) return;
      byShop[r.shopId] = (byShop[r.shopId] || 0) + (Number(r.actualRevenue) || 0);
      rev += Number(r.actualRevenue) || 0; ads += Number(r.adSpend) || 0;
    });
    return { byShop: byShop, rev: rev, ads: ads };
  }, [reports, pm, tiktokShops]);

  if (!currentUser || currentUser.role !== 'admin') return <div className="p-6 text-red-400">Bạn không có quyền truy cập trang này.</div>;

  // ---------- thao tác ----------
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
      const totalPrev = tiktokShops.reduce(function(s, x) { return s + (prevActual.byShop[x.id] || 0); }, 0);
      let used = 0;
      tiktokShops.forEach(function(s, i) {
        const share = mode === 'prev' && totalPrev > 0 ? (prevActual.byShop[s.id] || 0) / totalPrev : 1 / tiktokShops.length;
        const v = i === tiktokShops.length - 1 ? p.totalRevenue - used : Math.round(p.totalRevenue * share / 1000) * 1000;
        sr[s.id] = Math.max(0, v); used += v;
      });
      return Object.assign({}, p, { shopRevenue: sr });
    });
  }
  function toggleStaff(n: string) {
    edit(function(p) { return Object.assign({}, p, { staff: p.staff.indexOf(n) >= 0 ? p.staff.filter(function(x) { return x !== n; }) : p.staff.concat([n]) }); });
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const saved = await dbSaveKhTiktok(Object.assign({}, plan, { updatedBy: currentUser ? currentUser.name : '' }));
      setPlan(saved); setDirty(false);
      setMsg({ ok: true, text: 'Đã lưu kế hoạch tháng ' + month.slice(5) + '/' + month.slice(0, 4) + '.' });
    } catch (e) { setMsg({ ok: false, text: 'Lưu không thành công: ' + (e instanceof Error ? e.message : '') }); }
    setSaving(false);
  }

  function applyKpi() {
    const rows = tiktokShops.filter(function(s) { return (plan.shopRevenue[s.id] || 0) > 0; });
    if (rows.length === 0) { setMsg({ ok: false, text: 'Chưa có doanh số giao cho shop nào.' }); return; }
    const lines = rows.map(function(s) {
      const old = monthlyKPIs.find(function(k) { return k.shopId === s.id && k.month === month; });
      return s.name + ': ' + fmt(old ? old.kpiAmount : 0) + ' → ' + fmt(plan.shopRevenue[s.id]);
    });
    if (!window.confirm('Cập nhật KPI doanh số tháng ' + month + ' của các shop TikTok (cũ → mới):\n\n' + lines.join('\n') + '\n\nĐồng ý?')) return;
    rows.forEach(function(s) { updateKPI({ shopId: s.id, month: month, kpiAmount: plan.shopRevenue[s.id] }); });
    setMsg({ ok: true, text: 'Đã cập nhật KPI doanh số tháng ' + month + ' cho ' + rows.length + ' shop.' });
  }

  function changeMonth(m: string) {
    if (!m || m === month) return;
    if (dirty && !window.confirm('Kế hoạch đang sửa chưa lưu. Đổi tháng sẽ mất các thay đổi này. Đổi tháng?')) return;
    setMonth(m);
  }

  // ---------- số liệu hiển thị ----------
  const adsShare = function(shopId: string): number { return calc.shopSum > 0 ? (plan.shopRevenue[shopId] || 0) / calc.shopSum : 0; };
  const ownersOf = function(shopId: string): string[] {
    const s = tiktokShops.find(function(x) { return x.id === shopId; });
    return s ? users.filter(function(u) { return s.assignedTo.indexOf(u.id) >= 0; }).map(function(u) { return u.name; }) : [];
  };

  // Các điểm cần xem, kèm bước để sửa
  const issues: Array<{ tab: Tab; text: string }> = [];
  if (plan.totalRevenue <= 0) issues.push({ tab: 1, text: 'Chưa nhập tổng doanh số tháng.' });
  if (plan.totalRevenue > 0 && plan.products.length === 0) issues.push({ tab: 2, text: 'Chưa có sản phẩm nào.' });
  if (plan.totalRevenue > 0 && plan.products.length > 0 && Math.abs(calc.revenueGap) > 1000) issues.push({ tab: 2, text: 'Doanh số các sản phẩm ' + (calc.revenueGap > 0 ? 'đang thiếu ' : 'đang vượt ') + short(Math.abs(calc.revenueGap)) + ' so với tổng doanh số tháng.' });
  calc.products.filter(function(x) { return x.over; }).forEach(function(x) { issues.push({ tab: 2, text: x.name + ': chi phí gửi KOC (' + short(x.kocSpend) + ') vượt trần MKT của sản phẩm (' + short(x.cap) + ').' }); });
  plan.products.forEach(function(x) { if (x.koc > 0 && !x.kocCost) issues.push({ tab: 2, text: x.name + ': chưa có giá vốn gói gửi KOC, chi phí đang chỉ tính tiền ship.' }); });
  if (plan.totalRevenue > 0 && tiktokShops.length > 0 && Math.abs(calc.shopGap) > 1000) issues.push({ tab: 3, text: 'Doanh số giao các shop ' + (calc.shopGap > 0 ? 'đang thiếu ' : 'đang vượt ') + short(Math.abs(calc.shopGap)) + ' so với tổng doanh số tháng.' });
  plan.products.forEach(function(x) { const g = khAllocGap(plan, x); if (x.koc > 0 && plan.staff.length > 0 && g !== 0) issues.push({ tab: 3, text: x.name + ': ' + (g > 0 ? 'còn ' + g + ' KOC chưa giao cho ai.' : 'giao thừa ' + (-g) + ' KOC.') }); });
  const issuesByTab = function(t: Tab): number { return issues.filter(function(i) { return i.tab === t; }).length; };

  // Chuỗi theo ngày cho từng đối tượng ở bước 4
  type Metric = 'rev' | 'ads' | 'koc' | 'video';
  const METRIC_LABEL: Record<Metric, string> = { rev: 'Doanh số', ads: 'ADS', koc: 'KOC book', video: 'Video' };
  function subjectInfo(key: string): { title: string; totals: Partial<Record<Metric, number>> } {
    if (key.indexOf('shop:') === 0) {
      const id = key.slice(5); const s = tiktokShops.find(function(x) { return x.id === id; });
      return { title: s ? s.name : 'Shop', totals: { rev: plan.shopRevenue[id] || 0, ads: Math.max(0, calc.adsTotal) * adsShare(id) } };
    }
    if (key.indexOf('prod:') === 0) {
      const c = calc.products.find(function(x) { return x.name === key.slice(5); });
      return { title: key.slice(5), totals: c ? { rev: c.revenue, ads: Math.max(0, c.ads), koc: c.koc, video: c.video } : {} };
    }
    if (key.indexOf('staff:') === 0) {
      const s = staffCalc.find(function(x) { return x.name === key.slice(6); });
      return { title: key.slice(6), totals: s ? { koc: s.koc, video: s.video } : {} };
    }
    return { title: 'Toàn bộ TikTok', totals: { rev: plan.totalRevenue, ads: Math.max(0, calc.adsTotal), koc: calc.kocTotal, video: calc.videoTotal } };
  }
  const subj = subjectInfo(subject);
  const metrics = (['rev', 'ads', 'koc', 'video'] as Metric[]).filter(function(m) { return subj.totals[m] !== undefined; });
  const series: Record<string, number[]> = {};
  metrics.forEach(function(m) {
    const isMoney = m === 'rev' || m === 'ads';
    series[m] = khDistribute(subj.totals[m] || 0, days.map(function(d) { return isMoney ? (d.type === 'regular' ? 1 : Math.max(0.1, plan.saleWeight || 1)) : (d.working ? 1 : 0); }));
  });
  const cell = function(m: Metric, v: number): string { return m === 'rev' || m === 'ads' ? short(v) : fmt(v); };
  const todayStr = new Date(now.getTime() + 7 * 3600e3 - now.getTimezoneOffset() * 0).toISOString().slice(0, 10);

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    const a1: Array<Array<string | number>> = [
      ['Kế hoạch TikTok tháng', month], [],
      ['Tổng doanh số', plan.totalRevenue], ['Trần ADS + KOC (%)', plan.capPct], ['Trần MKT (đ)', calc.mktCap],
      ['Chi phí hàng + ship gửi KOC', calc.kocSpend], ['Ngân sách ADS', calc.adsTotal], ['Phí ship / gói', plan.shipFee], [],
      ['Shop', 'Người phụ trách', 'Doanh số', 'Ngân sách ADS'],
    ];
    tiktokShops.forEach(function(s) { a1.push([s.name, ownersOf(s.id).join(', '), plan.shopRevenue[s.id] || 0, Math.round(Math.max(0, calc.adsTotal) * adsShare(s.id))]); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a1), 'Tong quan');
    const a2: Array<Array<string | number>> = [['Loại hàng', 'Doanh số', 'Trần MKT', 'KOC cần book', 'Video cần lên', 'Giá vốn gói', 'Chi phí 1 KOC', 'Chi phí KOC', 'ADS còn lại', 'ADS %', 'KOC %']];
    calc.products.forEach(function(x, i) { a2.push([x.name, x.revenue, Math.round(x.cap), x.koc, x.video, plan.products[i].kocCost, x.unit, Math.round(x.kocSpend), Math.round(x.ads), Math.round(x.adsPct * 10) / 10, Math.round(x.kocPct * 10) / 10]); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a2), 'San pham');
    const a3: Array<Array<string | number>> = [['Nhân sự booking', 'Loại hàng', 'KOC cần book', 'Video cần lên']];
    staffCalc.forEach(function(s) {
      Object.keys(s.byProduct).forEach(function(n) { a3.push([s.name, n, s.byProduct[n].koc, s.byProduct[n].video]); });
      a3.push([s.name + ' (tổng)', '', s.koc, s.video]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a3), 'Booking nhan su');
    const wk = function(arr: number[], w: number): number { let s = 0; days.forEach(function(d, i) { if (d.week === w) s += arr[i]; }); return s; };
    const allSeries: Record<string, number[]> = {
      rev: khDistribute(plan.totalRevenue, days.map(function(d) { return d.type === 'regular' ? 1 : Math.max(0.1, plan.saleWeight || 1); })),
      ads: khDistribute(Math.max(0, calc.adsTotal), days.map(function(d) { return d.type === 'regular' ? 1 : Math.max(0.1, plan.saleWeight || 1); })),
      koc: days.map(function(d) { return d.koc; }), video: days.map(function(d) { return d.video; }),
    };
    const a4: Array<Array<string | number>> = [['Tuần', 'Từ', 'Đến', 'Doanh số', 'ADS', 'KOC book', 'Video']];
    weeks.forEach(function(w, i) { a4.push([i + 1, w.from, w.to, wk(allSeries.rev, i), wk(allSeries.ads, i), wk(allSeries.koc, i), wk(allSeries.video, i)]); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a4), 'Theo tuan');
    const a5: Array<Array<string | number>> = [['Ngày', 'Thứ', 'Loại ngày', 'Doanh số', 'ADS', 'KOC book', 'Video']];
    days.forEach(function(d, i) { a5.push([d.date, DOW[d.dow], d.type === 'regular' ? 'Thường' : 'Sale', allSeries.rev[i], allSeries.ads[i], d.koc, d.video]); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a5), 'Theo ngay');
    XLSX.writeFile(wb, 'ke-hoach-tiktok-' + month + '.xlsx');
  }

  const catOptions = Array.from(new Set(PRODUCT_CATEGORIES.concat(refPrev ? Object.keys(refPrev.byCat) : []))).filter(function(n) { return !plan.products.some(function(x) { return x.name === n; }); }).sort(function(a, b) { return a.localeCompare(b, 'vi'); });
  const prevAdsPct = prevActual.rev > 0 ? prevActual.ads / prevActual.rev * 100 : 0;
  const hasPlan = plan.totalRevenue > 0;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4 text-[15px]">
      {/* Đầu trang */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Kế hoạch TikTok</h1>
          <p className="text-sm text-slate-400 mt-0.5">Đi lần lượt 4 bước. Số liệu tổng hợp luôn hiện ở thanh bên dưới.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="month" value={month} onChange={function(e) { changeMonth(e.target.value); }} className="bg-slate-800 border border-slate-600 text-slate-100 rounded-lg px-3 py-2" />
          <button className={btn} onClick={exportExcel}>Tải Excel</button>
          <button className={btnP} disabled={saving || !loaded || !dirty} onClick={save}>{saving ? 'Đang lưu…' : dirty ? 'Lưu kế hoạch' : 'Đã lưu'}</button>
        </div>
      </div>
      {msg && <p className={'text-sm ' + (msg.ok ? 'text-emerald-400' : 'text-rose-400')}>{msg.text}</p>}

      {/* Thanh tóm tắt (luôn hiện) */}
      <div className="sticky top-14 md:top-0 z-30 bg-slate-950/95 backdrop-blur py-2 -mx-1 px-1">
        <div className="bg-slate-900 border border-slate-600/70 rounded-2xl p-3 md:p-4 shadow-lg">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
            <div><p className="text-xs text-slate-400">Doanh số tháng</p><p className="text-xl font-bold text-gray-100">{hasPlan ? short(plan.totalRevenue) : '—'}</p></div>
            <div><p className="text-xs text-slate-400">ADS + KOC ({pct(plan.capPct)})</p><p className="text-xl font-bold text-blue-300">{hasPlan ? short(calc.mktCap) : '—'}</p></div>
            <div><p className="text-xs text-slate-400">Gửi KOC {hasPlan && <span className="text-slate-500">· {pct(calc.kocPct)}</span>}</p><p className="text-xl font-bold text-amber-300">{hasPlan ? short(calc.kocSpend) : '—'}</p></div>
            <div><p className="text-xs text-slate-400">Còn lại cho ADS {hasPlan && <span className="text-slate-500">· {pct(calc.adsPct)}</span>}</p><p className={'text-xl font-bold ' + (calc.overCap ? 'text-rose-400' : 'text-emerald-300')}>{hasPlan ? short(calc.adsTotal) : '—'}</p></div>
          </div>
          {hasPlan && <div className="mt-2"><SplitBar koc={calc.kocSpend} ads={calc.adsTotal} over={calc.overCap} /></div>}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-300">KOC cần book <b className="text-violet-300">{fmt(calc.kocTotal)}</b> · Video cần lên <b className="text-pink-300">{fmt(calc.videoTotal)}</b></p>
            {issues.length === 0
              ? <span className="text-sm text-emerald-400 font-medium">✓ Kế hoạch khớp</span>
              : <button onClick={function() { setShowIssues(!showIssues); }} className="text-sm text-amber-300 font-medium hover:underline">⚠ {issues.length} điểm cần xem {showIssues ? '▲' : '▼'}</button>}
          </div>
          {showIssues && issues.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t border-slate-700 pt-3">
              {issues.map(function(it, i) {
                return <li key={i} className="flex items-start gap-2 text-sm text-amber-200"><span>•</span><span className="flex-1">{it.text}</span><button onClick={function() { setTab(it.tab); }} className="text-xs text-blue-400 hover:underline whitespace-nowrap">Sửa ở bước {it.tab}</button></li>;
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Các bước */}
      <div className="grid grid-cols-4 gap-2">
        {TABS.map(function(t) {
          const on = tab === t.n, bad = issuesByTab(t.n);
          return (
            <button key={t.n} onClick={function() { setTab(t.n); }} aria-pressed={on}
              className={'rounded-xl border px-2 py-3 text-center transition-colors ' + (on ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800')}>
              <span className={'block text-xs ' + (on ? 'text-blue-100' : 'text-slate-500')}>Bước {t.n}</span>
              <span className="block text-sm md:text-base font-medium">{t.label}</span>
              {bad > 0 && <span className={'inline-block mt-1 text-[11px] px-2 rounded-full ' + (on ? 'bg-white/20 text-white' : 'bg-amber-500/20 text-amber-300')}>⚠ {bad}</span>}
            </button>
          );
        })}
      </div>

      {/* ===== Bước 1: Mục tiêu ===== */}
      {tab === 1 && (
        <div className={card}>
          <h2 className="text-lg font-semibold text-gray-100">Bước 1. Đặt mục tiêu chung</h2>
          <p className="text-sm text-slate-400 mt-1 mb-5">Chỉ cần nhập tổng doanh số. Các ô còn lại đã có sẵn số mặc định.</p>
          <div className="grid md:grid-cols-2 gap-5">
            <Field label="Tổng doanh số TikTok cả tháng (đ)" hint={hasPlan ? '= ' + short(plan.totalRevenue) : 'Ví dụ: 3.000.000.000'}>
              <NumInput big value={plan.totalRevenue} onChange={function(n) { edit(function(p) { return Object.assign({}, p, { totalRevenue: n }); }); }} />
            </Field>
            <Field label="Trần chi phí ADS + gửi KOC (% doanh số)" hint={hasPlan ? '= tối đa ' + short(calc.mktCap) + ' cả tháng' : undefined}>
              <NumInput big decimals value={plan.capPct} onChange={function(n) { edit(function(p) { return Object.assign({}, p, { capPct: n }); }); }} />
            </Field>
            <Field label="Phí ship bình quân mỗi gói gửi KOC (đ)">
              <NumInput value={plan.shipFee} onChange={function(n) { edit(function(p) { return Object.assign({}, p, { shipFee: n }); }); }} />
            </Field>
            <Field label="Ngày sale tính nặng gấp mấy lần ngày thường" hint="Áp dụng cho ngày 15, ngày 25 và ngày đôi (12/12…) khi chia doanh số theo ngày.">
              <NumInput decimals value={plan.saleWeight} onChange={function(n) { edit(function(p) { return Object.assign({}, p, { saleWeight: n }); }); }} />
            </Field>
          </div>
          <div className="mt-6 rounded-xl bg-slate-800/60 border border-slate-700/50 p-4 text-sm text-slate-300 space-y-1.5">
            <p className="font-medium text-slate-200">Hệ thống tính như sau</p>
            <p>① Trần chi phí = tổng doanh số × {pct(plan.capPct)}.</p>
            <p>② Chi phí gửi KOC của một sản phẩm = số KOC × (giá vốn hàng gửi + {fmt(plan.shipFee)} đ ship).</p>
            <p>③ Phần còn lại của trần là ngân sách ADS giao cho vận hành sàn.</p>
            <p className="text-xs text-slate-400 pt-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />Vàng: gửi KOC <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1 ml-3" />Xanh: ADS. Thanh màu trên cùng cho thấy trần được chia thế nào.</p>
          </div>
          {prevActual.rev > 0 && (
            <div className="mt-3 rounded-xl bg-slate-800/60 border border-slate-700/50 p-4 text-sm text-slate-300">
              <span className="font-medium text-slate-200">So với tháng trước:</span> ADS thực tế {pct(prevAdsPct)} doanh số ({short(prevActual.ads)} trên {short(prevActual.rev)}).
              {hasPlan && <> Kế hoạch này dành cho ADS {pct(calc.adsPct)} và gửi KOC {pct(calc.kocPct)}.</>}
            </div>
          )}
          <div className="mt-5 flex justify-end"><button className={btnP} onClick={function() { setTab(2); }}>Tiếp: Sản phẩm →</button></div>
        </div>
      )}

      {/* ===== Bước 2: Sản phẩm ===== */}
      {tab === 2 && (
        <div className="space-y-4">
          <div className={card}>
            <h2 className="text-lg font-semibold text-gray-100">Bước 2. Mục tiêu từng sản phẩm</h2>
            <p className="text-sm text-slate-400 mt-1">Với mỗi sản phẩm, Sếp nhập doanh số, số KOC cần book và số video cần lên. Hệ thống tự tính phần ADS còn lại.</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button className={btn} onClick={addSentLastMonth} disabled={!refPrev}>＋ Thêm các sản phẩm đã gửi KOC tháng trước</button>
              <select value={addCat} onChange={function(e) { setAddCat(e.target.value); }} className="bg-slate-800 border border-slate-600 text-slate-200 rounded-lg px-3 py-2">
                <option value="">Hoặc chọn một sản phẩm…</option>
                {catOptions.map(function(n) { return <option key={n} value={n}>{n}</option>; })}
              </select>
              <button className={btn} disabled={!addCat} onClick={function() { addProduct(addCat); setAddCat(''); }}>Thêm</button>
            </div>
          </div>

          {plan.products.length === 0 && <div className={card + ' text-center text-slate-400'}>Chưa có sản phẩm. Bấm “Thêm các sản phẩm đã gửi KOC tháng trước” để bắt đầu.</div>}

          {plan.products.map(function(x, i) {
            const c = calc.products[i];
            const r = refPrev ? refPrev.byCat[x.name] : undefined;
            const sg = suggest(x.name);
            return (
              <div key={x.name} className={card}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-gray-100">{x.name}</h3>
                    {r && <p className="text-xs text-slate-500 mt-0.5">Tháng trước: {r.sent} KOC đã gửi · {r.video} video lên</p>}
                  </div>
                  <button className="text-slate-500 hover:text-rose-400 text-sm" onClick={function() { edit(function(p) { return Object.assign({}, p, { products: p.products.filter(function(_, j) { return j !== i; }) }); }); }}>Bỏ ✕</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                  <Field label="Doanh số (đ)" hint={x.revenue > 0 ? '= ' + short(x.revenue) : undefined}><NumInput value={x.revenue} onChange={function(n) { setProd(i, { revenue: n }); }} /></Field>
                  <Field label="KOC cần book"><NumInput value={x.koc} onChange={function(n) { setProd(i, { koc: Math.round(n) }); }} /></Field>
                  <Field label="Video cần lên"><NumInput value={x.video} onChange={function(n) { setProd(i, { video: Math.round(n) }); }} /></Field>
                </div>
                <div className="mt-4 rounded-xl bg-slate-800/50 border border-slate-700/50 p-4">
                  <SplitBar koc={c.kocSpend} ads={c.ads} over={c.over} />
                  <div className="grid grid-cols-3 gap-3 mt-3 text-center">
                    <div><p className="text-xs text-slate-400">Trần ADS + KOC</p><p className="text-base font-semibold text-slate-100">{c.revenue > 0 ? short(c.cap) : '—'}</p></div>
                    <div><p className="text-xs text-slate-400">Gửi {c.koc} KOC</p><p className="text-base font-semibold text-amber-300">{c.koc > 0 ? short(c.kocSpend) : '—'}</p></div>
                    <div><p className="text-xs text-slate-400">Còn lại cho ADS</p><p className={'text-base font-semibold ' + (c.over ? 'text-rose-400' : 'text-emerald-300')}>{c.revenue > 0 ? short(c.ads) : '—'}</p></div>
                  </div>
                  {c.over && <p className="text-sm text-rose-300 mt-2">Chi phí gửi KOC vượt trần của sản phẩm này. Hãy giảm số KOC hoặc tăng doanh số.</p>}
                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-700/60 text-sm text-slate-400">
                    <span>Giá vốn một gói gửi KOC:</span>
                    <NumInput value={x.kocCost} width="w-32" onChange={function(n) { setProd(i, { kocCost: n }); }} />
                    <span>đ</span>
                    {sg.sku && <span className="text-xs text-slate-500">gợi ý theo mã {sg.sku}{sg.cost ? ': ' + fmt(sg.cost) + ' đ' : ' (chưa có giá vốn trong app)'}</span>}
                  </div>
                </div>
              </div>
            );
          })}

          {plan.products.length > 0 && (
            <div className={card + ' flex flex-wrap items-center justify-between gap-3'}>
              <div><p className="text-xs text-slate-400">Tổng {plan.products.length} sản phẩm</p><p className="text-lg font-semibold text-gray-100">{short(calc.prodRevenue)}</p></div>
              <div><p className="text-xs text-slate-400">So với doanh số tháng</p><p className={'text-lg font-semibold ' + (Math.abs(calc.revenueGap) > 1000 ? 'text-amber-300' : 'text-emerald-300')}>{Math.abs(calc.revenueGap) > 1000 ? (calc.revenueGap > 0 ? 'thiếu ' : 'vượt ') + short(Math.abs(calc.revenueGap)) : 'khớp'}</p></div>
              <div><p className="text-xs text-slate-400">KOC · Video</p><p className="text-lg font-semibold text-gray-100">{fmt(calc.kocTotal)} · {fmt(calc.videoTotal)}</p></div>
              <button className={btnP} onClick={function() { setTab(3); }}>Tiếp: Giao việc →</button>
            </div>
          )}
        </div>
      )}

      {/* ===== Bước 3: Giao việc ===== */}
      {tab === 3 && (
        <div className="space-y-4">
          <div className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-gray-100">Bước 3a. Vận hành sàn: giao doanh số và ADS cho từng shop</h2>
                <p className="text-sm text-slate-400 mt-1">Tổng giao cho các shop cần bằng {hasPlan ? short(plan.totalRevenue) : 'tổng doanh số tháng'}.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={btn} onClick={function() { shopSplit('prev'); }}>Chia theo tỷ trọng tháng trước</button>
                <button className={btn} onClick={function() { shopSplit('equal'); }}>Chia đều</button>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-4 mt-4">
              {tiktokShops.map(function(s) {
                const owners = ownersOf(s.id);
                const rev = plan.shopRevenue[s.id] || 0;
                const ads = Math.max(0, calc.adsTotal) * adsShare(s.id);
                return (
                  <div key={s.id} className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-4">
                    <p className="text-base font-semibold text-gray-100">{s.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{owners.length ? 'Phụ trách: ' + owners.join(', ') : <span className="text-amber-400">Chưa gán người phụ trách</span>}</p>
                    <div className="mt-3"><Field label="Doanh số giao (đ)" hint={rev > 0 ? '= ' + short(rev) + (calc.shopSum > 0 ? ' (' + pct(rev / calc.shopSum * 100) + ')' : '') : undefined}>
                      <NumInput value={rev} onChange={function(v) { edit(function(p) { return Object.assign({}, p, { shopRevenue: Object.assign({}, p.shopRevenue, { [s.id]: v }) }); }); }} />
                    </Field></div>
                    <div className="mt-3 pt-3 border-t border-slate-700/60 flex items-baseline justify-between">
                      <span className="text-sm text-slate-400">Ngân sách ADS</span><span className="text-lg font-semibold text-emerald-300">{rev > 0 ? short(ads) : '—'}</span>
                    </div>
                    {prevActual.byShop[s.id] > 0 && <p className="text-xs text-slate-500 mt-1">Tháng trước thực tế: {short(prevActual.byShop[s.id])}</p>}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className={Math.abs(calc.shopGap) > 1000 ? 'text-amber-300' : 'text-emerald-300'}>{Math.abs(calc.shopGap) > 1000 ? 'Đang ' + (calc.shopGap > 0 ? 'thiếu ' : 'vượt ') + short(Math.abs(calc.shopGap)) + ' so với tổng doanh số tháng' : '✓ Khớp với tổng doanh số tháng'}</span>
              <button className={btn} onClick={applyKpi}>Áp dụng làm KPI tháng của các shop</button>
            </div>
          </div>

          <div className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-gray-100">Bước 3b. Đội booking: giao KOC và video cho từng người</h2>
                <p className="text-sm text-slate-400 mt-1">Bấm tên để chọn ai tham gia tháng này. Bấm “Chia đều” rồi chỉnh lại từng người nếu cần.</p>
              </div>
              <button className={btn} disabled={plan.staff.length === 0 || plan.products.length === 0} onClick={function() { edit(function(p) { return Object.assign({}, p, { products: khAutoAlloc(p) }); }); }}>Chia đều KOC</button>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              {(snap ? khBookingStaff(snap) : plan.staff).map(function(n) {
                const on = plan.staff.indexOf(n) >= 0;
                return <button key={n} onClick={function() { toggleStaff(n); }} aria-pressed={on} className={'px-4 py-1.5 rounded-full text-sm border ' + (on ? 'bg-blue-600 text-white border-blue-500' : 'border-slate-600 text-slate-400 hover:bg-slate-800')}>{on ? '✓ ' : ''}{n}</button>;
              })}
            </div>
            {plan.products.length === 0 || plan.staff.length === 0 ? <p className="text-sm text-slate-500 mt-4">Thêm sản phẩm ở bước 2 và chọn nhân sự để giao chỉ tiêu.</p> : (
              <>
                {plan.products.some(function(x) { return x.koc > 0 && khAllocGap(plan, x) !== 0; }) && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {plan.products.filter(function(x) { return x.koc > 0 && khAllocGap(plan, x) !== 0; }).map(function(x) {
                      const g = khAllocGap(plan, x);
                      return <span key={x.name} className="text-xs px-3 py-1 rounded-full bg-amber-500/15 text-amber-300">{x.name}: {g > 0 ? 'còn ' + g + ' KOC chưa giao' : 'thừa ' + (-g) + ' KOC'}</span>;
                    })}
                  </div>
                )}
                <div className="grid md:grid-cols-2 gap-4 mt-4">
                  {staffCalc.map(function(s) {
                    const open = openPerson === s.name;
                    return (
                      <div key={s.name} className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-4">
                        <div className="flex items-center justify-between">
                          <p className="text-base font-semibold text-gray-100">{s.name}</p>
                          <button onClick={function() { setOpenPerson(open ? '' : s.name); }} className="text-sm text-blue-400 hover:underline">{open ? 'Thu gọn ▲' : 'Chỉnh theo sản phẩm ▼'}</button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                          <div><p className="text-xs text-slate-400">KOC book</p><p className="text-2xl font-bold text-violet-300">{fmt(s.koc)}</p></div>
                          <div><p className="text-xs text-slate-400">Video lên</p><p className="text-2xl font-bold text-pink-300">{fmt(s.video)}</p></div>
                          <div><p className="text-xs text-slate-400">Chi phí gửi</p><p className="text-lg font-semibold text-amber-300 pt-1.5">{short(s.spend)}</p></div>
                        </div>
                        {open && (
                          <div className="mt-3 pt-3 border-t border-slate-700/60 space-y-2">
                            {plan.products.map(function(x, i) {
                              return (
                                <div key={x.name} className="flex items-center justify-between gap-3">
                                  <span className="text-sm text-slate-200 flex-1">{x.name} <span className="text-xs text-slate-500">(cần {x.koc})</span></span>
                                  <NumInput value={x.alloc[s.name] || 0} width="w-20" onChange={function(v) { setProd(i, { alloc: Object.assign({}, x.alloc, { [s.name]: Math.round(v) }) }); }} />
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {!open && Object.keys(s.byProduct).length > 0 && <p className="text-xs text-slate-500 mt-3">{Object.keys(s.byProduct).map(function(n) { return n + ' ' + s.byProduct[n].koc; }).join(' · ')}</p>}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end"><button className={btnP} onClick={function() { setTab(4); }}>Tiếp: Tuần & ngày →</button></div>
        </div>
      )}

      {/* ===== Bước 4: Tuần & ngày ===== */}
      {tab === 4 && (
        <div className={card}>
          <h2 className="text-lg font-semibold text-gray-100">Bước 4. Chia ra tuần và ngày để đo lường</h2>
          <p className="text-sm text-slate-400 mt-1">Chọn đối tượng muốn xem. Doanh số và ADS chia theo ngày (ngày sale nặng gấp {String(plan.saleWeight).replace('.', ',')} lần); KOC và video chia đều các ngày làm việc, không giao Chủ nhật.</p>
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <select value={subject} onChange={function(e) { setSubject(e.target.value); }} className="bg-slate-800 border border-slate-600 text-slate-100 rounded-lg px-3 py-2 min-w-[14rem]">
              <option value="all">Toàn bộ TikTok</option>
              {tiktokShops.length > 0 && <optgroup label="Theo shop (vận hành sàn)">{tiktokShops.map(function(s) { return <option key={s.id} value={'shop:' + s.id}>{s.name}</option>; })}</optgroup>}
              {plan.products.length > 0 && <optgroup label="Theo sản phẩm">{plan.products.map(function(x) { return <option key={x.name} value={'prod:' + x.name}>{x.name}</option>; })}</optgroup>}
              {plan.staff.length > 0 && <optgroup label="Theo nhân sự booking">{plan.staff.map(function(n) { return <option key={n} value={'staff:' + n}>{n}</option>; })}</optgroup>}
            </select>
            <div className="flex rounded-lg overflow-hidden border border-slate-600">
              {(['tuan', 'ngay'] as const).map(function(v) {
                return <button key={v} onClick={function() { setView(v); }} className={'px-4 py-2 text-sm ' + (view === v ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300')}>{v === 'tuan' ? 'Theo tuần' : 'Theo ngày'}</button>;
              })}
            </div>
          </div>
          <p className="text-base font-medium text-slate-100 mt-5 mb-2">{subj.title}</p>
          {metrics.length === 0 ? <p className="text-sm text-slate-500">Chưa có số liệu cho đối tượng này.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-sm text-slate-400 border-b border-slate-700">
                    <th className="text-left font-medium py-2.5 pr-3">{view === 'tuan' ? 'Tuần' : 'Ngày'}</th>
                    {metrics.map(function(m) { return <th key={m} className="text-right font-medium py-2.5 px-3">{METRIC_LABEL[m]}</th>; })}
                  </tr>
                </thead>
                <tbody>
                  {view === 'tuan' ? weeks.map(function(w, wi) {
                    const current = todayStr >= w.from && todayStr <= w.to;
                    return (
                      <tr key={wi} className={'border-b border-slate-800 ' + (current ? 'bg-blue-500/10' : '')}>
                        <td className="py-3 pr-3 text-slate-100">Tuần {wi + 1} <span className="text-sm text-slate-500">{fd(w.from)} – {fd(w.to)}</span>{current && <span className="ml-2 text-xs text-blue-300">đang diễn ra</span>}</td>
                        {metrics.map(function(m) { let s = 0; days.forEach(function(d, i) { if (d.week === wi) s += series[m][i]; }); return <td key={m} className="py-3 px-3 text-right text-lg text-slate-100">{cell(m, s)}</td>; })}
                      </tr>
                    );
                  }) : days.map(function(d, i) {
                    const startWeek = i === 0 || days[i - 1].week !== d.week;
                    return (
                      <tr key={d.date} className={'border-b border-slate-800 ' + (d.date === todayStr ? 'bg-blue-500/10 ' : '') + (startWeek ? 'border-t-2 border-t-slate-600 ' : '') + (d.working ? '' : 'text-slate-600')}>
                        <td className="py-2 pr-3 whitespace-nowrap">{DOW[d.dow]} {fd(d.date)}{d.type !== 'regular' && <span className="ml-2 text-xs text-amber-300">Sale</span>}{startWeek && <span className="ml-2 text-[11px] text-blue-400">Tuần {d.week + 1}</span>}</td>
                        {metrics.map(function(m) { const noWork = (m === 'koc' || m === 'video') && !d.working; return <td key={m} className="py-2 px-3 text-right">{noWork ? '—' : cell(m, series[m][i])}</td>; })}
                      </tr>
                    );
                  })}
                  <tr className="font-semibold">
                    <td className="py-3 pr-3 text-slate-100">Cả tháng</td>
                    {metrics.map(function(m) { return <td key={m} className="py-3 px-3 text-right text-lg text-white">{cell(m, subj.totals[m] || 0)}</td>; })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {plan.updatedAt && <p className="text-xs text-slate-500 pb-4">Lưu lần cuối {new Date(plan.updatedAt).toLocaleString('vi-VN')}{plan.updatedBy ? ' bởi ' + plan.updatedBy : ''}.</p>}
    </div>
  );
}
