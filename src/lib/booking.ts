// Booking KOC: kiểu dữ liệu bản tổng hợp, chuẩn hoá (giai đoạn, sản phẩm, ngày) và hàm tổng hợp chạy trên trình duyệt.

export const NO_PRODUCT = '(Chưa ghi sản phẩm)';
export const OTHER_PRODUCT = 'Khác (chưa phân loại)';
export const UNKNOWN_STAFF = '(Không rõ)';

// Giai đoạn cao nhất KOC đã đạt (suy từ cột "Trạng thái" trên Lark)
export const STAGE = { BLACKLIST: -2, REFUSED: -1, NONE: 0, CONTACTED: 1, CONFIRMED: 2, SENT: 3, SCHEDULED: 4, ONAIR: 5 } as const;

// [ngày liên hệ, nhân sự, giai đoạn, KOC, các sản phẩm]
export type ContactRow = [string, number, number, number, number[]];
// [ngày hẹn lên video, nhân sự, đã lên video 0/1, KOC, các sản phẩm]
export type ScheduleRow = [string, number, number, number, number[]];

export interface BookingSnapshot {
  version: 2;
  generatedAt: string;
  staff: string[];
  products: string[];
  kocs: string[];
  contacts: ContactRow[];
  schedules: ScheduleRow[];
  meta: { contactRows: number; scheduleRows: number; skippedNoDate: number; tables: Array<{ name: string; rows: number }> };
}

// Phần dữ liệu đọc trực tiếp từ Lark (các dòng từ liveFrom trở đi). Từ điển staff/products mở rộng từ bản lưu sẵn (giữ nguyên mã số cũ).
export interface BookingLive {
  generatedAt: string;
  baseGeneratedAt: string;
  liveFrom: string;
  staff: string[];
  products: string[];
  contacts: ContactRow[];
  schedules: ScheduleRow[];
}

// Ghép: giữ phần lịch sử (trước liveFrom) của bản lưu sẵn, thay phần từ liveFrom bằng dữ liệu trực tiếp
export function mergeLive(base: BookingSnapshot, live: BookingLive | null): BookingSnapshot {
  if (!live) return base;
  const contacts = base.contacts.filter(function(r) { return r[0] < live.liveFrom; }).concat(live.contacts);
  const schedules = base.schedules.filter(function(r) { return r[0] < live.liveFrom; }).concat(live.schedules);
  return {
    version: base.version,
    generatedAt: base.generatedAt,
    staff: live.staff,
    products: live.products,
    kocs: base.kocs,
    contacts: contacts,
    schedules: schedules,
    meta: { contactRows: contacts.length, scheduleRows: schedules.length, skippedNoDate: base.meta.skippedNoDate, tables: base.meta.tables },
  };
}

export function stageOf(raw: string): number {
  const s = stripAccents(String(raw || '')).trim().toLowerCase();
  if (!s || s === 'false' || s === 'true') return STAGE.NONE;
  if (s.indexOf('on air') >= 0 || s.indexOf('onair') >= 0) return STAGE.ONAIR;
  if (s.indexOf('hen lich') >= 0) return STAGE.SCHEDULED;
  if (s.indexOf('gui sp') >= 0 || s.indexOf('hoan') >= 0 || s.indexOf('bung') >= 0 || s.indexOf('khong hieu qua') >= 0) return STAGE.SENT;
  if (s.indexOf('xac nhan') >= 0 || s.indexOf('nhan sp') >= 0) return STAGE.CONFIRMED;
  if (s.indexOf('tu choi') >= 0) return STAGE.REFUSED;
  if (s.indexOf('blacklist') >= 0) return STAGE.BLACKLIST;
  return STAGE.CONTACTED;
}

export const isContacted = function(stage: number): boolean { return stage !== STAGE.NONE; };
export const isBooked = function(stage: number): boolean { return stage >= STAGE.CONFIRMED; };

