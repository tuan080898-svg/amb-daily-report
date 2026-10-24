// Sổ kho thực tế: Sếp nhập tồn kho đếm thực tế tại một thời điểm (kiểm kho), từ đó các phiếu xuất kho tự trừ vào kho.
//
// Nguyên tắc tính (không lưu "số đã trừ" ở đâu cả, luôn tính lại từ dữ liệu gốc, nên không thể trừ hai lần hay quên trả lại):
//   Tồn(sản phẩm, kho) = Số kiểm kho gần nhất của sản phẩm đó + Nhập/điều chỉnh SAU thời điểm kiểm − Hàng xuất theo phiếu SAU thời điểm kiểm
//   - Hàng xuất theo phiếu: mỗi đơn chỉ tính MỘT lần, ở phiếu lập sớm nhất còn tồn tại (cùng sàn + cùng mã đơn). Lập lại phiếu hay in lại không trừ thêm.
//   - Phiếu lập trước thời điểm kiểm kho không trừ (số kiểm đã phản ánh hàng thực tế lúc đó).
//   - Xóa phiếu thì phần đã trừ tự quay lại kho; lập lại phiếu đó thì trừ lại đúng một lần.
//   - Phiếu trừ vào kho ghi trên phiếu (batch.warehouse, lấy theo tài khoản nhân sự kho).

import type { PxkBatch } from './pxk';

export type SkKho = 'HCM' | 'HN';
export var SK_KHO: SkKho[] = ['HCM', 'HN'];
export var SK_KHO_LABEL: Record<SkKho, string> = { HCM: 'Kho HCM', HN: 'Kho Hà Nội' };

export interface SkAnchor {
  id: string;
  session: string; // một lần kiểm kho (nhiều sản phẩm cùng thời điểm)
  kho: SkKho;
  product: string;
  qty: number;
  at: string; // ISO: thời điểm kiểm kho
  savedAt: string; // ISO: lúc bấm lưu
  by: string;
  note?: string;
}

export interface SkMove {
  id: string;
  kho: SkKho;
  product: string;
  qty: number; // dương = cộng vào kho, âm = trừ ra
  type: 'import' | 'adjust';
  at: string;
  savedAt: string;
  by: string;
  note: string;
}

export interface SkData {
  khoUsers: Record<string, SkKho>; // mã tài khoản nhân sự kho -> kho
  anchors: SkAnchor[];
  moves: SkMove[];
  hidden: Record<SkKho, string[]>; // sản phẩm Sếp đã bỏ khỏi danh sách của từng kho (không xóa dữ liệu, hiện lại được)
  extra: string[]; // sản phẩm Sếp tự thêm, ngoài bảng quy đổi SKU (vd vật tư đóng gói)
}

export function skEmptyData(): SkData { return { khoUsers: {}, anchors: [], moves: [], hidden: { HCM: [], HN: [] }, extra: [] }; }

// Danh sách sản phẩm đang theo dõi của một kho: sản phẩm trong bảng quy đổi SKU + sản phẩm tự thêm, trừ sản phẩm đã bỏ
export function skVisibleProducts(fromMapping: string[], data: SkData, kho: SkKho): string[] {
  var hide = new Set(data.hidden[kho] || []);
  var set = new Set<string>();
  fromMapping.concat(data.extra || []).forEach(function(p) { if (!hide.has(p)) set.add(p); });
  return Array.from(set).sort(function(a, b) { return a.localeCompare(b, 'vi'); });
}

export interface SkProductQty { sku: string; quantity: number; product: string }

export interface SkDeduct { batchId: string; batchAt: number; kho: SkKho; product: string; qty: number }
export interface SkUnmapped { key: string; label: string; qty: number; batches: string[] }
export interface SkSlipCalc {
  deducts: SkDeduct[];
  dupOrders: number; // số đơn lặp (bỏ qua, không trừ lần hai)
  noKho: Array<{ id: string; orders: number }>; // phiếu sau thời điểm kiểm nhưng không ghi kho
  unmapped: SkUnmapped[]; // dòng hàng không quy ra được sản phẩm (chưa trừ được)
}

