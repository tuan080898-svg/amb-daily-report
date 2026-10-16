// Phiếu xuất kho từ file PDF in đơn của Shopee / TikTok.
// Đọc PDF ngay trên máy nhân sự (không gửi file đi đâu, không dùng AI), gom theo SKU để kho đi nhặt.

import { getSkuProducts, getSkuMap } from './sku';

export type PxkPlatform = 'shopee' | 'tiktok';
export var PXK_PLATFORM_LABELS: Record<PxkPlatform, string> = { shopee: 'Shopee', tiktok: 'TikTok Shop' };

export interface PxkItem {
  sku: string; // rỗng nếu nhãn không có SKU (Shopee) và chưa gắn được
  name: string; // tên sản phẩm + phân loại ghi trên nhãn (nếu đọc được)
  qty: number;
}

export interface PxkOrder {
  orderId: string;
  items: PxkItem[];
  totalQty: number; // tổng SL ghi trên nhãn
  ok: boolean; // tổng các dòng khớp tổng SL trên nhãn
  pages: number[];
  file: string;
}

export interface PxkBatch {
  id: string;
  platform: PxkPlatform;
  warehouse: 'HCM' | 'HN';
  printDate: string; // YYYY-MM-DD
  createdAt: string; // ISO
  createdBy: string;
  deducted?: boolean; // không còn dùng (phiếu cũ có thể còn trường này)
  issues?: string[]; // các nhãn đọc chưa chắc chắn lúc lập phiếu (in cảnh báo lên phiếu)
  orders: Array<{ orderId: string; items: PxkItem[] }>;
}

export interface PxkData {
  names: Record<string, string>; // khoá tên Shopee đã chuẩn hoá -> SKU
  ambiguous?: Record<string, string[]>; // cùng một tên nhưng file đơn ghi nhiều SKU khác nhau
  batches: PxkBatch[];
}

// ==================== Đọc PDF ====================

export interface RawItem { s: string; x: number; y: number }

function toLines(items: RawItem[]): string[] {
  var rows: Array<{ y: number; a: RawItem[] }> = [];
  items.forEach(function(i) {
    var r = rows.find(function(r) { return Math.abs(r.y - i.y) < 2.5; });
    if (!r) { r = { y: i.y, a: [] }; rows.push(r); }
    r.a.push(i);
  });
  return rows
    .sort(function(a, b) { return b.y - a.y; })
    .map(function(r) { return r.a.sort(function(p, q) { return p.x - q.x; }).map(function(o) { return o.s; }).join(''); });
}

async function readPages(file: File): Promise<RawItem[][]> {
  var pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  var buf = new Uint8Array(await file.arrayBuffer());
  var doc = await pdfjs.getDocument({ data: buf, useSystemFonts: true, verbosity: 0 }).promise;
  var out: RawItem[][] = [];
  for (var p = 1; p <= doc.numPages; p++) {
    var tc = await (await doc.getPage(p)).getTextContent();
    var items: RawItem[] = [];
    tc.items.forEach(function(it) {
      var t = it as { str: string; transform: number[] };
      if (t.str !== '') items.push({ s: t.str, x: t.transform[4], y: t.transform[5] });
    });
    out.push(items);
  }
  return out;
}

