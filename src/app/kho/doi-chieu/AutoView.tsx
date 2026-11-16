'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAppState } from '@/lib/store';
import { dbAddDoiChieuAdj, dbGetDoiChieuAdj, dbGetPxk, dbGetPxkArchive, dbRemoveDoiChieuAdj } from '@/lib/db';
import { getAllProducts, getAllSkuCodes, getProductSkuCodes, getSkuProducts, subscribeSkuMap } from '@/lib/sku';
import { dcFmt, dcFmtD, dcNorm, dcVnDate, type DcConfig, type DcSapo } from '@/lib/doichieu';
import { TD_LOAI_TEN, tdCompare, tdPxkDay, tdSapoDay, type TdAdj, type TdLoai, type TdOptions, type TdStatus, type TdUnit } from '@/lib/doichieu-tudong';
import type { PxkBatch } from '@/lib/pxk';
import ProductPicker, { pickMatch } from '@/components/ProductPicker';
import { btnCls, btnPrimaryCls, cardCls, inputCls } from './shared';

export interface AutoProps {
  date: string;
  cfg: DcConfig;
  sapo: DcSapo | null;
  onSapoFile: (f: File) => Promise<void>;
  toast: (m: string) => void;
}

var STL: Record<TdStatus, string> = { lech: 'Lệch số', chiPhieu: 'Chỉ có ở phiếu / nhập tay', chiSapo: 'Chỉ có ở Sapo', khop: 'Khớp' };
var TAG: Record<TdStatus, string> = {
  lech: 'bg-red-500/15 text-red-300', chiPhieu: 'bg-amber-500/15 text-amber-300', chiSapo: 'bg-purple-500/15 text-purple-300', khop: 'bg-emerald-500/15 text-emerald-300',
};

function dCell(d: number) {
  var cls = d > 0 ? 'text-amber-300' : d < 0 ? 'text-red-300' : 'text-gray-500';
  return <span className={'font-mono ' + cls}>{d ? dcFmtD(d) : '0'}</span>;
}

