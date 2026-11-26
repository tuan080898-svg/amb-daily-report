// Cảnh báo tồn kho để nhập hàng: phần tính toán thuần (không đọc/ghi dữ liệu).
//  - Tốc độ bán: số lượng trong file đơn đã tải ở trang Nhập báo cáo (bỏ đơn hủy), quy ra sản phẩm gốc theo bảng quy đổi SKU,
//    chia kho theo khu vực của shop. Trung bình = 1/2 mức 30 ngày + 1/2 mức 7 ngày gần nhất.
//  - Tồn: tồn kho của app (đồng bộ từ cột "Có thể bán" trên Sapo).
//  - Khi đã nạp danh sách ĐỊNH MỨC: chỉ cảnh báo theo định mức (tồn có thể bán < định mức của sản phẩm ở kho đó).
//    Các quy tắc theo tốc độ bán bên dưới chỉ dùng khi chưa có định mức nào.
//  - Điểm đặt hàng = tốc độ bán × (số ngày hàng về + dự phòng). Tồn + hàng đang về xuống tới mức này là phải đặt.
//  - Gợi ý nhập = tốc độ bán × (hàng về + dự phòng + chu kỳ đặt) − tồn − hàng đang về.

export type CbKho = 'HCM' | 'HN';
export const CB_KHO: CbKho[] = ['HN', 'HCM'];
export const CB_KHO_LABEL: Record<CbKho, string> = { HCM: 'Kho HCM', HN: 'Kho Hà Nội' };

export interface CbSettings { leadDays: number; safetyDays: number; cycleDays: number }
export const CB_DEFAULT_SETTINGS: CbSettings = { leadDays: 30, safetyDays: 7, cycleDays: 30 };
export const CB_SOON_DAYS = 14;      // "Sắp đến hạn": còn khoảng 2 tuần nữa là chạm điểm đặt hàng
export const CB_STALE_DAYS = 3;      // số tồn cũ hơn chừng này ngày thì coi là không đáng tin

export interface CbProductSetting { leadDays?: number; stop?: boolean }
export interface CbIncoming { id: string; product: string; kho: CbKho; qty: number; eta: string; createdAt: string; by: string; note: string; doneAt?: string }
// mins: định mức tồn tối thiểu, khóa "sản phẩm|kho"
export interface CbData { settings: CbSettings; products: Record<string, CbProductSetting>; incoming: CbIncoming[]; mins: Record<string, number> }

export function cbEmptyData(): CbData {
  return { settings: { ...CB_DEFAULT_SETTINGS }, products: {}, incoming: [], mins: {} };
}

export type CbStatus = 'het' | 'duoi' | 'chua-dm' | 'gap' | 'dat' | 'sap' | 'cho' | 'chua-ton' | 'du' | 'khong-ban' | 'ngung';
export const CB_STATUS_LABEL: Record<CbStatus, string> = {
  'het': 'Hết hàng', 'duoi': 'Dưới định mức', 'chua-dm': 'Chưa có định mức', 'gap': 'Khẩn', 'dat': 'Đặt ngay', 'sap': 'Sắp đến hạn', 'cho': 'Chờ hàng về',
  'chua-ton': 'Chưa có số tồn', 'du': 'Đủ hàng', 'khong-ban': 'Không bán 30 ngày', 'ngung': 'Ngừng nhập',
};
const ORDER: CbStatus[] = ['het', 'duoi', 'gap', 'dat', 'sap', 'cho', 'chua-ton', 'du', 'chua-dm', 'khong-ban', 'ngung'];

export interface CbRow {
  product: string;
  kho: CbKho;
  stock: number | null;     // null = app chưa có số tồn của sản phẩm ở kho này
  sold7: number;
  sold30: number;
  daily: number;
  daysLeft: number | null;
  incoming: number;
  nextEta: string | null;
  gapBeforeEta: boolean;    // hết hàng trước khi lô đang về tới kho
  leadDays: number;
  reorderPoint: number;
  suggest: number;
  min: number | null;       // định mức của sản phẩm ở kho này
  status: CbStatus;
}

export interface CbSalesImport { shopId: string; shopName: string; dailySku: Record<string, string[]>; importedAt: string }
export interface CbInput {
  today: string;                                   // YYYY-MM-DD theo giờ Việt Nam
  imports: CbSalesImport[];
  shops: Array<{ id: string; name: string; region: string }>;
  mappings: Record<string, Array<{ product: string; quantity: number }>>;
  configs: Array<{ product: string; warehouse: string; initial_stock: number | string }>;
  transactions: Array<{ product: string; warehouse: string; quantity: number | string; date: string; note: string | null }>;
  data: CbData;
}