const COMBINING_MARKS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(COMBINING_MARKS, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

// Mỗi nhân sự ghi tên sản phẩm một kiểu (VDG, BTC, KMTL...). Quy về tên chuẩn bằng các luật dưới đây (theo thứ tự).
const PRODUCT_RULES: Array<[RegExp, string]> = [
  [/GIAN GIA/, 'Gián giả (đạo cụ)'],
  [/^VDG$|VIEN DIET GIAN|THUOC DIET GIAN|DIET GIAN/, 'Thuốc diệt gián (VDG)'],
  [/^BTC$|BOT THONG CONG/, 'Bột thông cống'],
  [/XIT.*(LO VI SONG|LVS)/, 'Xịt vệ sinh lò vi sóng'],
  [/XIT.*TU LANH/, 'Xịt vệ sinh tủ lạnh'],
  [/XIT.*BEP/, 'Xịt vệ sinh bếp'],
  [/XIT MUOI/, 'Xịt muỗi'],
  [/GEL.*(THONG CONG|DUONG ONG)|THONG CONG/, 'Gel thông cống'],
  [/KEO VA TUONG/, 'Keo vá tường'],
  [/KHU MUI|^KMTL$|^KM$/, 'Khử mùi tủ lạnh'],
  [/^BVSDH$|DIEU HOA/, 'Bộ vệ sinh điều hòa'],
  [/LO THOM/, 'Lọ thơm phòng'],
  [/TAY LONG|^TLMG$|MAY GIAT/, 'Tẩy lồng máy giặt'],
  [/BOT TAY TRANG|BUT TAY TRANG|^BTT$/, 'Bột tẩy trắng'],
  [/GIAY/, 'Vệ sinh giày dép'],
  [/SOFA/, 'Vệ sinh sofa'],
  [/HUT AM/, 'Hộp hút ẩm'],
  [/TUI S[UO]+I/, 'Túi sưởi'],
  [/SON PHU TUONG/, 'Sơn phủ tường'],
  [/CANXI/, 'Tẩy cặn canxi'],
  [/CAY LAU|CHOI LAU|LAU KEP|LAU BEP/, 'Cây / chổi lau'],
];

export function canonicalProduct(token: string): string {
  const t = stripAccents(token).toUpperCase().replace(/\s+/g, ' ').trim();
  if (!t) return '';
  for (let i = 0; i < PRODUCT_RULES.length; i++) {
    if (PRODUCT_RULES[i][0].test(t)) return PRODUCT_RULES[i][1];
  }
  return OTHER_PRODUCT;
}

// Nhận mảng (cột chọn nhiều) hoặc chuỗi "VDG - BTC, KEO VÁ TƯỜNG"; trả về danh sách tên chuẩn không trùng.
export function splitProducts(raw: string | string[] | undefined | null): string[] {
  const parts = Array.isArray(raw) ? raw : [raw || ''];
  const out: string[] = [];
  parts.forEach(function(p) {
    String(p).split(/\s*[,;+\/&_]\s*|\s+[-–]\s*|\s*[-–]\s+/).forEach(function(tok) {
      const c = canonicalProduct(tok);
      if (c && out.indexOf(c) < 0) out.push(c);
    });
  });
  return out.length > 0 ? out : [NO_PRODUCT];
}

// Lark lưu ngày dạng mili-giây; đổi sang ngày giờ Việt Nam (UTC+7). Ngày ngoài khoảng hợp lý bị coi là không có.
export function toVnDate(ms: unknown): string {
  const n = Number(ms);
  if (!n || n < 1704067200000 || n > 1830297600000) return '';
  return new Date(n + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export function todayVn(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekStart(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7; // thứ Hai = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export type Granularity = 'day' | 'week' | 'month';

export function bucketOf(date: string, gran: Granularity): string {
  if (gran === 'day') return date;
  if (gran === 'month') return date.slice(0, 7);
  return weekStart(date);
}

export function bucketLabel(key: string, gran: Granularity): string {
  if (gran === 'month') return key.slice(5) + '/' + key.slice(0, 4);
  const p = key.split('-');
  const dm = p[2] + '/' + p[1];
  return gran === 'week' ? 'Tuần ' + dm : dm;
}

// ==================== Tổng hợp (chạy trên trình duyệt) ====================

export interface BookingFilter {
  from: string;
  to: string;
  staff: number; // -1 = tất cả
  product: number; // -1 = tất cả
}

class Counter {
  private m = new Map<string, number | Set<number>>();
  private unique: boolean;
  constructor(unique: boolean) { this.unique = unique; }
  add(key: string, koc: number): void {
    if (this.unique) {
      let s = this.m.get(key) as Set<number> | undefined;
      if (!s) { s = new Set<number>(); this.m.set(key, s); }
      s.add(koc);
    } else {
      this.m.set(key, ((this.m.get(key) as number) || 0) + 1);
    }
  }
  get(key: string): number {
    const v = this.m.get(key);
    if (v === undefined) return 0;
    return typeof v === 'number' ? v : v.size;
  }
  keys(): string[] { return Array.from(this.m.keys()); }
}

export interface BookingReport {
  kpi: { contacted: number; booked: number; sent: number; scheduled: number; aired: number };
  contactSeries: Array<{ key: string; label: string; contacted: number; booked: number }>;
  scheduleSeries: Array<{ key: string; label: string; scheduled: number; aired: number }>;
  byProduct: Array<{ name: string; contacted: number; booked: number; scheduled: number; aired: number }>;
  byStaff: Array<{ name: string; contacted: number; booked: number; scheduled: number; aired: number }>;
  upcoming: Array<{ date: string; count: number; byStaff: Array<{ name: string; count: number }> }>;
  upcomingTotal: number;
  overdueRecent: number;
  overdueOld: number;
  overdueByStaff: Array<{ name: string; count: number }>;
}

export function buildBookingReport(snap: BookingSnapshot, f: BookingFilter, gran: Granularity, unique: boolean): BookingReport {
  const today = todayVn();
  const inRange = function(d: string): boolean { return d >= f.from && d <= f.to; };
  const rowOk = function(staff: number, products: number[]): boolean {
    if (f.staff >= 0 && staff !== f.staff) return false;
    if (f.product >= 0 && products.indexOf(f.product) < 0) return false;
    return true;
  };

  const cContacted = new Counter(unique), cBooked = new Counter(unique), cSent = new Counter(unique);
  const sScheduled = new Counter(unique), sAired = new Counter(unique);
  const kpiC = new Counter(unique), kpiB = new Counter(unique), kpiS = new Counter(unique), kpiSch = new Counter(unique), kpiA = new Counter(unique);
  const pContacted = new Counter(unique), pBooked = new Counter(unique), pScheduled = new Counter(unique), pAired = new Counter(unique);
  const tContacted = new Counter(unique), tBooked = new Counter(unique), tScheduled = new Counter(unique), tAired = new Counter(unique);
  const contactBuckets = new Set<string>(), scheduleBuckets = new Set<string>();

  snap.contacts.forEach(function(r) {
    const date = r[0], staff = r[1], stage = r[2], koc = r[3], prods = r[4];
    if (!inRange(date) || !rowOk(staff, prods) || !isContacted(stage)) return;
    const b = bucketOf(date, gran);
    contactBuckets.add(b);
    cContacted.add(b, koc);
    kpiC.add('all', koc);
    const booked = isBooked(stage);
    if (booked) { cBooked.add(b, koc); kpiB.add('all', koc); }
    if (stage >= STAGE.SENT) { cSent.add(b, koc); kpiS.add('all', koc); }
    const sk = String(staff);
    tContacted.add(sk, koc);
    if (booked) tBooked.add(sk, koc);
    prods.forEach(function(p) {
      const pk = String(p);
      pContacted.add(pk, koc);
      if (booked) pBooked.add(pk, koc);
    });
  });

  const upcomingMap = new Map<string, Map<string, number>>();
  let upcomingTotal = 0, overdueRecent = 0, overdueOld = 0;
  const overdueStaff = new Map<string, number>();
  const recentLimit = addDays(today, -30);

  snap.schedules.forEach(function(r) {
    const date = r[0], staff = r[1], aired = r[2] === 1, koc = r[3], prods = r[4];
    if (!rowOk(staff, prods)) return;
    if (inRange(date)) {
      const b = bucketOf(date, gran);
      scheduleBuckets.add(b);
      sScheduled.add(b, koc);
      kpiSch.add('all', koc);
      const sk = String(staff);
      tScheduled.add(sk, koc);
      if (aired) { sAired.add(b, koc); kpiA.add('all', koc); tAired.add(sk, koc); }
      prods.forEach(function(p) {
        const pk = String(p);
        pScheduled.add(pk, koc);
        if (aired) pAired.add(pk, koc);
      });
    }
    if (date >= today && !aired) {
      upcomingTotal++;
      if (date <= addDays(today, 14)) {
        const sName = snap.staff[staff] || UNKNOWN_STAFF;
        let m = upcomingMap.get(date);
        if (!m) { m = new Map<string, number>(); upcomingMap.set(date, m); }
        m.set(sName, (m.get(sName) || 0) + 1);
      }
    } else if (date < today && !aired) {
      if (date >= recentLimit) {
        overdueRecent++;
        const n = snap.staff[staff] || UNKNOWN_STAFF;
        overdueStaff.set(n, (overdueStaff.get(n) || 0) + 1);
      } else {
        overdueOld++;
      }
    }
  });

  const contactSeries = Array.from(contactBuckets).sort().map(function(k) {
    return { key: k, label: bucketLabel(k, gran), contacted: cContacted.get(k), booked: cBooked.get(k) };
  });
  const scheduleSeries = Array.from(scheduleBuckets).sort().map(function(k) {
    return { key: k, label: bucketLabel(k, gran), scheduled: sScheduled.get(k), aired: sAired.get(k) };
  });

  const byProduct = snap.products.map(function(name, i) {
    const k = String(i);
    return { name: name, contacted: pContacted.get(k), booked: pBooked.get(k), scheduled: pScheduled.get(k), aired: pAired.get(k) };
  }).filter(function(x) { return x.contacted > 0 || x.scheduled > 0; })
    .sort(function(a, b) { return b.booked - a.booked || b.contacted - a.contacted; });

  const byStaff = snap.staff.map(function(name, i) {
    const k = String(i);
    return { name: name, contacted: tContacted.get(k), booked: tBooked.get(k), scheduled: tScheduled.get(k), aired: tAired.get(k) };
  }).filter(function(x) { return x.contacted > 0 || x.scheduled > 0; })
    .sort(function(a, b) { return b.contacted - a.contacted; });

  const upcoming = Array.from(upcomingMap.keys()).sort().map(function(d) {
    const m = upcomingMap.get(d)!;
    const staffList = Array.from(m.entries()).map(function(e) { return { name: e[0], count: e[1] }; }).sort(function(a, b) { return b.count - a.count; });
    return { date: d, count: staffList.reduce(function(s, x) { return s + x.count; }, 0), byStaff: staffList };
  });

  return {
    kpi: { contacted: kpiC.get('all'), booked: kpiB.get('all'), sent: kpiS.get('all'), scheduled: kpiSch.get('all'), aired: kpiA.get('all') },
    contactSeries: contactSeries,
    scheduleSeries: scheduleSeries,
    byProduct: byProduct,
    byStaff: byStaff,
    upcoming: upcoming,
    upcomingTotal: upcomingTotal,
    overdueRecent: overdueRecent,
    overdueOld: overdueOld,
    overdueByStaff: Array.from(overdueStaff.entries()).map(function(e) { return { name: e[0], count: e[1] }; }).sort(function(a, b) { return b.count - a.count; }),
  };
}