export default function AutoView(p: AutoProps) {
  var { currentUser } = useAppState();
  var [kho, setKho] = useState<'' | 'HCM' | 'HN'>('');
  var [staff, setStaff] = useState(false);
  var [xuatKhac, setXuatKhac] = useState(p.cfg.settings.xuatKhac);
  var [skuVer, setSkuVer] = useState(0);
  var [pxkAll, setPxkAll] = useState<PxkBatch[] | null>(null);
  var [pxkErr, setPxkErr] = useState('');
  var [loading, setLoading] = useState(false);
  var [adjMonth, setAdjMonth] = useState<Record<string, TdAdj[]>>({});
  var [loai, setLoai] = useState<TdLoai>('huy');
  var [prod, setProd] = useState('');
  var [sl, setSl] = useState('');
  var [ghiChu, setGhiChu] = useState('');
  var [busy, setBusy] = useState(false);
  var [filter, setFilter] = useState<'van-de' | TdStatus | 'tat-ca'>('van-de');
  var fileRef = useRef<HTMLInputElement>(null);
  var archiveRef = useRef<Record<string, PxkBatch[]>>({});

  useEffect(function() { return subscribeSkuMap(function() { setSkuVer(function(v) { return v + 1; }); }); }, []);

  // Chỉ tải danh sách phiếu khi mở tab này (nặng khoảng 2 MB), tải lại khi bấm nút
  async function loadPxk() {
    setLoading(true); setPxkErr('');
    try {
      var d = await dbGetPxk();
      var list = d.batches.slice();
      var oldest = list.reduce(function(m, b) { return b.printDate < m ? b.printDate : m; }, '9999-99-99');
      var mo = p.date.slice(0, 7);
      if (p.date <= oldest || list.length === 0) {
        // ngày này cũ hơn các phiếu đang giữ: đọc thêm phiếu đã chuyển vào lưu trữ của tháng đó
        if (!archiveRef.current[mo]) archiveRef.current[mo] = await dbGetPxkArchive(mo);
        var ids = new Set(list.map(function(b) { return b.id; }));
        archiveRef.current[mo].forEach(function(b) { if (!ids.has(b.id)) list.push(b); });
      }
      setPxkAll(list);
    } catch (e) { setPxkErr(e instanceof Error ? e.message : 'Không tải được phiếu xuất kho.'); }
    setLoading(false);
  }
  useEffect(function() { loadPxk(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [p.date]);

  useEffect(function() {
    var m = p.date.slice(0, 7);
    var alive = true;
    dbGetDoiChieuAdj(m).then(function(items) { if (alive) setAdjMonth(function(o) { return Object.assign({}, o, { [m]: items }); }); }).catch(function(e) { p.toast(e instanceof Error ? e.message : 'Không tải được nhập tay.'); });
    return function() { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.date]);

  var allProducts = useMemo(function() { return getAllProducts(); }, [skuVer]);
  var skuOf = useMemo(function() { return getProductSkuCodes(); }, [skuVer]);
  // Tra mã SKU -> sản phẩm gốc, không phân biệt hoa thường / khoảng trắng (mã Sapo hay lệch kiểu chữ)
  var index = useMemo(function() {
    var m = new Map<string, TdUnit[]>();
    getAllSkuCodes().forEach(function(c) { m.set(dcNorm(c), getSkuProducts(c).map(function(x) { return { product: x.product, quantity: x.quantity }; })); });
    return m;
  }, [skuVer]);
  var unitsOf = function(sku: string): TdUnit[] { return index.get(dcNorm(sku)) || []; };

  var adj = (adjMonth[p.date.slice(0, 7)] || []).filter(function(a) { return a.ngay === p.date; });
  var opt: TdOptions = { kho: kho, staff: staff, xuatKhac: xuatKhac };
  var pxk = useMemo(function() { return pxkAll ? tdPxkDay(p.date, pxkAll, { kho: kho, staff: staff, xuatKhac: xuatKhac }, unitsOf) : null; }, [pxkAll, p.date, kho, staff, xuatKhac, index]); // eslint-disable-line react-hooks/exhaustive-deps
  var sapoRes = useMemo(function() { return p.sapo ? tdSapoDay(p.sapo.rows, unitsOf) : null; }, [p.sapo, index]); // eslint-disable-line react-hooks/exhaustive-deps
  var res = useMemo(function() { return pxk && sapoRes ? tdCompare(pxk, sapoRes, adj, opt) : []; }, [pxk, sapoRes, adj, kho, staff, xuatKhac]); // eslint-disable-line react-hooks/exhaustive-deps
  var ready = !!pxk && !!sapoRes;
  var cnt = function(st: TdStatus) { return res.filter(function(r) { return r.st === st; }).length; };
  var problems = cnt('lech') + cnt('chiPhieu') + cnt('chiSapo');
  var unknownPxk = pxk ? Object.keys(pxk.unknown) : [];
  var shown = res.filter(function(r) { return filter === 'tat-ca' ? true : filter === 'van-de' ? r.st !== 'khop' : r.st === filter; });
  var sapoBanner = p.sapo && p.sapo.to && p.sapo.to !== p.date ? 'File Sapo là ngày ' + dcVnDate(p.sapo.from) + (p.sapo.from !== p.sapo.to ? ' – ' + dcVnDate(p.sapo.to) : '') + ', khác ngày đang đối chiếu ' + dcVnDate(p.date) + '.' : '';

  async function addAdj() {
    var q = parseFloat(sl.replace(',', '.'));
    var name = allProducts.indexOf(prod) >= 0 ? prod : '';
    if (!name && prod.trim()) { var hit = allProducts.filter(function(x) { return pickMatch(x + ' ' + (skuOf[x] || []).join(' '), prod); }); if (hit.length === 1) name = hit[0]; }
    if (!name) { p.toast(prod.trim() ? 'Chưa chọn đúng sản phẩm: bấm một dòng trong danh sách gợi ý.' : 'Chọn sản phẩm.'); return; }
    if (!isFinite(q) || q <= 0) { p.toast('Nhập số lượng lớn hơn 0.'); return; }
    setBusy(true);
    try {
      var items = await dbAddDoiChieuAdj({ ngay: p.date, loai: loai, product: name, sl: q, ghiChu: ghiChu.trim(), by: currentUser ? currentUser.name : '' });
      setAdjMonth(function(o) { return Object.assign({}, o, { [p.date.slice(0, 7)]: items }); });
      setProd(''); setSl(''); setGhiChu('');
      p.toast('Đã ghi: ' + TD_LOAI_TEN[loai] + ' ' + name + ' × ' + q);
    } catch (e) { p.toast(e instanceof Error ? e.message : 'Không lưu được.'); }
    setBusy(false);
  }

  async function removeAdj(a: TdAdj) {
    if (!window.confirm('Xóa dòng "' + TD_LOAI_TEN[a.loai] + ' ' + a.product + ' × ' + a.sl + '"?')) return;
    setBusy(true);
    try {
      var items = await dbRemoveDoiChieuAdj(a.id, a.ngay);
      setAdjMonth(function(o) { return Object.assign({}, o, { [a.ngay.slice(0, 7)]: items }); });
    } catch (e) { p.toast(e instanceof Error ? e.message : 'Không xóa được.'); }
    setBusy(false);
  }

  function exportExcel() {
    var aoa: Array<Array<string | number>> = [['Đối chiếu tự động ngày', dcVnDate(p.date)], ['Phiếu xuất kho', (kho || 'Mọi kho') + (staff ? ', gồm shop nhân sự' : ', chỉ shop công ty'), 'Cách tính xuất', xuatKhac ? 'Gồm xuất khác Sapo và hàng lỗi xuất tay' : 'Chỉ bán ra'], [],
      ['Kết quả', 'Sản phẩm gốc', 'Mã SKU', 'Phiếu xuất', 'Trong đó hàng lỗi', 'Sapo xuất', 'Lệch xuất', 'Nhận lại hàng hủy (nhập tay)', 'Sapo nhận lại', 'Lệch nhận lại', 'Ghi chú']];
    res.forEach(function(r) { aoa.push([STL[r.st], r.product, r.skus.join(' / '), r.pXuat, r.loi, r.sXuat, r.dXuat, r.huy, r.sNhan, r.dNhan, r.why]); });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Doi chieu tu dong');
    var nh: Array<Array<string | number>> = [['Loại', 'Sản phẩm', 'Số lượng', 'Ghi chú', 'Người nhập', 'Lúc']];
    adj.forEach(function(a) { nh.push([TD_LOAI_TEN[a.loai], a.product, a.sl, a.ghiChu, a.by, a.at]); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(nh), 'Nhap tay');
    XLSX.writeFile(wb, 'doi-chieu-tu-dong-' + p.date + '.xlsx');
  }

  var pxkQty = 0;
  if (pxk) { var pp = pxk.products; pxkQty = Object.keys(pp).reduce(function(s, k) { return s + pp[k].qty; }, 0); }
  var sumHuy = adj.filter(function(a) { return a.loai === 'huy'; }).reduce(function(s, a) { return s + a.sl; }, 0);
  var sumLoi = adj.filter(function(a) { return a.loai === 'loi'; }).reduce(function(s, a) { return s + a.sl; }, 0);

  return (
    <div>
      <div className="mb-4 p-3 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sm text-sky-100">
        Phiếu xuất kho lập trong ngày được <b>tự gộp thành phiếu xuất tổng hợp</b> (mỗi đơn chỉ tính một lần, kể cả khi lập lại phiếu), sau đó so với báo cáo Sapo của ngày theo <b>sản phẩm gốc</b>.
        Hàng hủy nhận lại và hàng lỗi xuất tay Sếp/nhân sự kho nhập ở bước 3. Nếu mọi sản phẩm khớp là xuất đúng; còn lệch thì xem dòng đỏ để tìm lỗi.
      </div>
      {sapoBanner && <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">{sapoBanner}</div>}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className={cardCls + ' !mb-0'}>
          <h2 className="text-sm font-semibold text-gray-200 mb-1"><span className="inline-flex w-5 h-5 mr-2 rounded-full bg-blue-600 text-white text-xs items-center justify-center">1</span>Phiếu xuất tổng hợp ngày {dcVnDate(p.date)}</h2>
          <p className="text-xs text-gray-500 mb-3">Tự lấy từ các phiếu xuất kho có ngày in là ngày này.</p>
          <div className="space-y-2 mb-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Kho xuất</label>
              <select value={kho} onChange={function(e) { setKho(e.target.value as '' | 'HCM' | 'HN'); }} className={inputCls + ' w-full'}>
                <option value="">Mọi kho (kể cả phiếu cũ chưa ghi kho)</option><option value="HN">Kho Hà Nội</option><option value="HCM">Kho HCM</option>
              </select>
            </div>
            <label className="flex items-start gap-2 text-xs text-gray-300"><input type="checkbox" checked={staff} onChange={function(e) { setStaff(e.target.checked); }} className="mt-0.5" />Gồm cả phiếu shop nhân sự (mặc định không, vì đơn shop nhân sự không đi qua Sapo của công ty)</label>
            <label className="flex items-start gap-2 text-xs text-gray-300"><input type="checkbox" checked={xuatKhac} onChange={function(e) { setXuatKhac(e.target.checked); }} className="mt-0.5" />Tính cả xuất khác của Sapo (kiểm kê giảm, chuyển kho, trả NCC) và hàng lỗi xuất tay vào cột xuất</label>
          </div>
          {loading && <div className="text-sm text-gray-400">Đang tải phiếu xuất kho…</div>}
          {pxkErr && <div className="text-sm text-red-300">{pxkErr} <button className="underline" onClick={loadPxk}>Thử lại</button></div>}
          {pxk && !loading && (
            <div className="text-sm text-gray-300">
              <div><b className="text-gray-100">{pxk.batches}</b> phiếu, <b className="text-gray-100">{pxk.orders}</b> đơn, <b className="text-gray-100">{Object.keys(pxk.products).length}</b> sản phẩm gốc, tổng <b className="text-gray-100">{dcFmt(pxkQty)}</b> sản phẩm.</div>
              {pxk.batches === 0 && <div className="mt-1 text-amber-300 text-xs">Chưa có phiếu xuất kho nào ngày này với lựa chọn hiện tại.</div>}
              {(pxk.skipKho > 0 || pxk.skipStaff > 0) && <div className="mt-1 text-xs text-gray-400">Đã bỏ {pxk.skipKho > 0 ? pxk.skipKho + ' phiếu khác kho hoặc chưa ghi kho' : ''}{pxk.skipKho > 0 && pxk.skipStaff > 0 ? ', ' : ''}{pxk.skipStaff > 0 ? pxk.skipStaff + ' phiếu shop nhân sự' : ''}.</div>}
              <button className={btnCls + ' mt-2'} onClick={loadPxk}>Tải lại phiếu</button>
            </div>
          )}
        </div>

        <div className={cardCls + ' !mb-0'}>
          <h2 className="text-sm font-semibold text-gray-200 mb-1"><span className="inline-flex w-5 h-5 mr-2 rounded-full bg-blue-600 text-white text-xs items-center justify-center">2</span>Báo cáo xuất nhập tồn Sapo</h2>
          <p className="text-xs text-gray-500 mb-3">File Excel tải từ Sapo, lọc đúng 1 ngày (Từ ngày = Đến ngày). Dùng chung với tab “Đối chiếu trong ngày”.</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={function(e) { var f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) p.onSapoFile(f); }} />
          <div className="border-2 border-dashed border-slate-600 hover:border-blue-500 rounded-xl p-5 text-center cursor-pointer"
            onClick={function() { if (fileRef.current) fileRef.current.click(); }}
            onDragOver={function(e) { e.preventDefault(); }}
            onDrop={function(e) { e.preventDefault(); var f = e.dataTransfer.files[0]; if (f) p.onSapoFile(f); }}>
            <div className="text-sm text-gray-300">{p.sapo ? 'Đã có báo cáo. Chọn file khác để thay.' : 'Chọn hoặc kéo file .xlsx vào đây'}</div>
          </div>
          {p.sapo && (
            <div className="text-xs text-gray-400 mt-2">
              Ngày <b className="text-gray-200">{dcVnDate(p.sapo.from)}{p.sapo.to !== p.sapo.from ? ' – ' + dcVnDate(p.sapo.to) : ''}</b>, <b className="text-gray-200">{p.sapo.rows.length}</b> mã có phát sinh, tổng bán ra <b className="text-gray-200">{dcFmt(p.sapo.rows.reduce(function(a, r) { return a + (Number(r.f.banRa) || 0); }, 0))}</b>.
            </div>
          )}
        </div>

        <div className={cardCls + ' !mb-0'}>
          <h2 className="text-sm font-semibold text-gray-200 mb-1"><span className="inline-flex w-5 h-5 mr-2 rounded-full bg-blue-600 text-white text-xs items-center justify-center">3</span>Nhập tay trong ngày</h2>
          <p className="text-xs text-gray-500 mb-2">Nhận lại hàng đơn hủy (cộng lại vào kho) và xuất hàng lỗi ra khỏi kho. Lưu ngay, dùng chung cho cả kho.</p>
          <div className="inline-flex p-1 rounded-xl bg-slate-800 border border-slate-700 mb-2">
            <button onClick={function() { setLoai('huy'); }} className={'px-3 py-1 text-xs font-medium rounded-lg ' + (loai === 'huy' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-gray-200')}>📥 Nhận lại hàng hủy</button>
            <button onClick={function() { setLoai('loi'); }} className={'px-3 py-1 text-xs font-medium rounded-lg ' + (loai === 'loi' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-gray-200')}>🗑 Xuất hàng lỗi</button>
          </div>
          <div className="space-y-2">
            <ProductPicker value={prod} onChange={setProd} options={allProducts} skuOf={skuOf} placeholder="Gõ tên (không dấu cũng được) hoặc mã SKU…" className={inputCls + ' w-full pr-9'} emptyHint="Sản phẩm phải có trong bảng quy đổi SKU." />
            <div className="flex gap-2">
              <input inputMode="decimal" value={sl} onChange={function(e) { setSl(e.target.value); }} placeholder="Số lượng" className={inputCls + ' w-28 text-right'} />
              <input value={ghiChu} onChange={function(e) { setGhiChu(e.target.value); }} placeholder="Ghi chú (mã đơn, lý do…)" className={inputCls + ' flex-1 min-w-0'} onKeyDown={function(e) { if (e.key === 'Enter') addAdj(); }} />
            </div>
            <button className={btnPrimaryCls + ' w-full'} disabled={busy} onClick={addAdj}>Ghi {loai === 'huy' ? 'nhận lại hàng hủy' : 'xuất hàng lỗi'}</button>
          </div>
          <div className="mt-3 text-xs text-gray-400">Hôm nay đã nhập: nhận lại hủy <b className="text-emerald-300">{dcFmt(sumHuy)}</b> · xuất lỗi <b className="text-red-300">{dcFmt(sumLoi)}</b></div>
          {adj.length > 0 && (
            <div className="mt-2 max-h-48 overflow-auto divide-y divide-slate-800 border border-slate-800 rounded-lg">
              {adj.slice().reverse().map(function(a) {
                return (
                  <div key={a.id} className="px-2 py-1.5 text-xs flex items-start gap-2">
                    <span className={'shrink-0 px-1.5 py-0.5 rounded ' + (a.loai === 'huy' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300')}>{a.loai === 'huy' ? 'Hủy' : 'Lỗi'}</span>
                    <span className="flex-1 min-w-0 text-gray-200">{a.product} <b>× {a.sl}</b>{a.ghiChu ? <span className="text-gray-500"> · {a.ghiChu}</span> : null}<div className="text-gray-600">{a.by}{a.by ? ' · ' : ''}{new Date(a.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div></span>
                    <button aria-label="Xóa dòng" disabled={busy} className="text-gray-500 hover:text-red-400 px-1" onClick={function() { removeAdj(a); }}>×</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className={cardCls + ' mt-4'}>
        <h2 className="text-sm font-semibold text-gray-200 mb-1"><span className="inline-flex w-5 h-5 mr-2 rounded-full bg-blue-600 text-white text-xs items-center justify-center">4</span>Kết quả đối chiếu</h2>
        <p className="text-xs text-gray-400 mb-3">
          {!ready ? (!p.sapo ? 'Còn thiếu báo cáo Sapo ở bước 2.' : 'Đang chờ phiếu xuất kho.')
            : problems === 0 && unknownPxk.length === 0 && sapoRes && sapoRes.unknown.length === 0 ? '✅ Xuất đúng: phiếu xuất kho khớp Sapo ở mọi sản phẩm.'
            : problems + ' sản phẩm cần xem lại' + (unknownPxk.length || (sapoRes && sapoRes.unknown.length) ? ', và có mã chưa quy được ra sản phẩm (xem bên dưới).' : '.')}
        </p>
        {ready && (
          <>
            <div className="flex flex-wrap gap-2 mb-3">
              {([['van-de', 'Cần xem lại', problems], ['lech', 'Lệch số', cnt('lech')], ['chiPhieu', 'Chỉ có ở phiếu / nhập tay', cnt('chiPhieu')], ['chiSapo', 'Chỉ có ở Sapo', cnt('chiSapo')], ['khop', 'Khớp', cnt('khop')], ['tat-ca', 'Tất cả', res.length]] as Array<[typeof filter, string, number]>).map(function(c) {
                return <button key={c[0]} onClick={function() { setFilter(c[0]); }} aria-pressed={filter === c[0]}
                  className={'px-3 py-1 rounded-full text-xs border ' + (filter === c[0] ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-600 text-gray-300 hover:bg-slate-700')}>{c[1]} <b>{c[2]}</b></button>;
              })}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500"><th colSpan={2}></th><th colSpan={3} className="text-center border-b border-slate-700">Xuất ({xuatKhac ? 'phiếu + hàng lỗi so với Sapo bán ra + xuất khác' : 'phiếu so với Sapo bán ra'})</th><th colSpan={3} className="text-center border-b border-slate-700">Nhận lại hàng hủy / trả</th></tr>
                  <tr className="text-xs text-gray-400"><th className="p-2 text-left">Kết quả</th><th className="p-2 text-left">Sản phẩm gốc</th><th className="p-2 text-right">Phiếu</th><th className="p-2 text-right">Sapo</th><th className="p-2 text-right">Lệch</th><th className="p-2 text-right">Nhập tay</th><th className="p-2 text-right">Sapo</th><th className="p-2 text-right">Lệch</th></tr>
                </thead>
                <tbody>
                  {shown.map(function(r) {
                    return (
                      <tr key={r.product} className="border-t border-slate-800 align-top">
                        <td className="p-2"><span className={'px-2 py-0.5 rounded text-xs ' + TAG[r.st]}>{STL[r.st]}</span>{r.why && <div className="text-xs text-gray-500 mt-1 max-w-[240px]">{r.why}</div>}</td>
                        <td className="p-2"><div className="font-semibold text-gray-100">{r.product}</div><div className="text-[11px] font-mono text-blue-300">{r.skus.slice(0, 5).join(' · ')}{r.skus.length > 5 ? ' …' : ''}</div></td>
                        <td className="p-2 text-right font-mono">{dcFmt(r.pXuat)}</td><td className="p-2 text-right font-mono text-gray-400">{dcFmt(r.sXuat)}</td><td className="p-2 text-right">{dCell(r.dXuat)}</td>
                        <td className="p-2 text-right font-mono">{dcFmt(r.huy)}</td><td className="p-2 text-right font-mono text-gray-400">{dcFmt(r.sNhan)}</td><td className="p-2 text-right">{dCell(r.dNhan)}</td>
                      </tr>
                    );
                  })}
                  {shown.length === 0 && <tr><td colSpan={8} className="p-4 text-gray-500 text-sm">Không có sản phẩm nào trong nhóm này.</td></tr>}
                </tbody>
              </table>
            </div>
            {unknownPxk.length > 0 && pxk && (
              <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
                Mã trên phiếu xuất kho chưa có trong bảng quy đổi SKU (không quy được ra sản phẩm gốc, nên không so được): {unknownPxk.slice(0, 15).map(function(k) { return k + ' ×' + (pxk as { unknown: Record<string, number> }).unknown[k]; }).join(', ')}{unknownPxk.length > 15 ? '…' : ''}.
              </div>
            )}
            {sapoRes && sapoRes.unknown.length > 0 && (
              <div className="mt-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/30 text-xs text-purple-200">
                Mã Sapo chưa có trong bảng quy đổi SKU của app (không so được): {sapoRes.unknown.slice(0, 15).map(function(u) { return u.ma + ' (bán ' + dcFmt(u.xuat) + ')'; }).join(', ')}{sapoRes.unknown.length > 15 ? '…' : ''}.
              </div>
            )}
            <div className="flex justify-end mt-4 pt-3 border-t border-slate-700"><button className={btnCls} onClick={exportExcel}>Tải Excel kết quả</button></div>
          </>
        )}
      </div>
    </div>
  );
}