function parseTiktokPages(pages: RawItem[][], fileName: string): PxkOrder[] {
  var orders: PxkOrder[] = [];
  var pendingItems: PxkItem[] = [];
  var pendingPages: number[] = [];
  pages.forEach(function(items, idx) {
    var lines = toLines(items);
    var hSeller = items.find(function(i) { return i.s.trim() === 'Seller SKU'; });
    var hQty = items.find(function(i) { return i.s.trim() === 'Qty'; });
    var totLine = lines.find(function(t) { return /Qty Total/.test(t); });
    var orderLine = lines.find(function(t) { return /^Order ID:\s*\d+/.test(t); });
    var hTot = items.find(function(i) { return /^Qty Total/.test(i.s.trim()); });
    // Nhãn dài 2 trang: trang đầu chỉ có dòng sản phẩm, trang sau mới có "Qty Total" + "Order ID"
    var pageItems: PxkItem[] = [];
    if (hSeller && hQty) {
      var yMin = hTot ? hTot.y + 1 : -1e9;
      var body = items.filter(function(i) { return i.y < hSeller!.y - 2 && i.y > yMin; });
      var qtys = body.filter(function(i) { return i.x >= hQty!.x - 3 && /^\d+$/.test(i.s.trim()); });
      var skus = body.filter(function(i) { return i.x >= hSeller!.x - 4 && i.x < hQty!.x - 3; });
      qtys.forEach(function(q) {
        var near = skus.filter(function(s) { return Math.abs(s.y - q.y) < 3; }).sort(function(a, b) { return a.x - b.x; }).map(function(s) { return s.s.trim(); }).join('');
        pageItems.push({ sku: near, name: '', qty: Number(q.s) });
      });
    } else {
      // trang tiếp theo của nhãn dài: không có tiêu đề bảng, dòng sản phẩm nằm cột SKU/Qty cũ
      var cont = items.filter(function(i) { return /^\d+$/.test(i.s.trim()) && i.x > 255 && i.x < 290; });
      var contSku = items.filter(function(i) { return i.x >= 168 && i.x < 250; });
      cont.forEach(function(q) {
        var near = contSku.filter(function(s) { return Math.abs(s.y - q.y) < 3; }).map(function(s) { return s.s.trim(); }).join('');
        if (near) pageItems.push({ sku: near, name: '', qty: Number(q.s) });
      });
    }
    pendingItems = pendingItems.concat(pageItems);
    pendingPages.push(idx + 1);
    if (!totLine) return; // chờ trang sau
    var total = Number(totLine.replace(/\D/g, ''));
    var sum = pendingItems.reduce(function(s, x) { return s + x.qty; }, 0);
    orders.push({
      orderId: orderLine ? orderLine.replace(/^Order ID:\s*/, '').trim() : '',
      items: pendingItems,
      totalQty: total,
      ok: sum === total && pendingItems.every(function(i) { return !!i.sku; }),
      pages: pendingPages,
      file: fileName,
    });
    pendingItems = [];
    pendingPages = [];
  });
  if (pendingPages.length > 0) {
    orders.push({ orderId: '', items: pendingItems, totalQty: 0, ok: false, pages: pendingPages, file: fileName });
  }
  return orders;
}

// Một dòng hàng trên nhãn Shopee: "Tên sản phẩm, Phân loại, SL: n". Có nhãn viết ",SL: n" (dính dấu phẩy) hoặc "SL:n".
export function parseShopeeItemText(raw: string): { name: string; qty: number } {
  var c = raw.replace(/\s+/g, ' ').trim();
  var m = c.match(/^(.*?)[,\s]*SL\s*:\s*(\d+)\s*$/i);
  if (m) return { name: m[1].replace(/[,\s]+$/, '').trim(), qty: Number(m[2]) };
  return { name: c, qty: 0 };
}

function parseShopeePages(pages: RawItem[][], fileName: string): PxkOrder[] {
  var orders: PxkOrder[] = [];
  pages.forEach(function(items, idx) {
    var lines = toLines(items);
    var iStart = lines.findIndex(function(t) { return /^Nội dung hàng/.test(t); });
    var orderId = (lines.find(function(t) { return /^Mã đơn hàng/.test(t); }) || '').replace(/^Mã đơn hàng:?\s*/, '').trim();
    if (iStart < 0) {
      orders.push({ orderId: orderId, items: [], totalQty: 0, ok: false, pages: [idx + 1], file: fileName });
      return;
    }
    var tot = Number(((lines[iStart].match(/Tổng SL sản phẩm:\s*(\d+)/) || [0, 0])[1]));
    var chunks: string[] = [];
    for (var k = iStart + 1; k < lines.length; k++) {
      var t = lines[k];
      if (/^(HN|HCM|SG)-\d|^Ngày đặt hàng|^[A-Z]{2,}-[A-Z0-9]+-?$/.test(t) && chunks.length) break;
      if (/^\d+\.\s/.test(t)) chunks.push(t.replace(/^\d+\.\s/, ''));
      else if (chunks.length) chunks[chunks.length - 1] += t;
    }
    var its: PxkItem[] = chunks.map(function(c) {
      var p = parseShopeeItemText(c);
      return { sku: '', name: p.name, qty: p.qty };
    });
    var sum = its.reduce(function(s, x) { return s + x.qty; }, 0);
    // Một dòng không đọc được số lượng nhưng tổng SL trên nhãn đã biết: suy ra số lượng còn thiếu
    var unparsed = its.filter(function(i) { return i.qty <= 0; });
    if (unparsed.length === 1 && tot > sum) { unparsed[0].qty = tot - sum; sum = tot; }
    orders.push({ orderId: orderId, items: its, totalQty: tot, ok: sum === tot && its.every(function(i) { return i.qty > 0; }), pages: [idx + 1], file: fileName });
  });
  return orders;
}

