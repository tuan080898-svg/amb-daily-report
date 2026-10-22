// Phiếu xuất kho từ file PDF in đơn của Shopee / TikTok.
// Đọc PDF ngay trên máy nhân sự (không gửi file đi đâu, không dùng AI), gom theo SKU để kho đi nhặt.

import { getSkuProducts, getSkuMap } from './sku';

export type PxkPlatform = 'shopee' | 'tiktok' | 'sapo';
export var PXK_PLATFORM_LABELS: Record<PxkPlatform, string> = { shopee: 'Shopee', tiktok: 'TikTok Shop', sapo: 'Đơn ngoài sàn (Sapo)' };
export var PXK_PLATFORMS: PxkPlatform[] = ['shopee', 'tiktok', 'sapo'];

// Shop nhân sự = shop nhân sự tự bán trên sàn (kho đóng hàng hộ), không thuộc công ty: phiếu có batch.shop = PXK_STAFF_SHOP.
// Phạm vi lọc phiếu: '' = tất cả, PXK_SCOPE_COMPANY = chỉ shop công ty, PXK_SCOPE_STAFF = chỉ shop nhân sự.
export var PXK_STAFF_SHOP = 'Shop nhân sự';
export var PXK_SCOPE_COMPANY = '__company';
export var PXK_SCOPE_STAFF = '__staff';
export function pxkScopeMatch(b: { shop?: string }, scope: string): boolean {
  if (!scope) return true;
  if (scope === PXK_SCOPE_COMPANY) return !b.shop;
  if (scope === PXK_SCOPE_STAFF) return !!b.shop;
  return b.shop === scope;
}
export function pxkScopeLabel(scope: string): string {
  return !scope ? '' : scope === PXK_SCOPE_COMPANY ? 'Shop công ty' : scope === PXK_SCOPE_STAFF ? 'Shop nhân sự' : 'Shop nhân sự: ' + scope;
}

export interface PxkItem {
  sku: string; // rỗng nếu nhãn không có SKU (Shopee) và chưa gắn được
  name: string; // tên sản phẩm + phân loại ghi trên nhãn (nếu đọc được)
  qty: number;
  packFrom?: string; // dòng đã đổi sang gói sẵn: ghi lại dòng gốc, vd "GH063 × 2"
  noteFrom?: string; // dòng "Quà tặng" được đọc ra sản phẩm từ ghi chú của đơn: ghi lại đoạn ghi chú
}

export interface PxkOrder {
  orderId: string;
  items: PxkItem[];
  totalQty: number; // tổng SL ghi trên nhãn
  note?: string; // nhãn đơn ngoài sàn (Sapo): ghi chú của đơn in sau chữ "ĐƠN NGOÀI SÀN."
  ok: boolean; // tổng các dòng khớp tổng SL trên nhãn
  pages: number[];
  file: string;
}

// Đơn lưu trong phiếu; fi = số thứ tự file trong batch.files, pg = trang trong file đó
export interface PxkStoredOrder {
  orderId: string;
  items: PxkItem[];
  note?: string; // ghi chú của đơn (đơn ngoài sàn Sapo)
  fi?: number;
  pg?: number[];
}

export interface PxkBatch {
  id: string;
  platform: PxkPlatform;
  warehouse?: 'HCM' | 'HN'; // phiếu cũ có ghi kho; phiếu mới không phân biệt kho
  printDate: string; // YYYY-MM-DD
  createdAt: string; // ISO
  createdBy: string;
  deducted?: boolean; // không còn dùng (phiếu cũ có thể còn trường này)
  issues?: string[]; // các nhãn đọc chưa chắc chắn lúc lập phiếu (in cảnh báo lên phiếu)
  notes?: string[]; // ghi chú in lên phiếu (vd: có đơn đã lập phiếu trước đó)
  orders: Array<PxkStoredOrder>;
  files?: string[]; // tên các file PDF đã tải lên để lập phiếu này (phiếu cũ không có)
  shop?: string; // phiếu của shop nhân sự (bán hàng của công ty); không có = shop công ty
}