function ms(iso: string): number { var t = Date.parse(iso); return isFinite(t) ? t : 0; }

// getProducts: tra SKU -> các sản phẩm gốc (bảng quy đổi SKU của app)
export function skCalcSlips(batches: PxkBatch[], fromTime: number, getProducts: (sku: string) => Array<{ product: string; quantity: number }>): SkSlipCalc {
  var sorted = batches.slice().sort(function(a, b) { return ms(a.createdAt) - ms(b.createdAt) || a.id.localeCompare(b.id); });
  var seen = new Set<string>();
  var out: SkSlipCalc = { deducts: [], dupOrders: 0, noKho: [], unmapped: [] };
  var unm: Record<string, SkUnmapped> = {};
  sorted.forEach(function(b) {
    var t = ms(b.createdAt);
    var per: Record<string, number> = {};
    var kept = 0;
    b.orders.forEach(function(o) {
      var key = b.platform + ':' + o.orderId;
      if (seen.has(key)) { out.dupOrders++; return; }
      seen.add(key);
      kept++;
      if (t < fromTime) return;
      o.items.forEach(function(it) {
        if (!(it.qty > 0)) return;
        var sku = (it.sku || '').trim();
        if (!sku) {
          var k0 = 'name:' + it.name;
          var u0 = unm[k0] || (unm[k0] = { key: k0, label: it.name || '(không tên)', qty: 0, batches: [] });
          u0.qty += it.qty; if (u0.batches.indexOf(b.id) < 0) u0.batches.push(b.id);
          return;
        }
        var prods = getProducts(sku);
        if (!prods.length) {
          var k1 = 'sku:' + sku;
          var u1 = unm[k1] || (unm[k1] = { key: k1, label: sku, qty: 0, batches: [] });
          u1.qty += it.qty; if (u1.batches.indexOf(b.id) < 0) u1.batches.push(b.id);
          return;
        }
        prods.forEach(function(p) { per[p.product] = (per[p.product] || 0) + p.quantity * it.qty; });
      });
    });
    if (t < fromTime) return;
    if (!b.warehouse) { if (kept > 0) out.noKho.push({ id: b.id, orders: kept }); return; }
    var kho = b.warehouse;
    Object.keys(per).forEach(function(p) { out.deducts.push({ batchId: b.id, batchAt: t, kho: kho, product: p, qty: per[p] }); });
  });
  out.unmapped = Object.keys(unm).map(function(k) { return unm[k]; }).sort(function(a, b) { return b.qty - a.qty; });
  return out;
}

export interface SkRow {
  product: string;
  kho: SkKho;
  anchor: SkAnchor | null; // null = chưa nhập tồn kiểm kho cho sản phẩm này
  moveQty: number; // nhập + điều chỉnh sau lúc kiểm
  slipQty: number; // đã xuất theo phiếu sau lúc kiểm
  stock: number | null;
}

// Số kiểm kho hiệu lực của sản phẩm trong kho: bản có thời điểm kiểm muộn nhất (cùng thời điểm thì bản lưu sau)
export function skLatestAnchor(anchors: SkAnchor[], kho: SkKho, product: string): SkAnchor | null {
  var best: SkAnchor | null = null;
  anchors.forEach(function(a) {
    if (a.kho !== kho || a.product !== product) return;
    if (!best || ms(a.at) > ms(best.at) || (ms(a.at) === ms(best.at) && ms(a.savedAt) > ms(best.savedAt))) best = a;
  });
  return best;
}

