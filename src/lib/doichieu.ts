// Đối chiếu sổ kho (sổ ghi tay tại kho) với báo cáo xuất nhập tồn Sapo, theo từng ngày.
// Toàn bộ phần tính toán nằm ở đây (không phụ thuộc giao diện) để dùng chung cho trang, báo cáo và kiểm thử.

export var DC_F = ['nhap', 'kkTang', 'nhanKho', 'traLai', 'huyGiao', 'banRa', 'kkGiam', 'chuyenKho', 'traNcc'] as const;
export var DC_CH = ['nhap', 'loiNhap', 'loiTra', 'loiNs'] as const;
export var DC_LOI = ['loiNhap', 'loiTra', 'loiNs'] as const;
export var DC_LOI_TEN = ['Lỗi: hàng nhập', 'Lỗi: hàng trả', 'Lỗi: nhân sự'];
export var DC_DEF_STAFF = ['Đông', 'Chị Trang', 'Chị Dung', 'Hiệp', 'Partime'];

export type DcFKey = typeof DC_F[number];
export type DcVKey = typeof DC_CH[number];

export interface DcSapoRow { ma: string; ten: string; f: Record<string, number> }
export interface DcSapo { from: string | null; to: string | null; rows: DcSapoRow[] }
export interface DcV { nhap: number; loiNhap: number; loiTra: number; loiNs: number }
// Một dòng trên sổ: ns = số xuất theo tên từng người
export interface DcRow { ma: string; ns: Record<string, number>; v: DcV; unsure?: boolean; note?: string; goiY?: string | null; fromBo?: string }
export interface DcBo { bo: string; parts: Array<[string, number]>; auto?: boolean }
export interface DcSettings { hoanVaoNhap: boolean; xuatKhac: boolean; cot: string[] }
export interface DcCatalogItem { ma: string; ten: string }
export type DcCatalog = Record<string, DcCatalogItem>;
export interface DcCounts { lech: number; thieu: number; la: number; khop: number; unsure: number }

// Một ngày đã lưu. Dòng sổ lưu dạng chuẩn (ns theo tên người); bản sao lưu cũ dùng khóa spx/jt/best/nhanh/khac trong v, được đổi khi đọc (dcRowsOf).
export interface DcSession {
  ngay: string;
  sapo: DcSapo | null;
  so: Array<Record<string, unknown>>;
  cot?: string[];
  tomTat?: DcCounts;
  nguoiLuu?: string | null;
  luuLuc?: string;
}

export interface DcConfig {
  settings: DcSettings;
  bo: DcBo[];
  combos: Array<[string, string]>;
  catalog: Array<[string, string]>;
  months: string[];
}

export function dcDefaultConfig(): DcConfig {
  return { settings: { hoanVaoNhap: true, xuatKhac: false, cot: DC_DEF_STAFF.slice() }, bo: [], combos: [], catalog: [], months: [] };
}

