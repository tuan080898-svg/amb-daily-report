// Đối chiếu tự động: phiếu xuất kho trong ngày (tự lấy từ các phiếu đã lập) + nhập tay hàng hủy nhận lại / hàng lỗi xuất, so với báo cáo xuất nhập tồn Sapo của ngày.
// So theo SẢN PHẨM GỐC (quy từ mã SKU bằng bảng quy đổi của app) để không lệch vì combo, gói sẵn hay một sản phẩm có nhiều mã SKU.
// Phần tính toán nằm ở đây (không phụ thuộc giao diện) để kiểm thử.

import type { PxkBatch, PxkPlatform } from './pxk';
import { pxkScopeMatch, PXK_SCOPE_COMPANY } from './pxk';
import type { DcSapoRow } from './doichieu';
import { dcNum, dcR3 } from './doichieu';

export type TdLoai = 'huy' | 'loi'; // huy = nhận lại hàng hủy (nhập lại kho), loi = xuất tay hàng lỗi
export var TD_LOAI_TEN: Record<TdLoai, string> = { huy: 'Nhận lại hàng hủy', loi: 'Xuất hàng lỗi' };

// Một lần nhập tay trong ngày
export interface TdAdj { id: string; ngay: string; loai: TdLoai; product: string; sl: number; ghiChu: string; by: string; at: string }

export interface TdUnit { product: string; quantity: number }
export type TdUnitsOf = (sku: string) => TdUnit[]; // mã SKU -> sản phẩm gốc x số lượng (rỗng nếu chưa có trong bảng quy đổi)

export interface TdOptions {
  kho: '' | 'HCM' | 'HN'; // lọc phiếu theo kho xuất ('' = mọi kho)
  staff: boolean; // gồm cả phiếu shop nhân sự (mặc định chỉ shop công ty vì đơn shop nhân sự không đi qua Sapo của công ty)
  xuatKhac: boolean; // tính cả xuất khác của Sapo (kiểm kê giảm, chuyển kho, trả NCC) và hàng lỗi xuất tay vào cột xuất
}

export interface TdPxk {
  batches: number;
  orders: number;
  skipKho: number; // số phiếu bỏ vì khác kho hoặc chưa ghi kho (khi đang lọc kho)
  skipStaff: number; // số phiếu shop nhân sự bị bỏ
  products: Record<string, { qty: number; skus: Record<string, number> }>; // sản phẩm gốc -> số lượng, kèm mã SKU đã bán
  unknown: Record<string, number>; // mã SKU trên phiếu chưa có trong bảng quy đổi (không quy được ra sản phẩm gốc)
}

// Gộp phiếu xuất kho có ngày in = ngày đối chiếu; đơn nằm ở nhiều phiếu chỉ tính một lần (như phiếu tổng hợp)
export function tdPxkDay(date: string, all: PxkBatch[], opt: TdOptions, unitsOf: TdUnitsOf): TdPxk {
  var out: TdPxk = { batches: 0, orders: 0, skipKho: 0, skipStaff: 0, products: {}, unknown: {} };
  var seen: Record<PxkPlatform, Set<string>> = { shopee: new Set<string>(), tiktok: new Set<string>(), sapo: new Set<string>() };
  var day = all.filter(function(b) { return b.printDate === date; }).sort(function(a, b) { return a.createdAt.localeCompare(b.createdAt); });
  day.forEach(function(b) {
    if (!opt.staff && !pxkScopeMatch(b, PXK_SCOPE_COMPANY)) { out.skipStaff++; return; }
    if (opt.kho && b.warehouse !== opt.kho) { out.skipKho++; return; }
    out.batches++;
    b.orders.forEach(function(o) {
      if (seen[b.platform].has(o.orderId)) return;
      seen[b.platform].add(o.orderId);
      out.orders++;
      o.items.forEach(function(it) {
        var sku = (it.sku || '').trim();
        if (!sku || !(it.qty > 0)) { if (it.qty > 0) out.unknown['(không có SKU) ' + (it.name || '').slice(0, 40)] = (out.unknown['(không có SKU) ' + (it.name || '').slice(0, 40)] || 0) + it.qty; return; }
        var us = unitsOf(sku);
        if (us.length === 0) { out.unknown[sku] = (out.unknown[sku] || 0) + it.qty; return; }
        us.forEach(function(u) {
          var cur = out.products[u.product] || (out.products[u.product] = { qty: 0, skus: {} });
          cur.qty += u.quantity * it.qty;
          cur.skus[sku] = (cur.skus[sku] || 0) + it.qty;
        });
      });
    });
  });
  return out;
}

export interface TdSapo {
  products: Record<string, { xuat: number; xuatKhac: number; nhanLai: number; skus: Record<string, number> }>;
  unknown: Array<{ ma: string; ten: string; xuat: number; xuatKhac: number; nhanLai: number }>; // mã Sapo chưa có trong bảng quy đổi
}

