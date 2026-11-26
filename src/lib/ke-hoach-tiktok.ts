// Kế hoạch doanh số TikTok theo tháng: doanh số -> trần chi phí MKT (ADS + hàng/ship gửi KOC) -> từng sản phẩm -> từng shop và từng người
// -> chẻ ra tuần và ngày. Phần tính toán thuần (không phụ thuộc giao diện) để kiểm thử.

import { BookingSnapshot, NO_PRODUCT, STAGE, UNKNOWN_STAFF, isBooked, isContacted } from './booking';

export const KH_DEFAULT_CAP = 15; // % doanh số tối đa cho ADS + chi phí gửi KOC
export const KH_DEFAULT_SHIP = 13000; // phí ship bình quân mỗi gói gửi KOC (đ)
export const KH_DEFAULT_SALE_WEIGHT = 2; // ngày sale tính nặng gấp mấy lần ngày thường khi chia doanh số theo ngày

export interface KhProduct {
  name: string; // loại hàng (cùng tên chuẩn với báo cáo booking)
  revenue: number; // doanh số mục tiêu cả tháng (đ)
  koc: number; // số KOC cần book trong tháng
  video: number; // số video KOC cần lên trong tháng
  kocCost: number; // giá vốn hàng gửi cho 1 KOC (đ, chưa gồm ship)
  alloc: Record<string, number>; // số KOC giao cho từng nhân sự booking
}

export interface KhPlan {
  month: string; // YYYY-MM
  totalRevenue: number; // tổng doanh số TikTok tháng (đ)
  capPct: number; // trần ADS + KOC theo % doanh số
  shipFee: number; // phí ship bình quân mỗi gói (đ)
  saleWeight: number; // hệ số ngày sale
  shopRevenue: Record<string, number>; // doanh số giao từng shop TikTok (theo mã shop)
  products: KhProduct[];
  staff: string[]; // nhân sự booking tham gia tháng này
  updatedBy: string;
  updatedAt: string;
}

export function khNewPlan(month: string): KhPlan {
  return { month: month, totalRevenue: 0, capPct: KH_DEFAULT_CAP, shipFee: KH_DEFAULT_SHIP, saleWeight: KH_DEFAULT_SALE_WEIGHT, shopRevenue: {}, products: [], staff: [], updatedBy: '', updatedAt: '' };
}

export function khNewProduct(name: string, kocCost: number): KhProduct {
  return { name: name, revenue: 0, koc: 0, video: 0, kocCost: kocCost, alloc: {} };
}

const num = function(x: unknown): number { const n = Number(x); return isFinite(n) ? n : 0; };

// Chia nguyên total theo trọng số, tổng đúng bằng total (phần dư cho phần có số lẻ lớn nhất)
export function khDistribute(total: number, weights: number[]): number[] {
  const t = Math.max(0, Math.round(total));
  const sum = weights.reduce(function(a, b) { return a + b; }, 0);
  if (weights.length === 0) return [];
  if (sum <= 0 || t === 0) return weights.map(function() { return 0; });
  const raw = weights.map(function(w) { return t * w / sum; });
  const out = raw.map(function(r) { return Math.floor(r); });
  let rest = t - out.reduce(function(a, b) { return a + b; }, 0);
  const order = raw.map(function(r, i) { return { i: i, f: r - Math.floor(r), w: weights[i] }; })
    .filter(function(x) { return x.w > 0; })
    .sort(function(a, b) { return b.f - a.f || a.i - b.i; });
  for (let k = 0; rest > 0 && order.length > 0; k = (k + 1) % order.length) { out[order[k].i]++; rest--; }
  return out;
}

// ----- Tính ngân sách theo sản phẩm -----
export interface KhProductCalc {
  name: string; revenue: number; cap: number; koc: number; video: number;
  unit: number; // chi phí gửi 1 KOC = giá vốn + ship
  kocSpend: number; // chi phí hàng + ship gửi KOC của sản phẩm
  ads: number; // ngân sách ADS còn lại của sản phẩm = trần - chi phí KOC (âm nghĩa là vượt trần)
  adsPct: number; kocPct: number; // % so với doanh số sản phẩm
  over: boolean;
}