export function skStock(data: SkData, calc: SkSlipCalc, kho: SkKho, products: string[]): SkRow[] {
  var names = new Set(products);
  data.anchors.forEach(function(a) { if (a.kho === kho) names.add(a.product); });
  data.moves.forEach(function(m) { if (m.kho === kho) names.add(m.product); });
  calc.deducts.forEach(function(d) { if (d.kho === kho) names.add(d.product); });
  var rows: SkRow[] = [];
  names.forEach(function(p) {
    var anchor = skLatestAnchor(data.anchors, kho, p);
    var from = anchor ? ms(anchor.at) : 0;
    var moveQty = 0;
    data.moves.forEach(function(m) { if (m.kho === kho && m.product === p && ms(m.at) > from) moveQty += m.qty; });
    var slipQty = 0;
    calc.deducts.forEach(function(d) { if (d.kho === kho && d.product === p && d.batchAt > from) slipQty += d.qty; });
    rows.push({ product: p, kho: kho, anchor: anchor, moveQty: moveQty, slipQty: slipQty, stock: anchor ? anchor.qty + moveQty - slipQty : null });
  });
  return rows.sort(function(a, b) { return a.product.localeCompare(b.product, 'vi'); });
}

export interface SkHistoryLine { at: number; kind: 'kiem' | 'nhap' | 'dieuchinh' | 'phieu'; qty: number; label: string; counted: boolean }

// Các biến động của một sản phẩm (để xem vì sao tồn ra số này): dòng "counted" = đang được tính vào tồn hiện tại
export function skProductHistory(data: SkData, calc: SkSlipCalc, kho: SkKho, product: string): SkHistoryLine[] {
  var anchor = skLatestAnchor(data.anchors, kho, product);
  var from = anchor ? ms(anchor.at) : 0;
  var out: SkHistoryLine[] = [];
  data.anchors.forEach(function(a) {
    if (a.kho === kho && a.product === product) out.push({ at: ms(a.at), kind: 'kiem', qty: a.qty, label: 'Kiểm kho' + (a.note ? ': ' + a.note : '') + ' (' + a.by + ')', counted: a === anchor });
  });
  data.moves.forEach(function(m) {
    if (m.kho === kho && m.product === product) out.push({ at: ms(m.at), kind: m.type === 'import' ? 'nhap' : 'dieuchinh', qty: m.qty, label: (m.type === 'import' ? 'Nhập hàng' : 'Điều chỉnh') + (m.note ? ': ' + m.note : '') + ' (' + m.by + ')', counted: ms(m.at) > from });
  });
  calc.deducts.forEach(function(d) {
    if (d.kho === kho && d.product === product) out.push({ at: d.batchAt, kind: 'phieu', qty: -d.qty, label: 'Phiếu ' + d.batchId, counted: d.batchAt > from });
  });
  return out.sort(function(a, b) { return b.at - a.at; });
}

// ---------- đọc bảng kiểm kho dán từ Excel ----------
export interface SkParsedCount { items: Array<{ product: string; qty: number }>; errors: string[] }

var normName = function(s: string) { return s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''); };