export function parsePxkPages(pages: RawItem[][], platform: PxkPlatform, fileName: string): PxkOrder[] {
  return platform === 'tiktok' ? parseTiktokPages(pages, fileName) : parseShopeePages(pages, fileName);
}

export async function parsePxkFile(file: File, platform: PxkPlatform): Promise<PxkOrder[]> {
  return parsePxkPages(await readPages(file), platform, file.name);
}

// Nhận diện sàn từ chữ trên nhãn: Shopee có "Nội dung hàng / Tổng SL sản phẩm", TikTok có "Product Name / Seller SKU / Qty Total".
export function detectPxkPlatform(pages: RawItem[][]): PxkPlatform | null {
  var shopee = 0;
  var tiktok = 0;
  pages.slice(0, 5).forEach(function(items) {
    var text = toLines(items).join('\n');
    if (/Nội dung hàng|Tổng SL sản phẩm|Mã đơn hàng/.test(text)) shopee++;
    if (/Seller SKU|Product Name|Qty Total|Order ID:/.test(text)) tiktok++;
  });
  if (shopee > tiktok) return 'shopee';
  if (tiktok > shopee) return 'tiktok';
  return null;
}

// Đọc một file PDF, tự nhận diện sàn (hoặc dùng sàn được chỉ định tay).
export async function parsePxkFileAuto(file: File, force?: PxkPlatform): Promise<{ platform: PxkPlatform | null; orders: PxkOrder[] }> {
  var pages = await readPages(file);
  var platform = force || detectPxkPlatform(pages);
  if (!platform) return { platform: null, orders: [] };
  return { platform: platform, orders: parsePxkPages(pages, platform, file.name) };
}

// Đoán kho từ tên file (vd "HN 14.10 hana sáng tt.pdf" -> HN). Không đoán được thì trả null.
export function guessWarehouse(fileName: string): 'HCM' | 'HN' | null {
  var n = fileName.normalize('NFC');
  var hn = /(^|[^A-Za-z])HN([^A-Za-z]|$)|hà\s*nội|ha\s*noi|hanoi/i.test(n);
  var hcm = /(^|[^A-Za-z])(HCM|SG|TPHCM)([^A-Za-z]|$)|sài\s*gòn|sai\s*gon|hồ\s*chí\s*minh/i.test(n);
  if (hn && !hcm) return 'HN';
  if (hcm && !hn) return 'HCM';
  return null;
}

// ==================== Gắn SKU cho Shopee ====================