export interface KhCalc {
  mktCap: number; // trần MKT theo tổng doanh số
  products: KhProductCalc[];
  prodRevenue: number; // tổng doanh số các sản phẩm
  revenueGap: number; // tổng doanh số - doanh số các sản phẩm (khác 0 là chưa khớp)
  shopSum: number; shopGap: number; // tổng doanh số các shop và chênh với tổng
  kocTotal: number; videoTotal: number; kocSpend: number;
  adsTotal: number; // ngân sách ADS cả tháng = trần - chi phí KOC
  adsPct: number; kocPct: number; totalPct: number; // so với tổng doanh số
  overCap: boolean;
}

export function khCalc(p: KhPlan): KhCalc {
  const cap = num(p.capPct) / 100;
  const ship = num(p.shipFee);
  const products: KhProductCalc[] = p.products.map(function(x) {
    const revenue = num(x.revenue), koc = Math.max(0, Math.round(num(x.koc)));
    const unit = num(x.kocCost) + ship;
    const kocSpend = koc * unit;
    const c = revenue * cap;
    const ads = c - kocSpend;
    return { name: x.name, revenue: revenue, cap: c, koc: koc, video: Math.max(0, Math.round(num(x.video))), unit: unit, kocSpend: kocSpend, ads: ads,
      adsPct: revenue > 0 ? ads / revenue * 100 : 0, kocPct: revenue > 0 ? kocSpend / revenue * 100 : 0, over: ads < 0 };
  });
  const total = num(p.totalRevenue);
  const prodRevenue = products.reduce(function(s, x) { return s + x.revenue; }, 0);
  const kocSpend = products.reduce(function(s, x) { return s + x.kocSpend; }, 0);
  const mktCap = total * cap;
  const adsTotal = mktCap - kocSpend;
  const shopSum = Object.keys(p.shopRevenue).reduce(function(s, k) { return s + num(p.shopRevenue[k]); }, 0);
  return {
    mktCap: mktCap, products: products, prodRevenue: prodRevenue, revenueGap: total - prodRevenue,
    shopSum: shopSum, shopGap: total - shopSum,
    kocTotal: products.reduce(function(s, x) { return s + x.koc; }, 0), videoTotal: products.reduce(function(s, x) { return s + x.video; }, 0), kocSpend: kocSpend,
    adsTotal: adsTotal, adsPct: total > 0 ? adsTotal / total * 100 : 0, kocPct: total > 0 ? kocSpend / total * 100 : 0, totalPct: total > 0 ? (adsTotal + kocSpend) / total * 100 : 0,
    overCap: adsTotal < 0,
  };
}

// ----- Giao việc cho từng nhân sự booking -----
export interface KhStaffCalc { name: string; koc: number; video: number; spend: number; byProduct: Record<string, { koc: number; video: number }> }

export function khStaffCalc(p: KhPlan): KhStaffCalc[] {
  const ship = num(p.shipFee);
  return p.staff.map(function(s) {
    const o: KhStaffCalc = { name: s, koc: 0, video: 0, spend: 0, byProduct: {} };
    p.products.forEach(function(x) {
      const k = Math.max(0, Math.round(num(x.alloc[s])));
      const koc = Math.max(1, Math.round(num(x.koc)));
      const v = Math.round(num(x.video) * k / koc);
      if (k > 0) { o.byProduct[x.name] = { koc: k, video: v }; }
      o.koc += k; o.video += v; o.spend += k * (num(x.kocCost) + ship);
    });
    return o;
  });
}

// Chia đều số KOC của từng sản phẩm cho các nhân sự tham gia
export function khAutoAlloc(p: KhPlan): KhProduct[] {
  return p.products.map(function(x) {
    const parts = khDistribute(Math.round(num(x.koc)), p.staff.map(function() { return 1; }));
    const alloc: Record<string, number> = {};
    p.staff.forEach(function(s, i) { alloc[s] = parts[i] || 0; });
    return Object.assign({}, x, { alloc: alloc });
  });
}