export interface CbReport {
  today: string;
  salesTo: string | null;
  salesFrom: string | null;
  salesDays: number;
  stockAt: string | null;          // ngày đồng bộ Sapo gần nhất
  stockAgeDays: number | null;
  stockStale: boolean;
  normMode: boolean;               // đang cảnh báo theo danh sách định mức
  lateShops: Array<{ name: string; last: string | null }>;
  unmapped: Array<{ code: string; qty: number }>;
  rows: CbRow[];
  settings: CbSettings;
  incoming: CbIncoming[];
  productSettings: Record<string, CbProductSetting>;
}

export function cbAddDays(date: string, n: number): string {
  return new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}
export function cbDiffDays(a: string, b: string): number {
  return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);
}

// Mã trên file đơn đôi khi thừa dấu chấm cuối hoặc sai hoa thường (vd "GH063.", "gH081-2")
function lookup(map: CbInput['mappings'], upper: Map<string, string>, raw: string) {
  const code = raw.trim();
  if (map[code]) return map[code];
  const clean = code.replace(/\.+$/, '').trim();
  if (map[clean]) return map[clean];
  const k = upper.get(clean.toUpperCase());
  return k ? map[k] : null;
}

export function cbBuildReport(input: CbInput): CbReport {
  const { today, data } = input;
  const s = data.settings;
  const region = new Map(input.shops.map(function(x) { return [x.id, x.region === 'HCM' ? 'HCM' as CbKho : 'HN' as CbKho]; }));

  // Mỗi shop × ngày chỉ lấy bản tải lên mới nhất; bỏ ngày hôm nay vì chưa trọn ngày
  const best = new Map<string, { date: string; shopId: string; at: string; codes: string[] }>();
  input.imports.forEach(function(imp) {
    Object.keys(imp.dailySku || {}).forEach(function(date) {
      if (date >= today || !region.has(imp.shopId)) return;
      const key = imp.shopId + '|' + date;
      const cur = best.get(key);
      if (!cur || cur.at < imp.importedAt) best.set(key, { date: date, shopId: imp.shopId, at: imp.importedAt, codes: imp.dailySku[date] || [] });
    });
  });
  let salesTo: string | null = null;
  let firstDate: string | null = null;
  const lastByShop = new Map<string, string>();
  best.forEach(function(v) {
    if (!salesTo || v.date > salesTo) salesTo = v.date;
    if (!firstDate || v.date < firstDate) firstDate = v.date;
    if (v.date > (lastByShop.get(v.shopId) || '')) lastByShop.set(v.shopId, v.date);
  });
  const end: string = salesTo || cbAddDays(today, -1);
  const from30 = cbAddDays(end, -29);
  const from7 = cbAddDays(end, -6);
  const first = firstDate as string | null; // TypeScript không theo dõi được phép gán trong forEach
  const salesFrom: string = first && first > from30 ? first : from30;
  const days30 = Math.max(1, cbDiffDays(end, salesFrom) + 1);
  const days7 = Math.min(7, days30);

  const upper = new Map<string, string>();
  Object.keys(input.mappings).forEach(function(k) { upper.set(k.trim().toUpperCase(), k); });
  const sold30 = new Map<string, number>();
  const sold7 = new Map<string, number>();
  const unmapped = new Map<string, number>();
  best.forEach(function(v) {
    if (v.date < from30 || v.date > end) return;
    const kho = region.get(v.shopId) as CbKho;
    v.codes.forEach(function(raw) {
      const items = lookup(input.mappings, upper, raw);
      if (!items || !items.length) { unmapped.set(raw, (unmapped.get(raw) || 0) + 1); return; }
      items.forEach(function(it) {
        const k = it.product + '|' + kho;
        sold30.set(k, (sold30.get(k) || 0) + it.quantity);
        if (v.date >= from7) sold7.set(k, (sold7.get(k) || 0) + it.quantity);
      });
    });
  });

  // Tồn hiện tại = tồn đầu + mọi giao dịch; sản phẩm chưa có cấu hình lẫn giao dịch thì coi là chưa có số
  const stock = new Map<string, number>();
  input.configs.forEach(function(c) {
    const k = c.product + '|' + c.warehouse;
    stock.set(k, (stock.get(k) || 0) + Number(c.initial_stock || 0));
  });
  let stockAt: string | null = null;
  input.transactions.forEach(function(t) {
    const k = t.product + '|' + t.warehouse;
    stock.set(k, (stock.get(k) || 0) + Number(t.quantity || 0));
    if (t.note && t.note.indexOf('Đồng bộ tồn Sapo') === 0 && (!stockAt || t.date > stockAt)) stockAt = t.date;
  });
  const stockAgeDays = stockAt ? cbDiffDays(today, stockAt) : null;

  const open = data.incoming.filter(function(i) { return !i.doneAt; });
  const keys = new Set<string>();
  sold30.forEach(function(_, k) { keys.add(k); });
  stock.forEach(function(_, k) { keys.add(k); });
  open.forEach(function(i) { keys.add(i.product + '|' + i.kho); });
  const mins = data.mins || {};
  const normMode = Object.keys(mins).length > 0;
  Object.keys(mins).forEach(function(k) { keys.add(k); });

  const rows: CbRow[] = [];
  keys.forEach(function(k) {
    const cut = k.lastIndexOf('|');
    const product = k.slice(0, cut);
    const kho = k.slice(cut + 1) as CbKho;
    if (kho !== 'HCM' && kho !== 'HN') return;
    const ps = data.products[product] || {};
    const lead = ps.leadDays && ps.leadDays > 0 ? ps.leadDays : s.leadDays;
    const q30 = sold30.get(k) || 0;
    const q7 = sold7.get(k) || 0;
    const daily = (q30 / days30 + q7 / days7) / 2;
    const cur = stock.has(k) ? (stock.get(k) as number) : null;
    const mine = open.filter(function(i) { return i.product === product && i.kho === kho; });
    const inc = mine.reduce(function(a, i) { return a + i.qty; }, 0);
    const nextEta = mine.length ? mine.map(function(i) { return i.eta; }).sort()[0] : null;
    const daysLeft = cur !== null && daily > 0 ? Math.max(0, cur) / daily : null;
    const rop = Math.ceil(daily * (lead + s.safetyDays));
    const position = (cur || 0) + inc;
    let suggest = 0;
    let status: CbStatus;
    const min = Object.prototype.hasOwnProperty.call(mins, k) ? mins[k] : null;
    if (ps.stop) status = 'ngung';
    else if (normMode) {
      if (min === null) status = 'chua-dm';
      else if (cur === null) status = 'chua-ton';
      else if (cur < min) {
        suggest = Math.max(0, Math.ceil(min - position));
        status = position >= min ? 'cho' : cur <= 0 ? 'het' : 'duoi';
      } else status = 'du';
    }
    else if (daily <= 0) status = 'khong-ban';
    else if (cur === null) status = 'chua-ton';
    else {
      if (position <= daily * (lead + s.safetyDays + CB_SOON_DAYS)) suggest = Math.max(0, Math.ceil(daily * (lead + s.safetyDays + s.cycleDays) - position));
      if (cur <= 0) status = 'het';
      else if (position <= rop) status = (daysLeft as number) < lead ? 'gap' : 'dat';
      else if (position <= daily * (lead + s.safetyDays + CB_SOON_DAYS)) status = 'sap';
      else if (cur <= rop) status = 'cho';
      else status = 'du';
    }
    const gapBeforeEta = !ps.stop && !!nextEta && daysLeft !== null && cbAddDays(today, Math.floor(daysLeft)) < nextEta;
    rows.push({ product: product, kho: kho, stock: cur, sold7: q7, sold30: q30, daily: daily, daysLeft: daysLeft, incoming: inc, nextEta: nextEta, gapBeforeEta: gapBeforeEta, leadDays: lead, reorderPoint: rop, suggest: suggest, min: min, status: status });
  });
  rows.sort(function(a, b) {
    return ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || b.daily - a.daily || a.product.localeCompare(b.product, 'vi');
  });

  const lateShops = input.shops
    .map(function(x) { return { name: x.name, last: lastByShop.get(x.id) || null }; })
    .filter(function(x) { return !x.last || cbDiffDays(end, x.last) >= 2; });

  return {
    today: today, salesTo: salesTo, salesFrom: salesTo ? salesFrom : null, salesDays: salesTo ? days30 : 0,
    stockAt: stockAt, stockAgeDays: stockAgeDays, // Theo định mức thì phải là số tồn đồng bộ trong ngày
    stockStale: stockAgeDays === null || stockAgeDays > (normMode ? 0 : CB_STALE_DAYS), normMode: normMode,
    lateShops: lateShops,
    unmapped: Array.from(unmapped.entries()).map(function(e) { return { code: e[0], qty: e[1] }; }).sort(function(a, b) { return b.qty - a.qty; }),
    rows: rows, settings: s, incoming: open, productSettings: data.products,
  };
}