// Mỗi dòng: "SKU hoặc tên sản phẩm", số lượng (cách nhau bằng Tab, dấu ; hoặc nhiều khoảng trắng). SKU lẻ (1 sản phẩm × 1) tự quy ra sản phẩm.
export function skParseCount(text: string, products: string[], getProducts: (sku: string) => Array<{ product: string; quantity: number }>): SkParsedCount {
  var byName: Record<string, string> = {};
  products.forEach(function(p) { byName[normName(p)] = p; });
  var sum: Record<string, number> = {};
  var errors: string[] = [];
  text.split(/\r?\n/).forEach(function(line) {
    var l = line.trim();
    if (!l) return;
    var cells = l.indexOf('\t') >= 0 ? l.split('\t') : l.indexOf(';') >= 0 ? l.split(';') : l.split(/\s{2,}/);
    if (cells.length < 2) { var m = /^(.*\S)\s+(-?[\d.,]+)$/.exec(l); if (m) cells = [m[1], m[2]]; }
    cells = cells.map(function(c) { return c.trim(); }).filter(function(c) { return c !== ''; });
    if (cells.length < 2) { errors.push('Không đọc được dòng: ' + l.slice(0, 50)); return; }
    var qtyRaw = cells[cells.length - 1];
    if (/^\d{1,3}(\.\d{3})+$/.test(qtyRaw)) qtyRaw = qtyRaw.replace(/\./g, '');
    qtyRaw = qtyRaw.replace(',', '.');
    var qty = parseFloat(qtyRaw);
    var label = cells[0];
    if (!isFinite(qty)) { if (/^(sku|mã|ma|tên|sản phẩm)/i.test(label)) return; errors.push('Số lượng không hợp lệ: ' + l.slice(0, 50)); return; }
    var prod = byName[normName(label)];
    if (!prod) {
      var ps = getProducts(label.toUpperCase().replace(/\s+/g, ''));
      if (ps.length === 1 && ps[0].quantity === 1) prod = ps[0].product;
      else if (ps.length === 1) { errors.push('Mã ' + label + ' là combo ' + ps[0].quantity + ' cái, hãy ghi theo số cái lẻ của sản phẩm "' + ps[0].product + '"'); return; }
      else if (ps.length > 1) { errors.push('Mã ' + label + ' là bộ nhiều sản phẩm, hãy ghi từng sản phẩm lẻ'); return; }
    }
    if (!prod) { errors.push('Không có sản phẩm hoặc SKU "' + label + '"'); return; }
    sum[prod] = (sum[prod] || 0) + qty;
  });
  return { items: Object.keys(sum).map(function(p) { return { product: p, qty: sum[p] }; }), errors: errors };
}

// ---------- đọc file Excel kiểm kho ----------
// File mẫu tải từ trang (Sản phẩm | Mã SKU | Tồn hiện tại | Số đếm thực tế) hoặc file "Tải Excel" của bảng tồn (có cột "Số kiểm kho"). Cột số lượng chọn theo thứ tự ưu tiên;
// ô số lượng để trống thì bỏ qua (nên file mẫu chỉ điền những sản phẩm đã đếm). Không có dòng tiêu đề: cột 1 là tên/SKU, cột 2 là số lượng.
export interface SkParsedSheet extends SkParsedCount { qtyHeader: string; rows: number }

var QTY_HEADERS: RegExp[] = [/^số đếm/, /^số kiểm/, /^đếm thực tế/, /^thực tế/, /^số lượng/, /^sl$/, /^tồn kiểm/, /^tồn thực/, /^tồn$/, /^tồn hiện tại/];

export function skParseCountSheet(aoa: unknown[][], products: string[], getProducts: (sku: string) => Array<{ product: string; quantity: number }>): SkParsedSheet {
  var cellStr = function(c: unknown) { return String(c === null || c === undefined ? '' : c).trim(); };
  var low = function(c: unknown) { return cellStr(c).normalize('NFC').toLowerCase(); };
  var nameSet = new Set(products.map(normName));
  var hRow = -1, nameCol = -1, skuCol = -1, qtyCol = -1, qtyHeader = '';
  for (var i = 0; i < Math.min(10, aoa.length) && hRow < 0; i++) {
    var cells = (aoa[i] || []).map(low);
    var nc = cells.findIndex(function(c) { return /^(sản phẩm|tên sản phẩm|tên hàng|tên)$/.test(c); });
    var sc = cells.findIndex(function(c) { return /^(mã sku|sku|mã hàng|mã)$/.test(c); });
    var qc = -1, qh = '';
    for (var k = 0; k < QTY_HEADERS.length && qc < 0; k++) {
      qc = cells.findIndex(function(c) { return QTY_HEADERS[k].test(c); });
      if (qc >= 0) qh = cellStr((aoa[i] || [])[qc]);
    }
    if ((nc >= 0 || sc >= 0) && qc >= 0) { hRow = i; nameCol = nc; skuCol = sc; qtyCol = qc; qtyHeader = qh; }
  }
  if (hRow < 0) { hRow = -1; nameCol = 0; skuCol = -1; qtyCol = 1; qtyHeader = '(cột thứ 2)'; }
  var lines: string[] = [];
  var rows = 0;
  for (var r = hRow + 1; r < aoa.length; r++) {
    var row = aoa[r] || [];
    var qty = cellStr(row[qtyCol]);
    if (qty === '') continue;
    var nm = nameCol >= 0 ? cellStr(row[nameCol]) : '';
    var sku = skuCol >= 0 ? cellStr(row[skuCol]) : '';
    var label = nm && nameSet.has(normName(nm)) ? nm : (sku && sku.indexOf('/') < 0 && sku.indexOf('·') < 0 ? sku : nm || sku);
    if (!label) continue;
    rows++;
    lines.push(label.replace(/\t/g, ' ') + '\t' + qty);
  }
  var res = skParseCount(lines.join('\n'), products, getProducts);
  return { items: res.items, errors: res.errors, qtyHeader: qtyHeader, rows: rows };
}