// Khoá so khớp tên: chỉ giữ chữ và số (bỏ khoảng trắng, dấu phẩy...) vì nhãn PDF hay dính/tách chữ khi xuống dòng.
export function pxkNameKey(name: string): string {
  return name.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

// ==================== Học quy luật tên -> SKU từ file đơn hàng Shopee ====================
// File đơn Shopee có cột "Tên sản phẩm", "Tên phân loại hàng", "SKU phân loại hàng". Nhãn PDF in "Tên sản phẩm, Tên phân loại".
// Mỗi cặp (tên + phân loại) của một shop tương ứng đúng một SKU nên học được từ chính file đơn của shop đó.

export type PxkLearnedPairs = Record<string, Record<string, number>>; // khoá -> { SKU: số dòng }

function pickCell(row: Record<string, unknown>, name: string): string {
  var want = name.normalize('NFC');
  for (var k in row) {
    if (k.normalize('NFC').trim() === want) return String(row[k] == null ? '' : row[k]).trim();
  }
  return '';
}

export function extractShopeePairs(rows: Array<Record<string, unknown>>, into?: PxkLearnedPairs): { pairs: PxkLearnedPairs; lines: number } {
  var pairs: PxkLearnedPairs = into || {};
  var lines = 0;
  rows.forEach(function(r) {
    // Bỏ xuống dòng và dấu chấm/khoảng trắng thừa ở cuối mã (lỗi gõ hay gặp: "GH063." thay vì "GH063")
    var sku = pickCell(r, 'SKU phân loại hàng').replace(/\n/g, '').replace(/[.\s]+$/, '');
    var name = pickCell(r, 'Tên sản phẩm');
    if (!sku || !name) return;
    var vari = pickCell(r, 'Tên phân loại hàng');
    var key = pxkNameKey(vari ? name + ', ' + vari : name);
    if (!key) return;
    lines += 1;
    var m = pairs[key] || (pairs[key] = {});
    m[sku] = (m[sku] || 0) + 1;
  });
  return { pairs: pairs, lines: lines };
}

// Gộp cặp mới học vào từ điển đã lưu. Tên có đúng một SKU -> tự gắn; nhiều SKU -> để nhân sự chọn (kèm gợi ý).
export function mergeLearnedPairs(cur: PxkData, pairs: PxkLearnedPairs): { data: PxkData; added: number; ambiguous: number } {
  var names = Object.assign({}, cur.names);
  var amb: Record<string, string[]> = Object.assign({}, cur.ambiguous || {});
  var added = 0;
  Object.keys(pairs).forEach(function(key) {
    var cand = new Set<string>(Object.keys(pairs[key]));
    if (names[key]) cand.add(names[key]);
    (amb[key] || []).forEach(function(s) { cand.add(s); });
    if (cand.size === 1) {
      var sku = Array.from(cand)[0];
      if (names[key] !== sku) added += 1;
      names[key] = sku;
      delete amb[key];
    } else {
      delete names[key];
      amb[key] = Array.from(cand).sort();
    }
  });
  return { data: { names: names, ambiguous: amb, batches: cur.batches }, added: added, ambiguous: Object.keys(amb).length };
}

// ==================== Tổng hợp ====================

export interface PxkSkuLine {
  sku: string;
  name: string;
  qty: number;
  orders: number;
  mapped: boolean; // SKU có trong bảng quy đổi
  variation: string; // phân loại ghi trên nhãn (Shopee)
  orderIds: string[];
}

export interface PxkUnresolvedLine { key: string; name: string; variation: string; qty: number; orders: number; orderIds: string[] }

// Nhãn Shopee ghi "Tên sản phẩm, Phân loại": tách ở dấu phẩy cuối cùng.
export function splitShopeeName(text: string): { name: string; variation: string } {
  var i = text.lastIndexOf(', ');
  return i > 0 ? { name: text.slice(0, i).trim(), variation: text.slice(i + 2).trim() } : { name: text.trim(), variation: '' };
}

export interface PxkProductLine {
  product: string;
  skus: string; // mã SKU lẻ (1 sản phẩm, SL 1) của sản phẩm gốc, ngăn cách bằng " / "
  qty: number;
}

// Sản phẩm gốc -> các mã SKU lẻ của nó trong bảng quy đổi (bỏ qua combo / mã nhân số lượng)
function baseSkusByProduct(): Record<string, string[]> {
  var out: Record<string, string[]> = {};
  var map = getSkuMap();
  Object.keys(map).forEach(function(code) {
    var items = map[code];
    if (items.length === 1 && items[0].quantity === 1) {
      (out[items[0].product] || (out[items[0].product] = [])).push(code);
    }
  });
  Object.keys(out).forEach(function(p) { out[p].sort(function(a, b) { return a.localeCompare(b, undefined, { numeric: true }); }); });
  return out;
}

export interface PxkSummary {
  skuLines: PxkSkuLine[];
  unresolved: PxkUnresolvedLine[]; // Shopee: chưa có SKU
  unmappedSkus: string[];
  productLines: PxkProductLine[]; // quy ra sản phẩm gốc (để kho nhặt)
  hasCombo: boolean;
  totalQty: number;
  orderCount: number;
}

// Gộp các dòng cùng sản phẩm trong combo: "5× Thuốc diệt gián" thay vì lặp 5 lần.
function describeSku(items: Array<{ product: string; quantity: number }>): string {
  var qty: Record<string, number> = {};
  var order: string[] = [];
  items.forEach(function(p) {
    if (!(p.product in qty)) { qty[p.product] = 0; order.push(p.product); }
    qty[p.product] += p.quantity;
  });
  return order.map(function(n) { return (qty[n] > 1 ? qty[n] + '× ' : '') + n; }).join(' + ');
}

export function summarizePxk(orders: Array<{ orderId: string; items: PxkItem[] }>): PxkSummary {
  var bySku: Record<string, PxkSkuLine> = {};
  var unresolvedMap: Record<string, PxkUnresolvedLine> = {};
  var prodMap: Record<string, number> = {};
  var unmapped = new Set<string>();
  var hasCombo = false;
  var totalQty = 0;
  var baseSkus = baseSkusByProduct();
  orders.forEach(function(o) {
    var seenSku = new Set<string>();
    var seenUn = new Set<string>();
    o.items.forEach(function(it) {
      if (it.qty <= 0) return;
      totalQty += it.qty;
      var sku = it.sku.trim();
      if (!sku) {
        var key = pxkNameKey(it.name);
        var sp = splitShopeeName(it.name);
        var u = unresolvedMap[key] || (unresolvedMap[key] = { key: key, name: it.name, variation: sp.variation, qty: 0, orders: 0, orderIds: [] });
        u.qty += it.qty;
        if (!seenUn.has(key)) { seenUn.add(key); u.orders += 1; u.orderIds.push(o.orderId); }
        return;
      }
      var items = getSkuProducts(sku);
      var line = bySku[sku] || (bySku[sku] = {
        sku: sku,
        name: items.length > 0 ? describeSku(items) : (it.name || ''),
        qty: 0,
        orders: 0,
        mapped: items.length > 0,
        variation: it.name ? splitShopeeName(it.name).variation : '',
        orderIds: [],
      });
      line.qty += it.qty;
      if (!seenSku.has(sku)) { seenSku.add(sku); line.orders += 1; line.orderIds.push(o.orderId); }
      if (items.length === 0) { unmapped.add(sku); return; }
      if (items.length > 1 || items[0].quantity > 1) hasCombo = true;
      items.forEach(function(p) { prodMap[p.product] = (prodMap[p.product] || 0) + p.quantity * it.qty; });
    });
  });
  return {
    skuLines: Object.values(bySku).sort(function(a, b) { return a.sku.localeCompare(b.sku, undefined, { numeric: true }); }),
    unresolved: Object.values(unresolvedMap).sort(function(a, b) { return b.qty - a.qty; }),
    unmappedSkus: Array.from(unmapped).sort(),
    productLines: Object.entries(prodMap).map(function(e) { return { product: e[0], skus: (baseSkus[e[0]] || []).join(' / '), qty: e[1] }; }).sort(function(a, b) { return a.product.localeCompare(b.product, 'vi'); }),
    hasCombo: hasCombo,
    totalQty: totalQty,
    orderCount: orders.length,
  };
}

// ==================== In phiếu (HTML khổ A4, in ra PDF bằng hộp thoại in của trình duyệt) ====================

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function shorten(t: string): string {
  return t.length > 80 ? t.slice(0, 78).trim() + '…' : t;
}

function fmtDate(d: string): string {
  var p = d.split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : d;
}

function slipBody(batch: PxkBatch, opts: { showOrders: boolean }): string {
  var sum = summarizePxk(batch.orders);
  var whLabel = batch.warehouse === 'HN' ? 'Kho Hà Nội' : 'Kho HCM';
  var title = 'PHIẾU XUẤT KHO — ' + PXK_PLATFORM_LABELS[batch.platform].toUpperCase();
  var head = '<div class="head"><div><h1>' + esc(title) + '</h1><div class="sub">' + esc(whLabel) + ' · Mã phiếu: ' + esc(batch.id) + '</div></div>' +
    '<div class="meta">Ngày in phiếu: <b>' + esc(fmtDate(batch.printDate)) + '</b><br>Số đơn: <b>' + sum.orderCount + '</b> · Tổng SL: <b>' + sum.totalQty + '</b></div></div>';

  var shopee = batch.platform === 'shopee';
  var snCell = function(ids: string[]) { return '<td class="sn">' + ids.map(esc).join('<br>') + '</td>'; };
  var warn = '';
  var noSkuQty = sum.unresolved.reduce(function(s, u) { return s + u.qty; }, 0);
  var warnLines: string[] = [];
  if (batch.issues && batch.issues.length > 0) warnLines.push('Có ' + batch.issues.length + ' nhãn đọc CHƯA CHẮC CHẮN, hãy nhặt theo nhãn gốc cho các đơn: ' + batch.issues.slice(0, 30).map(esc).join(', ') + (batch.issues.length > 30 ? '...' : ''));
  if (noSkuQty > 0) warnLines.push(noSkuQty + ' sản phẩm chưa có SKU (dòng nền vàng) nên chưa quy ra được sản phẩm gốc, kiểm tra theo tên.');
  if (warnLines.length > 0) warn = '<div class="alert">⚠ ' + warnLines.join('<br>⚠ ') + '</div>';
  var skuRows = shopee ? sum.skuLines.map(function(l, i) {
    return '<tr><td class="c">' + (i + 1) + '</td><td class="mono">' + esc(l.sku) + '</td><td>' + esc(shorten(l.name || '—')) + '</td><td>' + esc(l.variation) + '</td><td class="c big">' + l.qty + '</td>' + snCell(l.orderIds) + '</tr>';
  }).concat(sum.unresolved.map(function(u, i) {
    var sp = splitShopeeName(u.name);
    return '<tr class="warn"><td class="c">' + (sum.skuLines.length + i + 1) + '</td><td class="nosku">chưa có SKU</td><td>' + esc(shorten(sp.name)) + '</td><td>' + esc(sp.variation) + '</td><td class="c big">' + u.qty + '</td>' + snCell(u.orderIds) + '</tr>';
  })).join('') : sum.skuLines.map(function(l, i) {
    return '<tr><td class="c">' + (i + 1) + '</td><td class="mono">' + esc(l.sku) + '</td><td>' + esc(l.name || '—') + '</td><td class="c">' + l.orders + '</td><td class="c big">' + l.qty + '</td></tr>';
  }).concat(sum.unresolved.map(function(u, i) {
    return '<tr class="warn"><td class="c">' + (sum.skuLines.length + i + 1) + '</td><td class="mono">(chưa có SKU)</td><td>' + esc(u.name) + '</td><td class="c">' + u.orders + '</td><td class="c big">' + u.qty + '</td></tr>';
  })).join('');
  var skuTable = shopee
    ? '<h2>1. Tổng hợp theo SKU</h2><table><thead><tr><th style="width:28px">#</th><th style="width:70px">SKU</th><th>Tên sản phẩm</th><th style="width:100px">Phân loại hàng</th><th style="width:44px">SL</th><th style="width:108px">Order SN</th></tr></thead><tbody>' + skuRows +
      '<tr class="total"><td colspan="4" class="r">Tổng cộng</td><td class="c big">' + sum.totalQty + '</td><td></td></tr></tbody></table>'
    : '<h2>1. Tổng hợp theo SKU</h2><table><thead><tr><th style="width:32px">#</th><th style="width:120px">SKU</th><th>Tên sản phẩm</th><th style="width:60px">Số đơn</th><th style="width:70px">Số lượng</th></tr></thead><tbody>' + skuRows +
      '<tr class="total"><td colspan="4" class="r">Tổng cộng</td><td class="c big">' + sum.totalQty + '</td></tr></tbody></table>';

  var prodTable = '';
  if (sum.hasCombo && sum.productLines.length > 0) {
    prodTable = '<h2>2. Quy ra sản phẩm gốc cần nhặt</h2><table><thead><tr><th style="width:32px">#</th><th style="width:110px">SKU</th><th>Sản phẩm</th><th style="width:90px">Số lượng</th><th style="width:70px">Đã nhặt</th></tr></thead><tbody>' +
      sum.productLines.map(function(p, i) { return '<tr><td class="c">' + (i + 1) + '</td><td class="mono">' + esc(p.skus || '—') + '</td><td>' + esc(p.product) + '</td><td class="c big">' + p.qty + '</td><td></td></tr>'; }).join('') + '</tbody></table>';
  }

  var sign = '<div class="sign"><div>Người lập phiếu<br><span>(ký, ghi rõ họ tên)</span></div><div>Người nhặt hàng<br><span>(ký, ghi rõ họ tên)</span></div><div>Người kiểm hàng<br><span>(ký, ghi rõ họ tên)</span></div></div>';

  var orderPage = '';
  if (opts.showOrders) {
    var orderRows = batch.orders.map(function(o, i) {
      var detail = o.items.map(function(it) { return esc((it.sku || it.name || '?')) + ' × ' + it.qty; }).join(', ');
      return '<tr><td class="c">' + (i + 1) + '</td><td class="mono">' + esc(o.orderId) + '</td><td>' + detail + '</td><td class="c">' + o.items.reduce(function(s, x) { return s + x.qty; }, 0) + '</td><td class="chk"></td></tr>';
    }).join('');
    orderPage = '<div class="pb"></div><h2>' + (prodTable ? '3' : '2') + '. Danh sách từng đơn (để kiểm tra)</h2><table><thead><tr><th style="width:32px">#</th><th style="width:150px">Mã đơn hàng</th><th>Sản phẩm × SL</th><th style="width:44px">SL</th><th style="width:44px">Đủ</th></tr></thead><tbody>' + orderRows + '</tbody></table>';
  }

  return head + warn + skuTable + prodTable + sign + orderPage;
}

var PXK_CSS = '@page{size:A4;margin:12mm 10mm 14mm;@bottom-right{content:"Trang " counter(page) "/" counter(pages);font-size:10px;color:#555}}' +
  'html,body{background:#fff;color:#111}body{font-family:Arial,"Segoe UI",sans-serif;font-size:12px;margin:0}' +
  '.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px}' +
  'h1{font-size:19px;margin:0}.sub{color:#444;margin-top:3px}.meta{text-align:right;line-height:1.6}' +
  'h2{font-size:13px;margin:14px 0 6px}table{width:100%;border-collapse:collapse}' +
  'thead{display:table-header-group}tr{page-break-inside:avoid}' +
  'th,td{border:1px solid #888;padding:4px 6px;vertical-align:middle}th{background:#eee;text-align:center;font-size:11px}' +
  '.c{text-align:center}.r{text-align:right;font-weight:bold}.big{font-weight:bold;font-size:14px}.mono{font-family:Consolas,monospace;font-size:11px;word-break:break-all}' +
  '.alert{border:2px solid #c00;background:#fff0f0;color:#900;padding:6px 10px;margin:0 0 10px;font-weight:bold;font-size:12px}' +
  '.nosku{font-size:10px;color:#a60;text-align:center}.sn{font-family:Consolas,monospace;font-size:9px;line-height:1.35}.warn td{background:#fff3cd}.total td{background:#f5f5f5}.chk{width:44px}' +
  '.sign{display:flex;justify-content:space-around;text-align:center;margin-top:28px;page-break-inside:avoid;font-weight:bold}.sign span{font-weight:normal;font-size:10px;color:#666}' +
  '.sign div{height:80px;width:30%}.pb{page-break-before:always}.slip + .slip{page-break-before:always}';

// Ghép nhiều phiếu (mỗi sàn/kho một phiếu) vào một lần in; mỗi phiếu bắt đầu ở trang mới.
export function buildPxkHtmlMulti(batches: PxkBatch[], opts: { showOrders: boolean }): string {
  var title = batches.length === 1 ? 'Phieu xuat kho ' + batches[0].platform + ' ' + batches[0].warehouse + ' ' + batches[0].printDate : 'Phieu xuat kho ' + batches.length + ' phieu';
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' + PXK_CSS + '</style></head><body>' +
    batches.map(function(b) { return '<section class="slip">' + slipBody(b, opts) + '</section>'; }).join('') + '</body></html>';
}

export function buildPxkHtml(batch: PxkBatch, opts: { showOrders: boolean }): string {
  return buildPxkHtmlMulti([batch], opts);
}