const num = function(n: number) { return Math.round(n).toLocaleString('vi-VN'); };
const dm = function(d: string) { return d.slice(8, 10) + '/' + d.slice(5, 7); };

// Nội dung tin Lark buổi sáng. Số tồn cũ thì chỉ nhắc đồng bộ, không đưa danh sách để tránh đặt hàng theo số sai.
export function cbLarkText(r: CbReport, link: string, perKho = 12): string {
  const out: string[] = ['📦 CẢNH BÁO NHẬP HÀNG AMB — ' + dm(r.today)];
  if (r.stockStale) {
    out.push('⚠️ Số tồn ' + (r.stockAt ? 'đồng bộ Sapo lần cuối ngày ' + dm(r.stockAt) + ' (' + r.stockAgeDays + ' ngày trước)' : 'chưa từng đồng bộ từ Sapo') + '. Chưa gửi danh sách nhập hàng để tránh đặt theo số sai.');
    out.push('👉 Việc cần làm: đăng nhập Sapo rồi đồng bộ tồn kho.');
    out.push(link);
    return out.join('\n');
  }
  out.push('Tồn Sapo ngày ' + dm(r.stockAt as string) + (r.salesTo ? ' · bán đến ' + dm(r.salesTo) : ''));
  if (r.normMode) {
    CB_KHO.forEach(function(kho) {
      const mine = r.rows.filter(function(x) { return x.kho === kho; });
      // Mã còn ít nhất so với định mức đứng trước
      const low = mine.filter(function(x) { return x.status === 'het' || x.status === 'duoi'; })
        .sort(function(a, b) { return (a.stock as number) / (a.min as number) - (b.stock as number) / (b.min as number); });
      const noStock = mine.filter(function(x) { return x.status === 'chua-ton'; });
      const waiting = mine.filter(function(x) { return x.status === 'cho'; }).length;
      out.push('');
      out.push('▶ ' + CB_KHO_LABEL[kho] + ': ' + (low.length ? low.length + ' mã DƯỚI ĐỊNH MỨC, cần nhập ngay' : '✅ không mã nào cần nhập thêm') + (waiting ? ' (' + waiting + ' mã đang chờ hàng về)' : ''));
      low.forEach(function(x) {
        out.push('• ' + x.product + ': tồn ' + num(x.stock || 0) + ' / định mức ' + num(x.min || 0) + (x.incoming ? ', đang về ' + num(x.incoming) : '') + ' → thiếu ' + num(x.suggest));
      });
      if (noStock.length) out.push('• Chưa có số tồn, cần kiểm tra trên Sapo: ' + noStock.map(function(x) { return x.product; }).join(', '));
    });
    out.push('', 'Chi tiết: ' + link);
    return out.join('\n');
  }
  CB_KHO.forEach(function(kho) {
    const mine = r.rows.filter(function(x) { return x.kho === kho; });
    const urgent = mine.filter(function(x) { return x.status === 'het' || x.status === 'gap' || x.status === 'dat'; });
    const n = function(st: CbStatus) { return mine.filter(function(x) { return x.status === st; }).length; };
    out.push('');
    out.push('▶ ' + CB_KHO_LABEL[kho] + ': ' + n('het') + ' hết · ' + n('gap') + ' khẩn · ' + n('dat') + ' đặt ngay · ' + n('sap') + ' sắp đến hạn');
    urgent.slice().sort(function(a, b) { return b.daily - a.daily; }).slice(0, perKho).forEach(function(x) {
      out.push('• [' + CB_STATUS_LABEL[x.status] + '] ' + x.product + ': tồn ' + num(x.stock || 0) +
        (x.daysLeft !== null && (x.stock || 0) > 0 ? ' (~' + Math.floor(x.daysLeft) + ' ngày)' : '') +
        (x.incoming ? ', đang về ' + num(x.incoming) : '') + ' → nhập ' + num(x.suggest));
    });
    if (urgent.length > perKho) out.push('… và ' + (urgent.length - perKho) + ' mã khác');
    if (n('chua-ton')) out.push('• ' + n('chua-ton') + ' mã có bán nhưng chưa có số tồn, cần kiểm tra');
  });
  if (r.lateShops.length) out.push('', '⚠️ Thiếu file bán hàng mới của: ' + r.lateShops.map(function(x) { return x.name; }).join(', '));
  out.push('', 'Chi tiết: ' + link);
  return out.join('\n');
}