// ---------- tiện ích ----------
export function dcNorm(s: unknown): string { return String(s == null ? '' : s).toUpperCase().replace(/\s+/g, '').replace(/[–—]/g, '-'); }
export function dcNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  var n = parseFloat(String(v).replace(',', '.'));
  return isFinite(n) ? n : 0;
}
export function dcR3(n: number): number { return Math.round(n * 1000) / 1000; }
export function dcNkey(n: unknown): string { return String(n == null ? '' : n).normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' '); }
export function dcFmt(n: number): string { return dcR3(n).toLocaleString('vi-VN'); }
export function dcFmtD(n: number): string { var x = dcR3(n); return x > 0 ? '+' + dcFmt(x) : dcFmt(x); }
export function dcPct(a: number, b: number): number { return b ? (a / b * 100) : 0; }
export function dcFp(x: number): string { return (Math.round(x * 100) / 100).toLocaleString('vi-VN') + '%'; }
export function dcVnDate(iso: string | null | undefined): string { return iso ? iso.split('-').reverse().join('/') : ''; }
export function dcIsoFromVn(s: string | null | undefined): string | null {
  var m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || '');
  return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : null;
}
export function dcToday(): string {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function dcAddDays(iso: string, n: number): string {
  var p = iso.split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return d.toISOString().slice(0, 10);
}

export function dcStaff(s: DcSettings): string[] {
  var c = (Array.isArray(s.cot) ? s.cot : []).map(function(x) { return String(x || '').trim(); }).filter(Boolean);
  return c.length ? c : DC_DEF_STAFF.slice();
}

export function dcNsSum(ns: Record<string, number> | undefined): number {
  return Object.values(ns || {}).reduce(function(a, q) { return a + dcNum(q); }, 0);
}
// Cộng số xuất theo người vào `into` (gộp tên khác hoa thường / khoảng trắng)
export function dcNsAdd(into: Record<string, number>, ns: Record<string, number> | undefined, mul?: number): Record<string, number> {
  var m = mul == null ? 1 : mul;
  Object.keys(ns || {}).forEach(function(n) {
    var x = dcNum((ns as Record<string, number>)[n]) * m;
    if (!x) return;
    var k = Object.keys(into).find(function(y) { return dcNkey(y) === dcNkey(n); }) || n;
    into[k] = (into[k] || 0) + x;
  });
  return into;
}
export function dcNsGet(ns: Record<string, number>, n: string): number {
  var k = Object.keys(ns || {}).find(function(x) { return dcNkey(x) === dcNkey(n); });
  return k ? dcNum(ns[k]) : 0;
}

// Các cột người của bản sao lưu cũ (5 cột cố định) -> tên người theo danh sách khi ghi
var LEGACY_KEYS = ['spx', 'jt', 'best', 'nhanh', 'khac'];
function legacyNames(cot: string[] | undefined): string[] {
  var st = cot && cot.length ? cot : DC_DEF_STAFF;
  return LEGACY_KEYS.map(function(_, i) { return st[i] || DC_DEF_STAFF[i]; });
}

export function dcNormRow(o: Record<string, unknown>, cot?: string[]): DcRow {
  var rawV = (o.v || {}) as Record<string, unknown>;
  var v: DcV = { nhap: dcNum(rawV.nhap), loiNhap: dcNum(rawV.loiNhap), loiTra: dcNum(rawV.loiTra), loiNs: dcNum(rawV.loiNs) };
  var ns = dcNsAdd({}, (o.ns || {}) as Record<string, number>);
  var names = legacyNames(cot);
  LEGACY_KEYS.forEach(function(k, i) { var q = dcNum(rawV[k]); if (q) dcNsAdd(ns, (function() { var t: Record<string, number> = {}; t[names[i]] = q; return t; })()); });
  return { ma: String(o.ma || ''), ns: ns, v: v, unsure: !!o.unsure, note: String(o.note || ''), goiY: (o.goiY as string) || null };
}
export function dcRowsOf(s: DcSession): DcRow[] {
  return (s.so || []).map(function(r) { return dcNormRow(r, s.cot); });
}

// ---------- đọc báo cáo xuất nhập tồn Sapo ----------
var LABELS: Record<string, string[]> = {
  nhap: ['sl nhập'], kkTang: ['kiểm kê tăng'], nhanKho: ['nhận từ kho khác'], traLai: ['hàng trả lại'], huyGiao: ['hủy giao', 'huỷ giao'],
  banRa: ['bán ra'], kkGiam: ['kiểm kê kho giảm', 'kiểm kê giảm'], chuyenKho: ['sl chuyển kho'], traNcc: ['trả nhà cung cấp'],
};
var FALLBACK: Record<string, number> = { nhap: 8, kkTang: 9, nhanKho: 10, traLai: 11, huyGiao: 12, banRa: 14, kkGiam: 15, chuyenKho: 16, traNcc: 17 };

export function dcParseSapo(aoa: unknown[][]): { from: string | null; to: string | null; rows: DcSapoRow[]; catalog: DcCatalog } {
  var from: string | null = null;
  var to: string | null = null;
  for (var i = 0; i < Math.min(8, aoa.length); i++) {
    var line = (aoa[i] || []).filter(Boolean).join(' ');
    var m = /Từ ngày\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*đến ngày\s*(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(line);
    if (m) { from = dcIsoFromVn(m[1]); to = dcIsoFromVn(m[2]); break; }
  }
  var isSku = function(c: unknown) { return String(c == null ? '' : c).trim().toUpperCase() === 'SKU'; };
  var h = aoa.findIndex(function(r) { return (r || []).some(isSku); });
  if (h < 0) throw new Error('Không thấy cột SKU. Đây có phải file Báo cáo xuất nhập tồn của Sapo không?');
  var skuCol = aoa[h].findIndex(isSku);
  var nameCol = skuCol + 1;
  var sub = (aoa[h + 1] || []).map(function(c) { return String(c == null ? '' : c).toLowerCase().trim(); });
  var col: Record<string, number> = {};
  DC_F.forEach(function(k) {
    var idx = sub.findIndex(function(s) { return !!s && LABELS[k].some(function(l) { return s.indexOf(l) >= 0; }) && !(k === 'nhap' && s.indexOf('kiểm kê') >= 0); });
    col[k] = idx >= 0 ? idx : FALLBACK[k];
  });
  var rows: DcSapoRow[] = [];
  var catalog: DcCatalog = {};
  for (var j = h + 2; j < aoa.length; j++) {
    var r = aoa[j] || [];
    var stt = r[0];
    if (stt === null || stt === undefined || stt === '' || isNaN(Number(stt))) continue;
    var ma = String(r[skuCol] == null ? '' : r[skuCol]).trim();
    if (!ma) continue;
    var ten = String(r[nameCol] == null ? '' : r[nameCol]).trim().slice(0, 90);
    catalog[dcNorm(ma)] = { ma: ma, ten: ten };
    var f: Record<string, number> = {};
    var any = false;
    DC_F.forEach(function(k) { f[k] = dcNum(r[col[k]]); if (f[k]) any = true; });
    if (any) rows.push({ ma: ma, ten: ten, f: f });
  }
  if (!Object.keys(catalog).length) throw new Error('File không có dòng sản phẩm nào.');
  return { from: from, to: to, rows: rows, catalog: catalog };
}

// File "Danh sách sản phẩm" của Sapo: lấy mã combo và tự suy combo theo số lượng (vd GH083-5 = 5 × GH083-1)
export function dcParseProductList(rows: Array<Record<string, unknown>>, existingBo: DcBo[]): { combos: Array<[string, string]>; autoBo: DcBo[] } {
  var col = function(r: Record<string, unknown>, n: string) { var k = Object.keys(r).find(function(x) { return x.toLowerCase().indexOf(n) >= 0; }); return k ? String(r[k]).trim() : ''; };
  var combos: Array<[string, string]> = [];
  var regs: Array<[string, string]> = [];
  rows.forEach(function(r) {
    var sku = col(r, 'mã sku'), ten = col(r, 'tên phiên bản'), loai = col(r, 'hình thức');
    if (!sku) return;
    if (/combo/i.test(loai)) combos.push([sku, ten.slice(0, 70)]); else regs.push([sku, ten]);
  });
  var have = new Set(existingBo.map(function(b) { return dcNorm(b.bo); }));
  var fam = function(x: string) { return x.split('-')[0].toUpperCase(); };
  var autoBo: DcBo[] = [];
  combos.forEach(function(c) {
    if (have.has(dcNorm(c[0]))) return;
    var m = /(?:combo\s*0?(\d+)|số lượng\s*(\d+)|^(\d+)\s)/i.exec(c[1]);
    var same = regs.filter(function(r) { return fam(r[0]) === fam(c[0]); });
    if (m && c[1].indexOf('+') < 0 && same.length === 1) autoBo.push({ bo: c[0], parts: [[same[0][0], +(m[1] || m[2] || m[3])]], auto: true });
  });
  return { combos: combos, autoBo: autoBo };
}

// ---------- đối chiếu ----------
function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 9;
  var d: number[][] = [];
  for (var i = 0; i <= a.length; i++) d.push([i]);
  for (var j = 1; j <= b.length; j++) d[0][j] = j;
  for (var x = 1; x <= a.length; x++) for (var y = 1; y <= b.length; y++)
    d[x][y] = Math.min(d[x - 1][y] + 1, d[x][y - 1] + 1, d[x - 1][y - 1] + (a[x - 1] === b[y - 1] ? 0 : 1));
  return d[a.length][b.length];
}
export function dcSuggest(code: string, catalog: DcCatalog): string[] {
  var n = dcNorm(code);
  if (!n) return [];
  var canon = function(x: string) { return x.replace(/O/g, '0').replace(/[IL]/g, '1'); };
  var cn = canon(n);
  return Object.keys(catalog)
    .map(function(k): [string, number] { return [k, canon(k) === cn ? 0.5 : lev(n, k)]; })
    .filter(function(x) { return x[1] <= 2; })
    .sort(function(a, b) { return a[1] - b[1]; })
    .slice(0, 3)
    .map(function(x) { return catalog[x[0]].ma; });
}

export type DcStatus = 'la' | 'thieu' | 'lech' | 'khop';
export interface DcResult {
  k: string; ma: string; ten: string; st: DcStatus; why: string; unsure: boolean;
  sBan: number; pBan: number; dBan: number; sNhap: number; pNhap: number; dNhap: number;
}

export interface DcCtx { bo: DcBo[]; combos: Array<[string, string]>; catalog: DcCatalog; settings: DcSettings }

export function dcBoMap(bo: DcBo[]): Map<string, DcBo> {
  var m = new Map<string, DcBo>();
  bo.forEach(function(b) { if (b.bo && b.parts && b.parts.length) m.set(dcNorm(b.bo), b); });
  return m;
}
export function dcComboName(combos: Array<[string, string]>, ma: string): string {
  var k = dcNorm(ma);
  var c = combos.find(function(x) { return dcNorm(x[0]) === k; });
  return c ? c[1] : '';
}
export function dcIsKnown(ma: string, ctx: { catalog: DcCatalog; bo: DcBo[] }): boolean {
  var k = dcNorm(ma);
  return !!ctx.catalog[k] || dcBoMap(ctx.bo).has(k);
}

// Tách mã bộ/combo trên sổ ra mã lẻ (Sapo trừ kho theo mã lẻ)
export function dcExplode(rows: DcRow[], bo: DcBo[]): DcRow[] {
  var bm = dcBoMap(bo);
  if (!bm.size) return rows;
  var out: DcRow[] = [];
  rows.forEach(function(r) {
    var b = bm.get(dcNorm(r.ma));
    if (!b) { out.push(r); return; }
    var bb: DcBo = b;
    bb.parts.forEach(function(p) {
      var sl = dcNum(p[1]);
      var v: DcV = { nhap: dcNum(r.v.nhap) * sl, loiNhap: dcNum(r.v.loiNhap) * sl, loiTra: dcNum(r.v.loiTra) * sl, loiNs: dcNum(r.v.loiNs) * sl };
      out.push({ ma: p[0], v: v, ns: dcNsAdd({}, r.ns, sl), unsure: r.unsure, note: r.note, goiY: r.goiY, fromBo: bb.bo });
    });
  });
  return out;
}

export function dcCompute(sapoRows: DcSapoRow[], soRaw: DcRow[], ctx: DcCtx): DcResult[] {
  var settings = ctx.settings;
  var soRows = dcExplode(soRaw, ctx.bo);
  var sap = new Map<string, DcSapoRow>();
  (sapoRows || []).forEach(function(r) { sap.set(dcNorm(r.ma), r); });
  var so = new Map<string, { ma: string; ns: Record<string, number>; v: DcV; n: number; unsure: boolean; goiY: string | null; bo?: Set<string> }>();
  soRows.forEach(function(r) {
    var k = dcNorm(r.ma);
    if (!k) return;
    var cur = so.get(k) || { ma: r.ma, ns: {}, v: { nhap: 0, loiNhap: 0, loiTra: 0, loiNs: 0 }, n: 0, unsure: false, goiY: null };
    DC_CH.forEach(function(c) { cur.v[c] += dcNum(r.v[c]); });
    dcNsAdd(cur.ns, r.ns);
    cur.n++;
    cur.unsure = cur.unsure || !!r.unsure;
    cur.goiY = cur.goiY || r.goiY || null;
    if (r.fromBo) { cur.bo = cur.bo || new Set<string>(); cur.bo.add(r.fromBo); }
    so.set(k, cur);
  });
  var out: DcResult[] = [];
  var keys = new Set<string>();
  sap.forEach(function(_, k) { keys.add(k); });
  so.forEach(function(_, k) { keys.add(k); });
  keys.forEach(function(k) {
    var s = so.get(k);
    var p = sap.get(k);
    var f = p ? p.f : ({} as Record<string, number>);
    var inCat = !!ctx.catalog[k] || !!p;
    var sv = s ? s.v : null;
    var sLoi = sv ? DC_LOI.reduce(function(a, c) { return a + dcNum((sv as DcV)[c]); }, 0) : 0;
    var sBan = s ? dcNsSum(s.ns) + (settings.xuatKhac ? sLoi : 0) : 0;
    var sNhap = s ? s.v.nhap : 0;
    var pXK = dcNum(f.kkGiam) + dcNum(f.chuyenKho) + dcNum(f.traNcc);
    var pBan = dcNum(f.banRa) + (settings.xuatKhac ? pXK : 0);
    var pNhap = dcNum(f.nhap) + dcNum(f.kkTang) + dcNum(f.nhanKho) + (settings.hoanVaoNhap ? dcNum(f.traLai) + dcNum(f.huyGiao) : 0);
    var dBan = dcR3(sBan - pBan);
    var dNhap = dcR3(sNhap - pNhap);
    var anyD = !!(dBan || dNhap);
    var st: DcStatus;
    var why = '';
    if (s && !inCat) {
      st = 'la';
      var sg = [s.goiY].concat(dcSuggest(s.ma, ctx.catalog)).filter(Boolean) as string[];
      why = sg.length ? 'Có thể là ' + Array.from(new Set(sg)).join(', ') : 'Không tìm thấy mã gần giống';
      var cn = dcComboName(ctx.combos, s.ma);
      if (cn) why = 'Mã combo “' + cn.slice(0, 40) + '”, chưa khai báo thành phần (tab Lịch sử › Bộ / combo)';
    } else if (!s) {
      if (!anyD) return;
      st = 'thieu';
      why = 'Sapo có phát sinh, sổ không ghi mã này';
    } else if (anyD) {
      st = 'lech';
      if (!(pBan || pNhap)) why = 'Sapo không ghi phát sinh';
      else if (s.n > 1 && !s.bo) why = 'Mã ghi ' + s.n + ' dòng trong sổ';
    } else st = 'khop';
    if (s && s.bo && s.bo.size) why = (why ? why + '. ' : '') + 'Có tách từ bộ: ' + Array.from(s.bo).join(', ');
    if (sLoi) why = (why ? why + '. ' : '') + (settings.xuatKhac ? 'Gồm ' + dcFmt(sLoi) + ' hàng lỗi' : 'Có ' + dcFmt(sLoi) + ' hàng lỗi (chưa tính vào xuất)');
    out.push({
      k: k, ma: (p && p.ma) || (ctx.catalog[k] && ctx.catalog[k].ma) || (s && s.ma) || k, ten: (p && p.ten) || (ctx.catalog[k] && ctx.catalog[k].ten) || '',
      st: st, why: why, unsure: !!(s && s.unsure), sBan: sBan, pBan: pBan, dBan: dBan, sNhap: sNhap, pNhap: pNhap, dNhap: dNhap,
    });
  });
  var ord: Record<string, number> = { la: 0, thieu: 1, lech: 2, khop: 3 };
  out.sort(function(a, b) {
    return ord[a.st] - ord[b.st] || (Math.abs(b.dBan) + Math.abs(b.dNhap)) - (Math.abs(a.dBan) + Math.abs(a.dNhap)) || String(a.ma).localeCompare(String(b.ma));
  });
  return out;
}

export function dcCounts(res: DcResult[]): DcCounts {
  var c = function(st: DcStatus) { return res.filter(function(r) { return r.st === st; }).length; };
  return { lech: c('lech'), thieu: c('thieu'), la: c('la'), khop: c('khop'), unsure: res.filter(function(r) { return r.unsure; }).length };
}

// ---------- dán bảng ----------
export interface DcPasteResult { add: DcRow[]; bad: string[]; moi: string[]; khongTieuDe: boolean }

export function dcParsePasted(text: string, staffNow: string[], known: (ma: string) => boolean): DcPasteResult {
  var lines = text.split(/\r?\n/).filter(function(l) { return l.trim(); });
  var isNum = function(x: unknown) { return /^-?\d+([.,]\d+)?$/.test(String(x).trim()); };
  var looksCode = function(x: string) { return /^[A-Z0-9][A-Z0-9_\-.+]*$/i.test(x.trim()) && /\d|-/.test(x); };
  var staffName = function(t: string) { return staffNow.find(function(n) { return dcNkey(n) === dcNkey(t); }) || String(t).trim(); };
  type ColKind = string | { ns: string };
  var map: Record<number, ColKind> | null = null;
  var add: DcRow[] = [];
  var bad: string[] = [];
  var headerMap = function(cells: string[]): Record<number, ColKind> | null {
    var m: Record<number, ColKind> = {};
    var hits = 0;
    cells.forEach(function(c, i) {
      var t = dcNkey(c);
      if (!t) return;
      if (/^(sku|mã|mã hàng|ma|mã sku)$/.test(t)) { m[i] = 'ma'; hits++; }
      else if (/^tên( hàng| sản phẩm)?$/.test(t)) { m[i] = 'skip'; hits++; }
      else if (/^hàng nhập$|lỗi.*nhập/.test(t)) { m[i] = 'loiNhap'; hits++; }
      else if (/^hàng trả$|lỗi.*trả/.test(t)) { m[i] = 'loiTra'; hits++; }
      else if (/^nhân sự$|lỗi.*nhân/.test(t)) { m[i] = 'loiNs'; hits++; }
      else if (/^nhập$/.test(t)) { m[i] = 'nhap'; hits++; }
      else if (/^ghi chú/.test(t)) { m[i] = 'note'; hits++; }
      else if (staffNow.some(function(n) { return dcNkey(n) === t; })) { m[i] = { ns: staffName(c) }; hits++; }
    });
    var vals = Object.keys(m).map(function(k) { return m[+k]; });
    if (!(vals.indexOf('ma') >= 0 && hits >= 2 && (vals.indexOf('nhap') >= 0 || vals.some(function(x) { return typeof x === 'object'; })))) return null;
    // mọi tiêu đề còn lại (không phải số, không phải "Lỗi") là tên một người xuất hàng
    cells.forEach(function(c, i) { var t = dcNkey(c); if (!(i in m) && t && !isNum(c) && t !== 'lỗi' && !/ngày|tháng|năm/.test(t)) m[i] = { ns: staffName(c) }; });
    return m;
  };
  lines.forEach(function(l) {
    var tab = l.indexOf('\t') >= 0;
    var cells = tab ? l.split('\t') : l.trim().split(/\s*\|\s*|\s+/);
    var hm = headerMap(cells);
    if (hm) { map = hm; return; }
    if (cells.every(function(c) { return !c.trim() || /^lỗi$/i.test(c.trim()) || /ngày|tháng|năm/i.test(c); })) return;
    var ma = '';
    var v: Record<string, unknown> = {};
    var ns: Record<string, number> = {};
    var note = '';
    if (map) {
      Object.keys(map).forEach(function(i) {
        var k = (map as Record<number, ColKind>)[+i];
        var c = (cells[+i] == null ? '' : cells[+i]).trim();
        if (k === 'ma') ma = c;
        else if (k === 'note') note = c;
        else if (k === 'skip') return;
        else if (typeof k === 'object') { if (dcNum(c)) { var t: Record<string, number> = {}; t[k.ns] = dcNum(c); dcNsAdd(ns, t); } }
        else v[k] = c === '-' ? 0 : c;
      });
    } else {
      // không có dòng tiêu đề: Mã | các cột người theo danh sách | Nhập | 3 lỗi | Ghi chú (hoặc Ghi chú ngay sau Nhập)
      var cs = cells.map(function(c) { return c.trim(); });
      if (tab && cs.length > 2 && !looksCode(cs[0]) && looksCode(cs[1])) cs = cs.slice(1);
      ma = cs[0];
      if (/^(mã|ma|sku)$/i.test(ma)) return;
      var r = cs.slice(1);
      var n = staffNow.length;
      var setNs = function(nm: string, q: unknown) { if (dcNum(q)) { var t: Record<string, number> = {}; t[nm] = dcNum(q); dcNsAdd(ns, t); } };
      if (tab) {
        staffNow.forEach(function(nm, j) { setNs(nm, r[j]); });
        v.nhap = r[n];
        var rest = r.slice(n + 1);
        if (rest[0] && !isNum(rest[0]) && rest[0] !== '-') { note = rest[0]; v.loiNhap = rest[1]; v.loiTra = rest[2]; v.loiNs = rest[3]; }
        else { v.loiNhap = rest[0]; v.loiTra = rest[1]; v.loiNs = rest[2]; note = rest.slice(3).join(' ').trim(); }
      } else {
        var j2 = 0;
        var nums: string[] = [];
        while (j2 < r.length && (r[j2] === '-' || isNum(r[j2]))) { nums.push(r[j2] === '-' ? '0' : r[j2]); j2++; }
        staffNow.forEach(function(nm, k2) { setNs(nm, nums[k2]); });
        v.nhap = nums[n]; v.loiNhap = nums[n + 1]; v.loiTra = nums[n + 2]; v.loiNs = nums[n + 3];
        note = r.slice(j2).join(' ');
      }
    }
    ma = String(ma || '').trim();
    if (!ma) return;
    if (!looksCode(ma) && !known(ma)) { bad.push(l.replace(/\t/g, ' ').slice(0, 60)); return; }
    var row = dcNormRow({ ma: ma, ns: ns, v: v, note: note });
    if (note.indexOf('(?)') >= 0) row.unsure = true;
    if (!dcNsSum(row.ns) && !DC_CH.some(function(k) { return dcNum(row.v[k]); }) && !note) return; // dòng chỉ có mã, toàn số 0
    add.push(row);
  });
  var moiSet = new Set<string>();
  add.forEach(function(r) { Object.keys(r.ns).forEach(function(n) { if (!staffNow.some(function(x) { return dcNkey(x) === dcNkey(n); })) moiSet.add(n); }); });
  return { add: add, bad: bad, moi: Array.from(moiSet), khongTieuDe: !map };
}

// ---------- báo cáo ----------
export interface DcStaffStat { ten: string; qty: number; lech: number; ma: number; maLech: number; loiNs: number; ngay?: number }
export interface DcStat {
  ngay: string; xuatSo: number; xuatSapo: number; lech: number; lechNhap: number; maLech: number; maPs: number;
  nhap: number; loiNhap: number; loiTra: number; loiNs: number; loiNsKhongTen: number; staff: Record<string, DcStaffStat>;
}

export function dcSessionStats(s: DcSession, ctx: DcCtx): DcStat {
  var raw = dcRowsOf(s);
  var res = dcCompute(s.sapo ? s.sapo.rows : [], raw, ctx);
  var st: DcStat = { ngay: s.ngay, xuatSo: 0, xuatSapo: 0, lech: 0, lechNhap: 0, maLech: 0, maPs: res.length, nhap: 0, loiNhap: 0, loiTra: 0, loiNs: 0, loiNsKhongTen: 0, staff: {} };
  var P = function(n: string) { var k = dcNkey(n); return st.staff[k] || (st.staff[k] = { ten: n, qty: 0, lech: 0, ma: 0, maLech: 0, loiNs: 0 }); };
  var names = Array.from(new Set(dcStaff(ctx.settings).concat(raw.reduce(function(a: string[], r) { return a.concat(Object.keys(r.ns)); }, []))));
  raw.forEach(function(r) {
    Object.keys(r.ns).forEach(function(n) { var q = dcNum(r.ns[n]); st.xuatSo += q; P(n).qty += q; });
    st.nhap += dcNum(r.v.nhap); st.loiNhap += dcNum(r.v.loiNhap); st.loiTra += dcNum(r.v.loiTra);
    var e = dcNum(r.v.loiNs);
    st.loiNs += e;
    if (e) {
      var note = dcNkey(r.note);
      var who = names.find(function(n) { return !!n && note.indexOf(dcNkey(n)) >= 0; });
      if (who) P(who).loiNs += e; else st.loiNsKhongTen += e;
    }
  });
  var byK = new Map<string, DcResult>();
  res.forEach(function(r) { byK.set(r.k, r); });
  res.forEach(function(r) { st.xuatSapo += r.pBan; st.lech += Math.abs(r.dBan); st.lechNhap += Math.abs(r.dNhap); if (r.st !== 'khop') st.maLech++; });
  var per = new Map<string, Record<string, number>>();
  dcExplode(raw, ctx.bo).forEach(function(r) { var k = dcNorm(r.ma); per.set(k, dcNsAdd(per.get(k) || {}, r.ns)); });
  per.forEach(function(a, k) {
    var tot = dcNsSum(a);
    var rr = byK.get(k);
    if (!tot) return;
    Object.keys(a).forEach(function(n) {
      var q = a[n];
      if (!q) return;
      var x = P(n);
      x.ma++;
      if (rr && rr.st !== 'khop' && rr.dBan) { x.maLech++; x.lech += Math.abs(rr.dBan) * q / tot; }
    });
  });
  return st;
}

export interface DcSum {
  n: number; xuatSo: number; xuatSapo: number; lech: number; lechNhap: number; maLech: number; maPs: number;
  nhap: number; loiNhap: number; loiTra: number; loiNs: number; loiNsKhongTen: number; staffList: DcStaffStat[];
}
export function dcSumStats(list: DcStat[], staffNames: string[]): DcSum {
  var z: DcSum = { n: list.length, xuatSo: 0, xuatSapo: 0, lech: 0, lechNhap: 0, maLech: 0, maPs: 0, nhap: 0, loiNhap: 0, loiTra: 0, loiNs: 0, loiNsKhongTen: 0, staffList: [] };
  var staff: Record<string, DcStaffStat> = {};
  list.forEach(function(s) {
    z.xuatSo += s.xuatSo; z.xuatSapo += s.xuatSapo; z.lech += s.lech; z.lechNhap += s.lechNhap; z.maLech += s.maLech; z.maPs += s.maPs;
    z.nhap += s.nhap; z.loiNhap += s.loiNhap; z.loiTra += s.loiTra; z.loiNs += s.loiNs; z.loiNsKhongTen += s.loiNsKhongTen;
    Object.keys(s.staff).forEach(function(k) {
      var x = s.staff[k];
      var t = staff[k] || (staff[k] = { ten: x.ten, qty: 0, lech: 0, ma: 0, maLech: 0, loiNs: 0, ngay: 0 });
      t.qty += x.qty; t.lech += x.lech; t.ma += x.ma; t.maLech += x.maLech; t.loiNs += x.loiNs;
      if (x.qty) t.ngay = (t.ngay || 0) + 1;
    });
  });
  staffNames.forEach(function(n) { var t = staff[dcNkey(n)]; if (t) t.ten = n; }); // tên hiển thị theo danh sách hiện tại
  z.staffList = Object.keys(staff).map(function(k) { return staff[k]; }).sort(function(a, b) { return b.qty - a.qty; });
  return z;
}
export function dcLoiTong(z: { loiNhap: number; loiTra: number; loiNs: number }): number { return z.loiNhap + z.loiTra + z.loiNs; }

// Tốt: lệch ước tính ≤ 1% và lỗi nhân sự ≤ 0,5% sản lượng; Đạt: ≤ 3% và ≤ 1%; còn lại Cần xem lại
export function dcRating(x: DcStaffStat): 'none' | 'tot' | 'dat' | 'xem' {
  if (!x.qty) return 'none';
  var r = dcPct(x.lech, x.qty);
  var e = dcPct(x.loiNs, x.qty);
  if (r <= 1 && e <= 0.5) return 'tot';
  if (r <= 3 && e <= 1) return 'dat';
  return 'xem';
}

// Lũy kế lệch theo mã trong n ngày gần nhất (tính từ ngày mới nhất đã lưu)
export interface DcLk { ma: string; ten: string; dBan: number; dNhap: number; days: number; tot: number }
export function dcLuyKe(sessions: DcSession[], n: number, ctx: DcCtx): { rows: DcLk[]; soNgay: number } {
  if (!sessions.length) return { rows: [], soNgay: 0 };
  var sorted = sessions.slice().sort(function(a, b) { return b.ngay.localeCompare(a.ngay); });
  var startIso = dcAddDays(sorted[0].ngay, -n + 1);
  var use = sorted.filter(function(s) { return s.ngay >= startIso; });
  var acc = new Map<string, DcLk>();
  use.forEach(function(s) {
    dcCompute(s.sapo ? s.sapo.rows : [], dcRowsOf(s), ctx).forEach(function(r) {
      if (r.st === 'khop') return;
      var a = acc.get(r.k) || { ma: r.ma, ten: r.ten, dBan: 0, dNhap: 0, days: 0, tot: 0 };
      a.dBan += r.dBan; a.dNhap += r.dNhap; a.days++;
      acc.set(r.k, a);
    });
  });
  var rows: DcLk[] = [];
  acc.forEach(function(a) { a.tot = Math.abs(dcR3(a.dBan)) + Math.abs(dcR3(a.dNhap)); rows.push(a); });
  rows.sort(function(a, b) { return b.tot - a.tot || b.days - a.days; });
  return { rows: rows, soNgay: use.length };
}

// Các ngày chưa lưu đối chiếu trong khoảng [from, to] (bỏ qua Chủ nhật vì kho thường nghỉ; hiển thị để người dùng tự quyết)
export function dcMissingDays(saved: string[], from: string, to: string): string[] {
  var have = new Set(saved);
  var out: string[] = [];
  for (var d = from; d <= to; d = dcAddDays(d, 1)) {
    var dow = new Date(d + 'T00:00:00Z').getUTCDay();
    if (dow === 0) continue;
    if (!have.has(d)) out.push(d);
  }
  return out;
}

// Câu lệnh gửi kèm ảnh sổ cho Claude để chép thành bảng dán được
export function dcBuildPrompt(staff: string[]): string {
  return 'Chép lại các trang SỔ KHO viết tay trong ảnh thành MỘT bảng, mỗi dòng một mã hàng, các cột phân tách bằng TAB, có dòng tiêu đề đúng thứ tự:\n' +
    'SKU\t' + staff.join('\t') + '\tNhập\tGhi chú\tHàng nhập\tHàng trả\tNhân sự\n' +
    'Quy tắc:\n' +
    '- Chép MỌI dòng có mã hàng, đúng như người viết, theo thứ tự trên trang. Không gộp dòng, không bỏ dòng, không tự cộng.\n' +
    '- Số ở cột tên người nào thì để đúng cột đó. Ô trống hoặc gạch ngang là 0. Ô ghi bằng gạch đếm (|||| hoặc 正) thì đếm số gạch.\n' +
    '- Cột Ghi chú chép chữ ghi chú trên sổ. 3 cột cuối (Hàng nhập, Hàng trả, Nhân sự) là số hàng lỗi.\n' +
    '- Chữ số hoặc mã khó đọc: ghi giá trị đoán được và thêm "(?)" vào Ghi chú của dòng đó. Không tự sửa mã.\n' +
    '- Nếu sổ có tên người xuất hàng không nằm trong danh sách trên, thêm một cột với đúng tên đó ngay sau cột ' + staff[staff.length - 1] + '.\n' +
    'Chỉ trả về bảng, không giải thích.';
}