// Số KOC chưa giao / giao thừa của từng sản phẩm
export function khAllocGap(p: KhPlan, x: KhProduct): number {
  const given = p.staff.reduce(function(s, n) { return s + Math.max(0, Math.round(num(x.alloc[n]))); }, 0);
  return Math.round(num(x.koc)) - given;
}

// ----- Chẻ ra tuần và ngày -----
export type KhDayType = 'regular' | 'sale_double' | 'sale_fixed';

export interface KhDay {
  date: string; dow: number; type: KhDayType; week: number; working: boolean;
  revenue: number; ads: number; koc: number; video: number;
}
export interface KhWeek { idx: number; from: string; to: string; days: number }

function dayType(date: string): KhDayType {
  const mm = parseInt(date.slice(5, 7), 10), dd = parseInt(date.slice(8, 10), 10);
  if (dd === mm) return 'sale_double';
  if (dd === 15 || dd === 25) return 'sale_fixed';
  return 'regular';
}

export function khMonthDays(month: string): string[] {
  const y = parseInt(month.slice(0, 4), 10), m = parseInt(month.slice(5, 7), 10);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= n; d++) out.push(month + '-' + (d < 10 ? '0' + d : String(d)));
  return out;
}

function mondayOf(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// Tuần tính từ thứ Hai; tuần đầu và cuối tháng có thể ngắn hơn 7 ngày
export function khWeeks(month: string): KhWeek[] {
  const days = khMonthDays(month);
  const weeks: KhWeek[] = [];
  let lastKey = '';
  days.forEach(function(d) {
    const key = mondayOf(d);
    if (key !== lastKey) { weeks.push({ idx: weeks.length, from: d, to: d, days: 0 }); lastKey = key; }
    const w = weeks[weeks.length - 1];
    w.to = d; w.days++;
  });
  return weeks;
}

// Doanh số và ADS chia theo trọng số ngày (ngày sale nặng hơn); KOC và video chia đều các ngày làm việc (bỏ Chủ nhật)
export function khDays(p: KhPlan, calc: KhCalc): KhDay[] {
  const dates = khMonthDays(p.month);
  const weeks = khWeeks(p.month);
  const weekOf = function(d: string): number {
    for (let i = 0; i < weeks.length; i++) if (d >= weeks[i].from && d <= weeks[i].to) return weeks[i].idx;
    return 0;
  };
  const sw = Math.max(0.1, num(p.saleWeight) || 1);
  const info = dates.map(function(d) {
    const dow = new Date(d + 'T00:00:00Z').getUTCDay();
    const type = dayType(d);
    return { date: d, dow: dow, type: type, week: weekOf(d), working: dow !== 0, w: type === 'regular' ? 1 : sw };
  });
  const rev = khDistribute(num(p.totalRevenue), info.map(function(x) { return x.w; }));
  const ads = khDistribute(Math.max(0, calc.adsTotal), info.map(function(x) { return x.w; }));
  const ww = info.map(function(x) { return x.working ? 1 : 0; });
  const koc = khDistribute(calc.kocTotal, ww);
  const vid = khDistribute(calc.videoTotal, ww);
  return info.map(function(x, i) { return { date: x.date, dow: x.dow, type: x.type, week: x.week, working: x.working, revenue: rev[i], ads: ads[i], koc: koc[i], video: vid[i] }; });
}

// Chia một chỉ tiêu theo các ngày làm việc rồi cộng theo tuần (kết quả: số theo từng tuần, tổng đúng bằng total)
export function khWeeklySplit(total: number, days: KhDay[], nWeeks: number): number[] {
  const parts = khDistribute(total, days.map(function(d) { return d.working ? 1 : 0; }));
  const out: number[] = [];
  for (let i = 0; i < nWeeks; i++) out.push(0);
  days.forEach(function(d, i) { out[d.week] += parts[i]; });
  return out;
}

// Chia doanh số theo tuần theo trọng số ngày
export function khWeeklyRevenue(total: number, days: KhDay[], nWeeks: number, saleWeight: number): number[] {
  const sw = Math.max(0.1, num(saleWeight) || 1);
  const parts = khDistribute(total, days.map(function(d) { return d.type === 'regular' ? 1 : sw; }));
  const out: number[] = [];
  for (let i = 0; i < nWeeks; i++) out.push(0);
  days.forEach(function(d, i) { out[d.week] += parts[i]; });
  return out;
}

// ----- Số liệu tham khảo từ báo cáo booking (tháng trước) -----
export interface KhRef { confirmed: number; sent: number; video: number }
export interface KhRefResult { byCat: Record<string, KhRef>; skuFreq: Record<string, Record<string, number>> }

// Loại hàng của một dòng liên hệ: ưu tiên mã SKU (quy qua bảng SKU), không có thì dùng tên sản phẩm nhân sự ghi
function rowCats(snap: BookingSnapshot, prods: number[], skus: number[] | undefined, catOf: (code: string) => string | null): Array<{ cat: string; sku: string | null }> {
  const out: Array<{ cat: string; sku: string | null }> = [];
  if (skus && skus.length > 0) {
    skus.forEach(function(i) {
      const code = (snap.skus || [])[i];
      if (!code) return;
      const c = catOf(code);
      if (c) out.push({ cat: c, sku: code });
    });
    if (out.length > 0) return out;
  }
  prods.forEach(function(pi) {
    const n = snap.products[pi];
    if (n && n !== NO_PRODUCT) out.push({ cat: n, sku: null });
  });
  return out;
}

export function khBookingRef(snap: BookingSnapshot, from: string, to: string, catOf: (code: string) => string | null): KhRefResult {
  const byCat: Record<string, KhRef> = {};
  const skuFreq: Record<string, Record<string, number>> = {};
  const seenC: Record<string, Set<string>> = {};
  const seenS: Record<string, Set<string>> = {};
  const get = function(c: string): KhRef { return byCat[c] || (byCat[c] = { confirmed: 0, sent: 0, video: 0 }); };
  snap.contacts.forEach(function(r) {
    if (r[0] < from || r[0] > to || !isContacted(r[2]) || !isBooked(r[2])) return;
    rowCats(snap, r[4], r[5], catOf).forEach(function(x) {
      const key = r[1] + '|' + r[3];
      const sc = seenC[x.cat] || (seenC[x.cat] = new Set<string>());
      if (!sc.has(key)) { sc.add(key); get(x.cat).confirmed++; }
      if (r[2] >= STAGE.SENT) {
        const ss = seenS[x.cat] || (seenS[x.cat] = new Set<string>());
        if (!ss.has(key)) { ss.add(key); get(x.cat).sent++; }
        if (x.sku) { const f = skuFreq[x.cat] || (skuFreq[x.cat] = {}); f[x.sku] = (f[x.sku] || 0) + 1; }
      }
    });
  });
  snap.schedules.forEach(function(r) {
    if (r[0] < from || r[0] > to || r[2] !== 1) return;
    r[4].forEach(function(pi) { const n = snap.products[pi]; if (n && n !== NO_PRODUCT) get(n).video++; });
  });
  return { byCat: byCat, skuFreq: skuFreq };
}

// Mã SKU hay gửi KOC nhất của một loại hàng (để gợi ý giá vốn gói gửi)
export function khTopSku(ref: KhRefResult, cat: string): string | null {
  const f = ref.skuFreq[cat];
  if (!f) return null;
  const keys = Object.keys(f).sort(function(a, b) { return f[b] - f[a] || a.localeCompare(b); });
  return keys[0] || null;
}

export function khBookingStaff(snap: BookingSnapshot): string[] {
  return snap.staff.filter(function(n) { return n !== UNKNOWN_STAFF; });
}