// ---------- đọc file Excel danh sách sản phẩm ----------
// Lấy cột tên sản phẩm (tiêu đề "Sản phẩm"/"Tên sản phẩm"/"Tên") hoặc cột SKU (SKU lẻ quy ra sản phẩm). Không có tiêu đề: cột 1.
// known = các sản phẩm đã biết (bảng quy đổi SKU + tự thêm + đã ẩn); tên không nằm trong đó sẽ thành sản phẩm tự thêm (isNew).
export interface SkParsedProducts { names: string[]; isNew: string[]; errors: string[] }

export function skParseProductSheet(aoa: unknown[][], known: string[], getProducts: (sku: string) => Array<{ product: string; quantity: number }>): SkParsedProducts {
  var cellStr = function(c: unknown) { return String(c === null || c === undefined ? '' : c).trim(); };
  var byKey: Record<string, string> = {};
  known.forEach(function(p) { byKey[normName(p)] = p; });
  var hRow = -1, nameCol = -1, skuCol = -1;
  for (var i = 0; i < Math.min(10, aoa.length) && hRow < 0; i++) {
    var cells = (aoa[i] || []).map(function(c) { return cellStr(c).normalize('NFC').toLowerCase(); });
    var nc = cells.findIndex(function(c) { return /^(sản phẩm|tên sản phẩm|tên hàng|tên)$/.test(c); });
    var sc = cells.findIndex(function(c) { return /^(mã sku|sku|mã hàng|mã)$/.test(c); });
    if (nc >= 0 || sc >= 0) { hRow = i; nameCol = nc; skuCol = sc; }
  }
  if (hRow < 0) { nameCol = 0; }
  var seen = new Set<string>();
  var names: string[] = [];
  var isNew: string[] = [];
  var errors: string[] = [];
  for (var r = hRow + 1; r < aoa.length; r++) {
    var row = aoa[r] || [];
    var nm = nameCol >= 0 ? cellStr(row[nameCol]) : '';
    var sku = skuCol >= 0 ? cellStr(row[skuCol]) : '';
    if (!nm && !sku) continue;
    var p = nm ? byKey[normName(nm)] : undefined;
    if (!p && sku && sku.indexOf('/') < 0 && sku.indexOf('·') < 0) {
      var ps = getProducts(sku.toUpperCase().replace(/\s+/g, ''));
      if (ps.length === 1 && ps[0].quantity === 1) p = ps[0].product;
      else if (ps.length > 0 && !nm) { errors.push('Mã ' + sku + ' là combo/bộ, hãy ghi tên sản phẩm lẻ'); continue; }
    }
    if (!p) {
      if (!nm) { errors.push('Không có sản phẩm hoặc SKU "' + sku + '"'); continue; }
      p = nm;
      if (!seen.has(normName(p))) isNew.push(p);
    }
    if (seen.has(normName(p))) continue;
    seen.add(normName(p));
    names.push(p);
  }
  return { names: names, isNew: isNew, errors: errors };
}