// Quy các dòng Sapo (mã lẻ) ra sản phẩm gốc. xuat = bán ra; xuatKhac = kiểm kê giảm + chuyển kho + trả NCC; nhanLai = trả lại + hủy giao (hàng hủy/hoàn về kho)
export function tdSapoDay(rows: DcSapoRow[], unitsOf: TdUnitsOf): TdSapo {
  var out: TdSapo = { products: {}, unknown: [] };
  (rows || []).forEach(function(r) {
    var xuat = dcNum(r.f.banRa);
    var xk = dcNum(r.f.kkGiam) + dcNum(r.f.chuyenKho) + dcNum(r.f.traNcc);
    var nl = dcNum(r.f.traLai) + dcNum(r.f.huyGiao);
    if (!xuat && !xk && !nl) return;
    var us = unitsOf(r.ma);
    if (us.length === 0) { out.unknown.push({ ma: r.ma, ten: r.ten, xuat: xuat, xuatKhac: xk, nhanLai: nl }); return; }
    us.forEach(function(u) {
      var cur = out.products[u.product] || (out.products[u.product] = { xuat: 0, xuatKhac: 0, nhanLai: 0, skus: {} });
      cur.xuat += xuat * u.quantity; cur.xuatKhac += xk * u.quantity; cur.nhanLai += nl * u.quantity;
      cur.skus[r.ma] = (cur.skus[r.ma] || 0) + xuat;
    });
  });
  return out;
}

export type TdStatus = 'khop' | 'lech' | 'chiPhieu' | 'chiSapo';
export interface TdRow {
  product: string; skus: string[]; st: TdStatus; why: string;
  pXuat: number; loi: number; sXuat: number; dXuat: number; // phiếu xuất (đã gồm lỗi nếu bật), hàng lỗi nhập tay, Sapo xuất, lệch
  huy: number; sNhan: number; dNhan: number; // nhận lại hàng hủy nhập tay, Sapo nhận lại, lệch
}

// Bản chốt kết quả đối chiếu của một ngày (lưu để xem lại, không phải tải lại file Sapo)
export interface TdSnap {
  ngay: string;
  kho: '' | 'HCM' | 'HN';
  staff: boolean;
  xuatKhac: boolean;
  nguoiLuu: string;
  luuLuc: string;
  pxk: { batches: number; orders: number; skipKho: number; skipStaff: number; qty: number };
  sapo: { from: string | null; to: string | null; ma: number; banRa: number };
  counts: { khop: number; lech: number; chiPhieu: number; chiSapo: number };
  rows: TdRow[];
  unknownPxk: Record<string, number>;
  unknownSapo: Array<{ ma: string; ten: string; xuat: number }>;
  adj: TdAdj[];
}

// So phiếu + nhập tay với Sapo theo sản phẩm gốc
export function tdCompare(pxk: TdPxk, sapo: TdSapo, adj: TdAdj[], opt: TdOptions): TdRow[] {
  var loi: Record<string, number> = {};
  var huy: Record<string, number> = {};
  adj.forEach(function(a) { var m = a.loai === 'loi' ? loi : huy; m[a.product] = (m[a.product] || 0) + dcNum(a.sl); });
  var keys = new Set<string>();
  Object.keys(pxk.products).forEach(function(k) { keys.add(k); });
  Object.keys(sapo.products).forEach(function(k) { keys.add(k); });
  Object.keys(loi).forEach(function(k) { keys.add(k); });
  Object.keys(huy).forEach(function(k) { keys.add(k); });
  var out: TdRow[] = [];
  keys.forEach(function(k) {
    var p = pxk.products[k]; var s = sapo.products[k];
    var l = loi[k] || 0; var h = huy[k] || 0;
    var pXuat = (p ? p.qty : 0) + (opt.xuatKhac ? l : 0);
    var sXuat = (s ? s.xuat + (opt.xuatKhac ? s.xuatKhac : 0) : 0);
    var sNhan = s ? s.nhanLai : 0;
    var dX = dcR3(pXuat - sXuat); var dN = dcR3(h - sNhan);
    var skus = Array.from(new Set(Object.keys((p && p.skus) || {}).concat(Object.keys((s && s.skus) || {})))).sort();
    var st: TdStatus; var why = '';
    if (!dX && !dN) { if (!pXuat && !sXuat && !h && !sNhan && !l) return; st = 'khop'; }
    else if (!p && !l && !h && s) { st = 'chiSapo'; why = 'Sapo có phát sinh, phiếu xuất kho và nhập tay không có'; }
    else if (!s && (p || l || h)) { st = 'chiPhieu'; why = 'Phiếu / nhập tay có, Sapo không ghi phát sinh'; }
    else st = 'lech';
    if (!opt.xuatKhac && l) why = (why ? why + '. ' : '') + 'Có ' + l + ' hàng lỗi xuất tay (chưa tính vào cột xuất)';
    if (!opt.xuatKhac && s && s.xuatKhac) why = (why ? why + '. ' : '') + 'Sapo có ' + s.xuatKhac + ' xuất khác (chưa tính vào cột xuất)';
    out.push({ product: k, skus: skus, st: st, why: why, pXuat: pXuat, loi: l, sXuat: sXuat, dXuat: dX, huy: h, sNhan: sNhan, dNhan: dN });
  });
  var ord: Record<TdStatus, number> = { lech: 0, chiPhieu: 1, chiSapo: 1, khop: 2 };
  out.sort(function(a, b) { return ord[a.st] - ord[b.st] || (Math.abs(b.dXuat) + Math.abs(b.dNhan)) - (Math.abs(a.dXuat) + Math.abs(a.dNhan)) || a.product.localeCompare(b.product); });
  return out;
}