export interface PxkData {
  names: Record<string, string>; // khoá tên Shopee đã chuẩn hoá -> SKU
  ambiguous?: Record<string, string[]>; // cùng một tên nhưng file đơn ghi nhiều SKU khác nhau
  packProducts?: string[]; // sản phẩm kho đóng gói sẵn theo combo (chưa cài đặt thì dùng danh sách mặc định)
  shops?: string[]; // danh sách shop nhân sự
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
    // Nhãn HỎA TỐC: chữ "Hỏa Tốc" nằm cùng dòng nên dòng không còn bắt đầu bằng "Mã đơn hàng": tìm mã ngay sau chữ "Mã đơn hàng:" ở bất kỳ đâu trong dòng
    if (!orderId) {
      lines.some(function(t) {
        var m = t.match(/Mã đơn hàng:?\s*([A-Z0-9]{8,})/);
        if (m) { orderId = m[1]; return true; }
        return false;
      });
    }
    // Có nhãn bị mất chữ "Mã đơn hàng:", mã đơn nằm trơ một dòng (vd 261016R6C55S0S): nhận theo dạng mã Shopee (6 chữ số ngày + 6-10 ký tự)
    if (!orderId) {
      var bare = lines.find(function(t) { return /^\d{6}[A-Z0-9]{6,10}$/.test(t.trim()); });
      if (bare) orderId = bare.trim();
    }
    if (iStart < 0) {
      orders.push({ orderId: orderId, items: [], totalQty: 0, ok: false, pages: [idx + 1], file: fileName });
      return;
    }
    var tot = Number(((lines[iStart].match(/Tổng SL sản phẩm:\s*(\d+)/) || [0, 0])[1]));
    var chunks: string[] = [];
    for (var k = iStart + 1; k < lines.length; k++) {
      var t = lines[k];
      // Hết phần hàng khi gặp mã phân tuyến / ngày đặt hàng, hoặc (nhãn hỏa tốc) phần chân nhãn: "Kiểm tra tên sản phẩm...", "Tiền thu...", "Chỉ dẫn giao hàng..."
      if (/^(HN|HCM|SG)-\d|^Ngày đặt hàng|^[A-Z]{2,}-[A-Z0-9]+-?$|^Kiểm tra tên|^Tiền thu|^Khối lượng|^Chữ ký|^Xác nhận hàng|^Chỉ dẫn giao hàng/.test(t) && chunks.length) break;
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

// Nhãn vận đơn (SPX...) in từ Sapo cho đơn ngoài sàn: "Nội dung hàng (Tổng SL sản phẩm: N)" rồi "tên sản phẩm x 1.000; tên x 1.000, SL: N".
// Không có SKU, chỉ có tên sản phẩm theo tên trên Sapo; số lượng viết 3 số thập phân (1.000 = 1). Mã đơn = mã vận đơn (SPXVN...).
export function parseSapoQty(s: string): number {
  var t = s.trim();
  return /^\d+\.\d{3}$/.test(t) ? Number(t) : Number(t.replace(/\./g, ''));
}

// Ghi chú của đơn in ngay sau chữ "ĐƠN NGOÀI SÀN." ở cột bên phải, có thể xuống 2-3 dòng, nằm trên dòng "Nội dung hàng".
function sapoNote(items: RawItem[]): string {
  var rows: Array<{ y: number; a: RawItem[] }> = [];
  items.forEach(function(i) {
    var r = rows.find(function(r) { return Math.abs(r.y - i.y) < 2.5; });
    if (!r) { r = { y: i.y, a: [] }; rows.push(r); }
    r.a.push(i);
  });
  var rowText = function(r: { a: RawItem[] }) { return r.a.slice().sort(function(p, q) { return p.x - q.x; }); };
  var head = rows.find(function(r) { return /Nội dung hàng/.test(rowText(r).map(function(o) { return o.s; }).join('').normalize('NFC')); });
  var hit: { y: number; x: number } | null = null;
  rows.forEach(function(r) {
    if (hit) return;
    var sorted = rowText(r);
    var text = '';
    var starts: number[] = [];
    sorted.forEach(function(o) { starts.push(text.length); text += o.s.normalize('NFC'); });
    var at = text.indexOf('ĐƠN NGOÀI SÀN');
    if (at < 0) return;
    var k = 0;
    for (var j = 0; j < starts.length; j++) { if (starts[j] <= at) k = j; }
    hit = { y: r.y, x: sorted[k].x };
  });
  if (!hit || !head) return '';
  var h = hit as { y: number; x: number };
  var band = items.filter(function(i) { return i.x >= h.x - 2 && i.y <= h.y + 3 && i.y > head!.y + 2; });
  var text = toLines(band).join(' ').normalize('NFC').replace(/\s+/g, ' ').trim();
  return text.replace(/^.*?ĐƠN NGOÀI SÀN\.?\s*/, '').trim().slice(0, 300);
}

function parseSapoPages(pages: RawItem[][], fileName: string): PxkOrder[] {
  var orders: PxkOrder[] = [];
  pages.forEach(function(items, idx) {
    var lines = toLines(items).map(function(l) { return l.normalize('NFC'); });
    var full = lines.join('\n');
    var orderId = ((full.match(/\bSPX[A-Z]{0,3}\d{8,}\w*/) || [''])[0]) || ((full.match(/Mã vận đơn:?\s*([A-Z0-9]{8,})/) || [])[1] || '');
    var iStart = lines.findIndex(function(t) { return /Nội dung hàng/.test(t); });
    if (iStart < 0) {
      orders.push({ orderId: orderId, items: [], totalQty: 0, ok: false, pages: [idx + 1], file: fileName });
      return;
    }
    var tot = Number(((lines[iStart].match(/Tổng SL sản phẩm:\s*(\d+)/) || [0, 0])[1]));
    var block: string[] = [];
    for (var k = iStart + 1; k < lines.length && block.length < 14; k++) {
      var t = lines[k];
      if (/^\s*[A-Z]{1,4}-\d{2}-\d{2}/.test(t) || /Ngày tạo/.test(t)) break; // mã phân tuyến / ngày tạo vận đơn: hết phần hàng
      block.push(t);
    }
    var txt = block.join(' ').replace(/\s+/g, ' ').trim().replace(/,\s*SL:\s*\d+\s*$/i, '').replace(/^\d+\.\s*/, '');
    var its: PxkItem[] = [];
    var re = /(.+?)\s+x\s+(\d[\d.]*)\s*(?:;|$)/g;
    var m: RegExpExecArray | null;
    while ((m = re.exec(txt))) its.push({ sku: '', name: m[1].trim(), qty: parseSapoQty(m[2]) });
    var sum = its.reduce(function(s, x) { return s + x.qty; }, 0);
    orders.push({ orderId: orderId, items: its, totalQty: tot, note: sapoNote(items), ok: its.length > 0 && sum === tot && its.every(function(i) { return i.qty > 0; }), pages: [idx + 1], file: fileName });
  });
  return orders;
}

export function parsePxkPages(pages: RawItem[][], platform: PxkPlatform, fileName: string): PxkOrder[] {
  if (platform === 'tiktok') return parseTiktokPages(pages, fileName);
  if (platform === 'sapo') return parseSapoPages(pages, fileName);
  return parseShopeePages(pages, fileName);
}

export async function parsePxkFile(file: File, platform: PxkPlatform): Promise<PxkOrder[]> {
  return parsePxkPages(await readPages(file), platform, file.name);
}

// Nhận diện sàn từ chữ trên nhãn: Shopee có "Nội dung hàng / Tổng SL sản phẩm", TikTok có "Product Name / Seller SKU / Qty Total".
export function detectPxkPlatform(pages: RawItem[][]): PxkPlatform | null {
  var shopee = 0;
  var tiktok = 0;
  var sapo = 0;
  pages.slice(0, 5).forEach(function(items) {
    var text = toLines(items).join('\n').normalize('NFC');
    // Nhãn đơn ngoài sàn in từ Sapo cũng có "Nội dung hàng / Tổng SL sản phẩm" như Shopee, nhưng có chữ ĐƠN NGOÀI SÀN và số lượng dạng "x 1.000"
    if (/ĐƠN NGOÀI SÀN|\sx\s+\d+\.\d{3}\s*[;,]/.test(text) && /Nội dung hàng/.test(text)) { sapo++; return; }
    if (/Nội dung hàng|Tổng SL sản phẩm|Mã đơn hàng/.test(text)) shopee++;
    if (/Seller SKU|Product Name|Qty Total|Order ID:/.test(text)) tiktok++;
  });
  if (sapo > 0 && sapo >= shopee && sapo >= tiktok) return 'sapo';
  if (shopee > tiktok) return 'shopee';
  if (tiktok > shopee) return 'tiktok';
  return null;
}

// Đọc một file PDF, tự nhận diện sàn (hoặc dùng sàn được chỉ định tay). Không phân biệt kho.
export async function parsePxkFileAuto(file: File, force?: PxkPlatform): Promise<{ platform: PxkPlatform | null; orders: PxkOrder[] }> {
  var pages = await readPages(file);
  var platform = force || detectPxkPlatform(pages);
  if (!platform) return { platform: null, orders: [] };
  return { platform: platform, orders: parsePxkPages(pages, platform, file.name) };
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
  return { data: Object.assign({}, cur, { names: names, ambiguous: amb }), added: added, ambiguous: Object.keys(amb).length };
}

// ==================== Tổng hợp ====================

// ==================== Đơn "Quà tặng": đọc sản phẩm từ ghi chú ====================
// CSKH gửi tặng/bù thường lên đơn một dòng chung "Quà tặng" và ghi sản phẩm thật vào ghi chú (vd "1 Keo vá tường đủ phụ kiện").
// Nhãn in ghi chú đó sau chữ ĐƠN NGOÀI SÀN. App đọc ghi chú: tách theo "+", ",", ";", "và"; mỗi đoạn có số lượng đứng đầu (không có thì là 1),
// rồi tìm tên sản phẩm dài nhất đã biết nằm trong đoạn đó. Đoạn nào không nhận ra thì để dòng chưa có SKU cho nhân sự gắn (không đoán).

export interface PxkGiftCatalogItem { key: string; sku: string }

export function isGiftName(name: string): boolean {
  return /^(quà|hàng)\s*tặng\b/i.test(name.normalize('NFC').trim());
}

// Danh sách tên đã biết (từ điển tên -> SKU và tên sản phẩm gốc), tên dài xếp trước. Bỏ tên quá ngắn (dễ khớp nhầm).
export function buildGiftCatalog(names: Record<string, string>): PxkGiftCatalogItem[] {
  var map = getSkuMap();
  var list: PxkGiftCatalogItem[] = [];
  Object.keys(names).forEach(function(k) {
    var sku = names[k];
    if (k.length >= 6 && map[sku]) list.push({ key: k, sku: sku });
  });
  var base = baseSkusByProduct();
  Object.keys(base).forEach(function(p) {
    var k = pxkNameKey(p);
    var codes = base[p].slice().sort(function(a, b) { return (/^GH/i.test(a) ? 0 : 1) - (/^GH/i.test(b) ? 0 : 1); });
    if (k.length >= 6 && codes[0]) list.push({ key: k, sku: codes[0] });
  });
  return list.sort(function(a, b) { return b.key.length - a.key.length; });
}

export function expandGiftNote(items: PxkItem[], note: string, catalog: PxkGiftCatalogItem[]): PxkItem[] {
  var text = (note || '').replace(/\s+/g, ' ').trim();
  if (!text) return items;
  var parts = text.split(/\s*(?:\+|;|,|&|\s+và\s+|\n)\s*/i).filter(function(p) { return p.length > 0; });
  if (parts.length === 0) return items;
  var out: PxkItem[] = [];
  items.forEach(function(it) {
    if (!(isGiftName(it.name) && !it.sku) && it.sku !== 'QUATANG') { out.push(it); return; }
    parts.forEach(function(part) {
      var m = part.match(/^(\d+)\s*(.*)$/);
      var n = m ? Number(m[1]) : 1;
      var rest = m ? m[2] : part;
      var key = pxkNameKey(rest.replace(/^(hộp|cái|bộ|chai|tuýp|gói|lọ|túi|miếng|chiếc)\s+/i, ''));
      var hit = catalog.find(function(c) { return key.indexOf(c.key) >= 0; });
      if (!hit && key.length >= 8) {
        // ghi chú viết ngắn hơn tên đầy đủ: nhận khi tên ghi chú là phần đầu của tên đã biết và các tên đó chỉ ứng với một SKU
        var pre = catalog.filter(function(c) { return c.key.indexOf(key) === 0; });
        if (pre.length > 0 && pre.every(function(c) { return c.sku === pre[0].sku; })) hit = pre[0];
      }
      if (n <= 0) n = 1;
      if (hit) out.push({ sku: hit.sku, name: '', qty: n * it.qty, noteFrom: part });
      else out.push({ sku: '', name: 'Quà tặng — ghi chú: ' + part, qty: n * it.qty });
    });
  });
  return out;
}

// ==================== Hàng đóng gói sẵn ====================
// Kho đóng sẵn các gói combo của một số sản phẩm (vd keo vá tường: gói 2, 3, 4, 5 cái). Khách mua 2 cái phân loại "1 cái"
// thì phiếu ghi gói sẵn 2 cái để kho nhặt luôn một gói và dán đơn. Chỉ đổi cách ghi trên phiếu, tổng số cái không đổi.

// Danh sách mặc định (Sếp chốt 20/10/2026): diệt gián, keo vá tường, khử mùi tủ lạnh, gel vệ sinh đường ống, bột thông cống
var PXK_PACK_DEFAULT = /^(thuốc diệt gián|keo vá tường|gel vệ sinh đường ống|bột thông cống)$|khử m[ùủ]i tủ lạnh/i;

export interface PxkPackProduct { product: string; sizes: number[]; on: boolean }

// sản phẩm -> cỡ gói (số cái) -> các mã SKU; chỉ tính SKU của đúng một loại sản phẩm
function packIndex(): Record<string, Record<number, string[]>> {
  var out: Record<string, Record<number, string[]>> = {};
  var map = getSkuMap();
  Object.keys(map).forEach(function(code) {
    var items = map[code];
    if (!items || items.length === 0 || code !== code.trim() || /\s/.test(code)) return;
    var p = items[0].product;
    if (!items.every(function(i) { return i.product === p; })) return;
    var size = items.reduce(function(s, i) { return s + i.quantity; }, 0);
    if (!(size >= 1) || size % 1 !== 0) return;
    var bySize = out[p] || (out[p] = {});
    (bySize[size] || (bySize[size] = [])).push(code);
  });
  Object.keys(out).forEach(function(p) {
    Object.keys(out[p]).forEach(function(sz) {
      // mã GH... đứng trước mã vạch, rồi theo thứ tự số
      out[p][Number(sz)].sort(function(a, b) {
        var ga = /^GH/i.test(a) ? 0 : 1; var gb = /^GH/i.test(b) ? 0 : 1;
        return ga - gb || a.localeCompare(b, undefined, { numeric: true });
      });
    });
  });
  return out;
}

// Các sản phẩm có gói sẵn (có SKU cỡ gói từ 2 cái trở lên) và đang bật hay tắt
export function packProductList(cfg?: string[]): PxkPackProduct[] {
  var idx = packIndex();
  var on = packEnabledSet(cfg);
  return Object.keys(idx).filter(function(p) { return Object.keys(idx[p]).some(function(s) { return Number(s) > 1; }) && idx[p][1]; })
    .map(function(p) { return { product: p, sizes: Object.keys(idx[p]).map(Number).sort(function(a, b) { return a - b; }), on: on.has(p) }; })
    .sort(function(a, b) { return a.product.localeCompare(b.product, 'vi'); });
}

export function packEnabledSet(cfg?: string[]): Set<string> {
  if (cfg) return new Set(cfg);
  var idx = packIndex();
  return new Set(Object.keys(idx).filter(function(p) { return PXK_PACK_DEFAULT.test(p); }));
}

// Đổi các dòng của từng đơn sang gói sẵn (gói to nhất trước, phần dư để lẻ). Chỉ gộp dòng cùng một sản phẩm trong cùng đơn.
export function repackOrders<T extends { orderId: string; items: PxkItem[] }>(orders: T[], cfg?: string[]): T[] {
  var enabled = packEnabledSet(cfg);
  if (enabled.size === 0) return orders;
  var idx = packIndex();
  return orders.map(function(o) {
    var groups: Record<string, { rows: number[]; units: number; inOrder: Record<number, string>; orig: Record<string, number>; first: number }> = {};
    o.items.forEach(function(it, i) {
      var sku = it.sku.trim();
      if (!sku || !(it.qty > 0) || it.qty % 1 !== 0) return;
      var list = getSkuProducts(sku);
      if (list.length === 0) return;
      var p = list[0].product;
      if (!list.every(function(x) { return x.product === p; }) || !enabled.has(p) || !idx[p]) return;
      var size = list.reduce(function(s, x) { return s + x.quantity; }, 0);
      var g = groups[p] || (groups[p] = { rows: [], units: 0, inOrder: {}, orig: {}, first: i });
      g.rows.push(i);
      g.units += size * it.qty;
      if (!g.inOrder[size]) g.inOrder[size] = sku;
      g.orig[sku] = (g.orig[sku] || 0) + it.qty;
    });
    var products = Object.keys(groups);
    if (products.length === 0) return o;
    var drop = new Set<number>();
    var added: Array<{ at: number; items: PxkItem[] }> = [];
    products.forEach(function(p) {
      var g = groups[p];
      var sizes = Object.keys(idx[p]).map(Number).sort(function(a, b) { return b - a; });
      var rem = g.units;
      var plan: Array<{ sku: string; n: number; size: number }> = [];
      sizes.forEach(function(sz) {
        var n = Math.floor(rem / sz);
        if (n > 0) { plan.push({ sku: g.inOrder[sz] || idx[p][sz][0], n: n, size: sz }); rem -= n * sz; }
      });
      if (rem !== 0) return; // không chia hết bằng các cỡ gói hiện có: giữ nguyên
      var same = plan.length === Object.keys(g.orig).length && plan.every(function(x) { return g.orig[x.sku] === x.n; });
      if (same) return;
      var from = Object.keys(g.orig).map(function(s) { return s + ' × ' + g.orig[s]; }).join(' + ');
      g.rows.forEach(function(r) { drop.add(r); });
      added.push({ at: g.first, items: plan.map(function(x) { return x.size > 1 ? { sku: x.sku, name: '', qty: x.n, packFrom: from } : { sku: x.sku, name: '', qty: x.n }; }) });
    });
    if (drop.size === 0) return o;
    var items: PxkItem[] = [];
    o.items.forEach(function(it, i) {
      added.filter(function(a) { return a.at === i; }).forEach(function(a) { items = items.concat(a.items); });
      if (!drop.has(i)) items.push(it);
    });
    return Object.assign({}, o, { items: items });
  });
}

export interface PxkSkuLine {
  sku: string;
  name: string;
  pack?: boolean; // có dòng đổi sang gói sẵn
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

// Số lượng ghi trong tên/phân loại trên nhãn Shopee ("Combo 3 hộp", "2 tuýp", "3 chai"...). Không thấy thì trả null.
export function nameQtyHint(name: string): number | null {
  var v = name.split(',').slice(-1)[0] + ' ' + name.slice(-40);
  var m = v.match(/combo\s*(\d+)/i) || v.match(/(\d+)\s*(tu[ýy]p|hộp|chai|túi|lọ|bình|miếng|gói|cây|bộ)\b/i);
  return m ? Number(m[1]) : null;
}

export interface PxkQtyCheck {
  key: string; // khoá tên chuẩn hoá (để sửa SKU)
  name: string;
  sku: string;
  nameQty: number; // số lượng ghi trên nhãn
  skuUnits: number; // số sản phẩm gốc mà SKU đang gắn quy ra
  qty: number; // tổng SL các dòng này
  orders: number;
}

// Tìm dòng nghi gắn SKU sai: số lượng ghi trong tên/phân loại trên nhãn khác số lượng của SKU (chỉ xét SKU một loại sản phẩm,
// bỏ qua combo gồm nhiều loại sản phẩm vì số trong tên không so sánh được).
export function findQtyMismatches(orders: Array<{ orderId: string; items: PxkItem[] }>): PxkQtyCheck[] {
  var out: Record<string, PxkQtyCheck> = {};
  orders.forEach(function(o) {
    o.items.forEach(function(it) {
      if (!it.sku || !it.name || it.qty <= 0) return;
      var n = nameQtyHint(it.name);
      if (n === null) return;
      var m = getSkuProducts(it.sku);
      if (m.length === 0) return;
      var distinct: Record<string, boolean> = {};
      m.forEach(function(p) { distinct[p.product] = true; });
      if (Object.keys(distinct).length !== 1) return;
      var units = m.reduce(function(s, p) { return s + p.quantity; }, 0);
      if (units === n) return;
      var key = pxkNameKey(it.name);
      var c = out[key] || (out[key] = { key: key, name: it.name, sku: it.sku, nameQty: n, skuUnits: units, qty: 0, orders: 0 });
      c.qty += it.qty;
      c.orders += 1;
    });
  });
  return Object.values(out);
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
        pack: false,
        name: items.length > 0 ? describeSku(items) : (it.name || ''),
        qty: 0,
        orders: 0,
        mapped: items.length > 0,
        variation: it.name ? splitShopeeName(it.name).variation : '',
        orderIds: [],
      });
      line.qty += it.qty;
      if (it.packFrom) line.pack = true;
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

export function fmtDate(d: string): string {
  var p = d.split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : d;
}

// Giờ lập phiếu (giờ Việt Nam) từ mốc thời gian ISO; rỗng nếu không đọc được
export function fmtTime(iso: string): string {
  var t = new Date(iso);
  if (isNaN(t.getTime())) return '';
  return t.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
}

// "19/10/2026 · 15:31"
export function fmtDateTime(batch: { printDate: string; createdAt: string }): string {
  var time = fmtTime(batch.createdAt);
  return fmtDate(batch.printDate) + (time ? ' · ' + time : '');
}

// Các dòng cảnh báo in ở đầu phiếu (chữ thường, chưa escape) — dùng chung cho bản in và bản tải PDF
export function slipWarnings(batch: PxkBatch, sum: PxkSummary): string[] {
  var lines: string[] = [];
  var noSkuQty = sum.unresolved.reduce(function(s, u) { return s + u.qty; }, 0);
  if (batch.issues && batch.issues.length > 0) lines.push('Có ' + batch.issues.length + ' nhãn đọc CHƯA CHẮC CHẮN, hãy nhặt theo nhãn gốc cho các đơn: ' + batch.issues.slice(0, 30).join(', ') + (batch.issues.length > 30 ? '...' : ''));
  if (batch.notes) batch.notes.forEach(function(n) { lines.push(n); });
  if (noSkuQty > 0) lines.push(noSkuQty + ' sản phẩm chưa có SKU (dòng nền vàng) nên chưa quy ra được sản phẩm gốc, kiểm tra theo tên.');
  return lines;
}

function slipBody(batch: PxkBatch, opts: { showOrders: boolean }): string {
  var sum = summarizePxk(batch.orders);
  var whLabel = batch.warehouse === 'HN' ? 'Kho Hà Nội · ' : batch.warehouse === 'HCM' ? 'Kho HCM · ' : '';
  var title = 'PHIẾU XUẤT KHO — ' + PXK_PLATFORM_LABELS[batch.platform].toUpperCase();
  var head = '<div class="head"><div><h1>' + esc(title) + '</h1><div class="sub">' + esc(whLabel) + (batch.shop ? '<b>SHOP NHÂN SỰ</b> (bán riêng, không thuộc công ty) · ' : '') + 'Mã phiếu: ' + esc(batch.id) + '</div></div>' +
    '<div class="meta">Ngày in phiếu: <b>' + esc(fmtDateTime(batch)) + '</b><br>Số đơn: <b>' + sum.orderCount + '</b> · Tổng SL: <b>' + sum.totalQty + '</b></div></div>';

  var shopee = batch.platform === 'shopee';
  var snCell = function(ids: string[]) { return '<td class="sn">' + ids.map(esc).join('<br>') + '</td>'; };
  var warn = '';
  var warnLines = slipWarnings(batch, sum);
  if (warnLines.length > 0) warn = '<div class="alert">⚠ ' + warnLines.map(esc).join('<br>⚠ ') + '</div>';
  var skuRows = shopee ? sum.skuLines.map(function(l, i) {
    return '<tr><td class="c">' + (i + 1) + '</td><td class="mono">' + esc(l.sku) + '</td><td>' + esc(shorten(l.name || '—')) + (l.pack ? ' <b>— GÓI SẴN</b>' : '') + '</td><td>' + esc(l.variation) + '</td><td class="c big">' + l.qty + '</td>' + snCell(l.orderIds) + '</tr>';
  }).concat(sum.unresolved.map(function(u, i) {
    var sp = splitShopeeName(u.name);
    return '<tr class="warn"><td class="c">' + (sum.skuLines.length + i + 1) + '</td><td class="nosku">chưa có SKU</td><td>' + esc(shorten(sp.name)) + '</td><td>' + esc(sp.variation) + '</td><td class="c big">' + u.qty + '</td>' + snCell(u.orderIds) + '</tr>';
  })).join('') : sum.skuLines.map(function(l, i) {
    return '<tr><td class="c">' + (i + 1) + '</td><td class="mono">' + esc(l.sku) + '</td><td>' + esc(l.name || '—') + (l.pack ? ' <b>— GÓI SẴN</b>' : '') + '</td><td class="c">' + l.orders + '</td><td class="c big">' + l.qty + '</td></tr>';
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
      var detail = o.items.map(function(it) { return esc((it.sku || it.name || '?')) + ' × ' + it.qty + (it.packFrom ? ' (gói sẵn, từ ' + esc(it.packFrom) + ')' : '') + (it.noteFrom ? ' (đọc từ ghi chú)' : ''); }).join(', ');
      if (o.note) detail += '<br><span style="font-size:10px;color:#555">Ghi chú: ' + esc(o.note) + '</span>';
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

// ==================== Phiếu tổng hợp cuối ngày ====================
// Gộp mọi phiếu có ngày in = ngày chọn thành một phiếu: tên sản phẩm gốc + tổng số lượng (tách theo sàn).
// Đơn xuất hiện ở nhiều phiếu trong ngày (in lại) chỉ tính một lần để kho không xuất hai lần.

export interface PxkDayRow { name: string; skus: string; shopee: number; tiktok: number; sapo: number; total: number; note: string }

export interface PxkDaySummary {
  date: string;
  scope: string; // nhãn phạm vi (rỗng = tất cả các shop)
  batches: PxkBatch[]; // các phiếu trong ngày, theo giờ lập tăng dần
  rows: PxkDayRow[];
  shopeeOrders: number;
  tiktokOrders: number;
  sapoOrders: number;
  dupOrders: number; // số đơn lặp giữa các phiếu (chỉ tính một lần)
  totalQty: number; // tổng số sản phẩm gốc cần xuất
  warnings: string[];
}

export function pxkBatchQty(b: PxkBatch): number {
  return b.orders.reduce(function(s, o) { return s + o.items.reduce(function(a, x) { return a + x.qty; }, 0); }, 0);
}

export function summarizeDay(date: string, all: PxkBatch[], scope?: string): PxkDaySummary {
  var batches = all.filter(function(b) { return b.printDate === date && pxkScopeMatch(b, scope || ''); }).sort(function(a, b) { return a.createdAt.localeCompare(b.createdAt); });
  var seen: Record<PxkPlatform, Set<string>> = { shopee: new Set<string>(), tiktok: new Set<string>(), sapo: new Set<string>() };
  var orders: Record<PxkPlatform, Array<{ orderId: string; items: PxkItem[] }>> = { shopee: [], tiktok: [], sapo: [] };
  var dup = 0;
  batches.forEach(function(b) {
    b.orders.forEach(function(o) {
      if (seen[b.platform].has(o.orderId)) { dup += 1; return; }
      seen[b.platform].add(o.orderId);
      orders[b.platform].push(o);
    });
  });
  var rows: Record<string, PxkDayRow> = {};
  function addRow(key: string, name: string, skus: string, plat: PxkPlatform, qty: number, note: string) {
    var r = rows[key] || (rows[key] = { name: name, skus: skus, shopee: 0, tiktok: 0, sapo: 0, total: 0, note: note });
    r[plat] += qty;
    r.total += qty;
    if (!r.skus && skus) r.skus = skus;
  }
  var unmapped = 0;
  var noSku = 0;
  PXK_PLATFORMS.forEach(function(plat) {
    var s = summarizePxk(orders[plat]);
    s.productLines.forEach(function(p) { addRow('P:' + p.product, p.product, p.skus, plat, p.qty, ''); });
    s.skuLines.filter(function(l) { return !l.mapped; }).forEach(function(l) { unmapped += 1; addRow('S:' + l.sku, l.name || l.sku, l.sku, plat, l.qty, 'SKU chưa có trong bảng quy đổi'); });
    s.unresolved.forEach(function(u) { noSku += 1; addRow('N:' + u.key, u.name, '', plat, u.qty, 'Chưa có SKU'); });
  });
  var list = Object.values(rows).sort(function(a, b) {
    var ra = a.note ? 1 : 0; var rb = b.note ? 1 : 0;
    return ra - rb || a.name.localeCompare(b.name, 'vi');
  });
  var warnings: string[] = [];
  if (dup > 0) warnings.push(dup + ' đơn xuất hiện ở nhiều phiếu trong ngày (in lại) — chỉ tính một lần.');
  if (unmapped > 0) warnings.push(unmapped + ' mã SKU chưa có trong bảng quy đổi (dòng nền vàng) nên chưa quy ra được sản phẩm gốc.');
  if (noSku > 0) warnings.push(noSku + ' sản phẩm chưa có SKU (dòng nền vàng), tính theo tên trên nhãn.');
  var badBatches = batches.filter(function(b) { return b.issues && b.issues.length > 0; });
  if (badBatches.length > 0) warnings.push('Phiếu ' + badBatches.map(function(b) { return b.id; }).join(', ') + ' có nhãn đọc chưa chắc chắn, số liệu có thể lệch.');
  return {
    date: date, scope: pxkScopeLabel(scope || ''), batches: batches, rows: list,
    shopeeOrders: orders.shopee.length, tiktokOrders: orders.tiktok.length, sapoOrders: orders.sapo.length, dupOrders: dup,
    totalQty: list.reduce(function(s, r) { return s + r.total; }, 0), warnings: warnings,
  };
}

export function buildPxkDayHtml(sum: PxkDaySummary, now: Date): string {
  var stamp = fmtTime(now.toISOString());
  var head = '<div class="head"><div><h1>PHIẾU TỔNG HỢP XUẤT KHO — NGÀY ' + esc(fmtDate(sum.date)) + (sum.scope ? ' — ' + esc(sum.scope.toUpperCase()) : '') + '</h1><div class="sub">Tổng hợp từ ' + sum.batches.length + ' phiếu xuất kho trong ngày</div></div>' +
    '<div class="meta">Lập lúc: <b>' + esc(stamp) + '</b><br>Số đơn: <b>' + (sum.shopeeOrders + sum.tiktokOrders + sum.sapoOrders) + '</b> (Shopee ' + sum.shopeeOrders + ' · TikTok ' + sum.tiktokOrders + ' · ngoài sàn ' + sum.sapoOrders + ')<br>Tổng SL: <b>' + sum.totalQty + '</b></div></div>';
  var warn = sum.warnings.length > 0 ? '<div class="alert">⚠ ' + sum.warnings.map(esc).join('<br>⚠ ') + '</div>' : '';
  var batchRows = sum.batches.map(function(b, i) {
    return '<tr><td class="c">' + (i + 1) + '</td><td class="mono">' + esc(b.id) + '</td><td>' + esc(PXK_PLATFORM_LABELS[b.platform]) + (b.shop ? '<br><span style="font-size:10px;color:#555">Shop nhân sự</span>' : '') + '</td><td class="c">' + esc(fmtTime(b.createdAt)) + '</td><td>' + esc(b.createdBy) + '</td><td class="c">' + b.orders.length + '</td><td class="c">' + pxkBatchQty(b) + '</td></tr>';
  }).join('');
  var t1 = '<h2>1. Các phiếu trong ngày</h2><table><thead><tr><th style="width:28px">#</th><th>Mã phiếu</th><th style="width:70px">Sàn</th><th style="width:56px">Giờ lập</th><th>Người lập</th><th style="width:50px">Số đơn</th><th style="width:50px">SL</th></tr></thead><tbody>' + batchRows + '</tbody></table>';
  var prodRows = sum.rows.map(function(r, i) {
    return '<tr' + (r.note ? ' class="warn"' : '') + '><td class="c">' + (i + 1) + '</td><td>' + esc(r.name) + (r.note ? '<br><span style="font-size:10px;color:#a60">' + esc(r.note) + '</span>' : '') + '</td><td class="mono">' + esc(r.skus || '—') + '</td><td class="c">' + (r.shopee || '') + '</td><td class="c">' + (r.tiktok || '') + '</td><td class="c">' + (r.sapo || '') + '</td><td class="c big">' + r.total + '</td><td class="chk"></td></tr>';
  }).join('');
  var t2 = '<h2>2. Tổng hợp sản phẩm cần xuất trong ngày</h2><table><thead><tr><th style="width:28px">#</th><th>Tên sản phẩm</th><th style="width:100px">SKU</th><th style="width:50px">Shopee</th><th style="width:50px">TikTok</th><th style="width:56px">Ngoài sàn</th><th style="width:60px">Tổng SL</th><th style="width:50px">Đã xuất</th></tr></thead><tbody>' + prodRows +
    '<tr class="total"><td colspan="3" class="r">Tổng cộng</td><td class="c"><b>' + sum.rows.reduce(function(s, r) { return s + r.shopee; }, 0) + '</b></td><td class="c"><b>' + sum.rows.reduce(function(s, r) { return s + r.tiktok; }, 0) + '</b></td><td class="c"><b>' + sum.rows.reduce(function(s, r) { return s + r.sapo; }, 0) + '</b></td><td class="c big">' + sum.totalQty + '</td><td></td></tr></tbody></table>';
  var sign = '<div class="sign"><div>Người lập phiếu<br><span>(ký, ghi rõ họ tên)</span></div><div>Người nhặt hàng<br><span>(ký, ghi rõ họ tên)</span></div><div>Người kiểm hàng<br><span>(ký, ghi rõ họ tên)</span></div></div>';
  return '<!doctype html><html><head><meta charset="utf-8"><title>Phieu tong hop ' + esc(sum.date) + '</title><style>' + PXK_CSS + '</style></head><body><section class="slip">' + head + warn + t1 + t2 + sign + '</section></body></html>';
}

// Ghép nhiều phiếu (mỗi sàn/kho một phiếu) vào một lần in; mỗi phiếu bắt đầu ở trang mới.
export function buildPxkHtmlMulti(batches: PxkBatch[], opts: { showOrders: boolean }): string {
  var title = batches.length === 1 ? 'Phieu xuat kho ' + batches[0].platform + ' ' + batches[0].printDate : 'Phieu xuat kho ' + batches.length + ' phieu';
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' + PXK_CSS + '</style></head><body>' +
    batches.map(function(b) { return '<section class="slip">' + slipBody(b, opts) + '</section>'; }).join('') + '</body></html>';
}

export function buildPxkHtml(batch: PxkBatch, opts: { showOrders: boolean }): string {
  return buildPxkHtmlMulti([batch], opts);
}
