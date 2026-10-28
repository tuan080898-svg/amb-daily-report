'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAppState } from '@/lib/store';
import { getAllProducts, getProductSkuCodes, getSkuProducts, subscribeSkuMap } from '@/lib/sku';
import { dbGetPxk, dbGetPxkArchive, dbGetSoKho, dbSoKhoAction } from '@/lib/db';
import { getCurrentStock, refreshInventory, type InventoryData } from '@/lib/inventory';
import type { PxkBatch } from '@/lib/pxk';
import {
  SK_KHO, SK_KHO_LABEL, skCalcSlips, skEmptyData, skParseCount, skParseCountSheet, skParseProductSheet, skProductHistory, skStock, skVisibleProducts,
  type SkData, type SkKho, type SkRow, type SkSlipCalc,
} from '@/lib/sokho';

type Tab = 'ton' | 'kiem' | 'nhap' | 'gan';
type Flt = 'tat-ca' | 'chua-kiem' | 'am' | 'phat-sinh';
type SortBy = 'ten' | 'ton-giam' | 'ton-tang' | 'lech';

var inputCls = 'px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none';
var cardCls = 'bg-slate-900 border border-slate-700 rounded-xl p-4 mb-4';
var btnCls = 'px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-gray-200 text-sm rounded-lg disabled:opacity-50';
var btnPrimaryCls = 'px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed';

var fmt = function(n: number) { return (Math.round(n * 1000) / 1000).toLocaleString('vi-VN'); };
function fmtAt(iso: string | number): string {
  var d = new Date(iso);
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function localInput(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
// Tìm kiếm không phân biệt dấu và hoa thường: gõ "bot thong cong" vẫn ra "Bột thông cống"; nhiều từ thì phải khớp đủ các từ
function foldChar(c: string): string { return c === 'đ' || c === 'Đ' ? 'd' : c.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function fold(s: string): string { var out = ''; for (var i = 0; i < s.length; i++) out += foldChar(s[i]).charAt(0) || ' '; return out; }
function matchQ(hay: string, q: string): boolean {
  var toks = fold(q).split(/\s+/).filter(Boolean);
  var h = fold(hay);
  return toks.every(function(t) { return h.indexOf(t) >= 0; });
}
function Hl(props: { text: string; q: string }) {
  var toks = fold(props.q).split(/\s+/).filter(Boolean);
  if (!toks.length) return <>{props.text}</>;
  var h = fold(props.text);
  var mark: boolean[] = [];
  for (var i = 0; i < props.text.length; i++) mark.push(false);
  toks.forEach(function(t) { var p = h.indexOf(t); while (p >= 0) { for (var k = p; k < p + t.length; k++) mark[k] = true; p = h.indexOf(t, p + t.length); } });
  var parts: React.ReactNode[] = [];
  var start = 0;
  for (var j = 1; j <= props.text.length; j++) {
    if (j === props.text.length || mark[j] !== mark[start]) {
      var seg = props.text.slice(start, j);
      parts.push(mark[start] ? <mark key={start} className="bg-yellow-400/30 text-yellow-100 rounded px-0.5">{seg}</mark> : <span key={start}>{seg}</span>);
      start = j;
    }
  }
  return <>{parts}</>;
}

// Ô chọn sản phẩm có tìm kiếm: gõ không dấu, nhiều từ, hoặc mã SKU đều ra; bấm hoặc Enter để chọn (thay cho danh sách gợi ý mặc định của trình duyệt, vốn đòi gõ đúng dấu)
function ProductPicker(props: { value: string; onChange: (v: string) => void; options: string[]; skuOf: Record<string, string[]>; placeholder: string; className?: string; emptyHint?: string }) {
  var [open, setOpen] = useState(false);
  var [hi, setHi] = useState(0);
  var q = props.value;
  var list = useMemo(function() {
    return q.trim() ? props.options.filter(function(p) { return matchQ(p + ' ' + (props.skuOf[p] || []).join(' '), q); }) : props.options;
  }, [q, props.options, props.skuOf]);
  var shown = list.slice(0, 50);
  function pick(p: string) { props.onChange(p); setOpen(false); }
  return (
    <div className="relative">
      <input
        value={q}
        placeholder={props.placeholder}
        className={props.className}
        autoComplete="off"
        onFocus={function() { setOpen(true); }}
        onBlur={function() { setOpen(false); }}
        onChange={function(e) { props.onChange(e.target.value); setOpen(true); setHi(0); }}
        onKeyDown={function(e) {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi(Math.min(hi + 1, shown.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(Math.max(hi - 1, 0)); }
          else if (e.key === 'Enter' && open && shown[hi]) { e.preventDefault(); pick(shown[hi]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {q && <button type="button" aria-label="Xóa" className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full text-gray-400 hover:text-white hover:bg-slate-700" onMouseDown={function(e) { e.preventDefault(); props.onChange(''); setOpen(true); }}>×</button>}
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 max-h-72 overflow-auto rounded-lg border border-slate-600 bg-slate-900 shadow-xl">
          {shown.length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-400">Không tìm thấy sản phẩm nào khớp “{q}”.{props.emptyHint ? ' ' + props.emptyHint : ''}</div>
          ) : (
            <div>
              <div className="px-3 py-1.5 text-[11px] text-gray-500 border-b border-slate-800">{list.length} sản phẩm{list.length > shown.length ? ' (hiện 50 đầu, gõ thêm để lọc)' : ''}</div>
              {shown.map(function(p, i) {
                return (
                  <div key={p} onMouseDown={function(e) { e.preventDefault(); pick(p); }} onMouseEnter={function() { setHi(i); }} className={'px-3 py-2 cursor-pointer text-sm flex flex-wrap items-baseline gap-x-3 ' + (i === hi ? 'bg-blue-600/30 text-white' : 'text-gray-200')}>
                    <span><Hl text={p} q={q} /></span>
                    <span className="text-[11px] font-mono text-blue-300">{(props.skuOf[p] || []).slice(0, 3).join(' · ')}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function monthsBetween(fromMs: number, toMs: number): string[] {
  var out: string[] = [];
  var d = new Date(fromMs);
  var end = new Date(toMs);
  var y = d.getFullYear(), m = d.getMonth();
  while (y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth())) {
    out.push(y + '-' + String(m + 1).padStart(2, '0'));
    m++; if (m > 11) { m = 0; y++; }
  }
  return out;
}

export default function SoKhoPage() {
  var { currentUser, users } = useAppState();
  var isAdmin = !!currentUser && currentUser.role === 'admin';
  var allowed = isAdmin || (!!currentUser && currentUser.role === 'warehouse');

  var [sk, setSk] = useState<SkData>(skEmptyData());
  var [batches, setBatches] = useState<PxkBatch[]>([]);
  var [inv, setInv] = useState<InventoryData | null>(null);
  var [loading, setLoading] = useState(true);
  var [err, setErr] = useState('');
  var [skuVer, setSkuVer] = useState(0);
  var [tab, setTab] = useState<Tab>('ton');
  var [khoPick, setKhoPick] = useState<SkKho>('HCM');
  var [q, setQ] = useState('');
  var [flt, setFlt] = useState<Flt>('tat-ca');
  var [sortBy, setSortBy] = useState<SortBy>('ten');
  var [kq, setKq] = useState(''); // ô tìm kiếm ở tab Kiểm kho
  var [onlyEmpty, setOnlyEmpty] = useState(false); // tab Kiểm kho: chỉ hiện sản phẩm chưa nhập số
  var [open, setOpen] = useState('');
  var [toast, setToast] = useState('');
  var [busy, setBusy] = useState(false);

  var myKho: SkKho | null = currentUser && sk.khoUsers[currentUser.id] ? sk.khoUsers[currentUser.id] : null;
  var kho: SkKho = !isAdmin && myKho ? myKho : khoPick;

  function say(m: string) { setToast(m); setTimeout(function() { setToast(''); }, 4000); }

  var earliest = useMemo(function() {
    var t = Infinity;
    sk.anchors.forEach(function(a) { var x = Date.parse(a.at); if (x < t) t = x; });
    return isFinite(t) ? t : null;
  }, [sk.anchors]);

  var loadSlips = useCallback(async function(from: number | null) {
    var pxk = await dbGetPxk();
    var list = pxk.batches;
    if (from !== null) {
      var oldest = list.length ? Math.min.apply(null, list.map(function(b) { return Date.parse(b.createdAt); })) : Date.now();
      if (oldest > from) {
        var months = monthsBetween(from, oldest);
        var got = await Promise.all(months.map(function(m) { return dbGetPxkArchive(m); }));
        var ids = new Set(list.map(function(b) { return b.id; }));
        got.forEach(function(arr) { arr.forEach(function(b) { if (!ids.has(b.id)) { ids.add(b.id); list = list.concat([b]); } }); });
      }
    }
    return list;
  }, []);

  var reload = useCallback(async function() {
    try {
      var d = await dbGetSoKho();
      setSk(d);
      var t = Infinity;
      d.anchors.forEach(function(a) { var x = Date.parse(a.at); if (x < t) t = x; });
      var list = await loadSlips(isFinite(t) ? t : null);
      setBatches(list);
      setErr('');
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setLoading(false);
  }, [loadSlips]);

  useEffect(function() {
    if (!allowed) return;
    reload();
    refreshInventory().then(setInv).catch(function() { /* không đọc được tồn Sapo: bỏ cột so sánh */ });
    return subscribeSkuMap(function() { setSkuVer(function(v) { return v + 1; }); });
  }, [allowed, reload]);

  var allProducts = useMemo(function() { return getAllProducts(); }, [skuVer]);
  // Danh sách đang theo dõi của kho này: bảng quy đổi SKU + sản phẩm tự thêm, trừ sản phẩm đã bỏ
  var products = useMemo(function() { return skVisibleProducts(allProducts, sk, kho); }, [allProducts, sk, kho]);
  var skuOf = useMemo(function() { return getProductSkuCodes(); }, [skuVer]);
  var calc: SkSlipCalc = useMemo(function() {
    return skCalcSlips(batches, earliest === null ? Infinity : earliest, getSkuProducts);
  }, [batches, earliest, skuVer]);
  var rows: SkRow[] = useMemo(function() {
    var vis = new Set(products);
    return skStock(sk, calc, kho, products).filter(function(r) { return vis.has(r.product); });
  }, [sk, calc, kho, products]);
  var hiddenRows: SkRow[] = useMemo(function() {
    var hid = new Set(sk.hidden[kho] || []);
    return skStock(sk, calc, kho, sk.hidden[kho] || []).filter(function(r) { return hid.has(r.product); });
  }, [sk, calc, kho]);

  var lastCount = useMemo(function() {
    var best: { at: string; n: number; by: string } | null = null;
    var bySession: Record<string, { at: string; n: number; by: string }> = {};
    sk.anchors.forEach(function(a) { if (a.kho !== kho) return; var s = bySession[a.session] || (bySession[a.session] = { at: a.at, n: 0, by: a.by }); s.n++; });
    Object.keys(bySession).forEach(function(k) { if (!best || Date.parse(bySession[k].at) > Date.parse(best.at)) best = bySession[k]; });
    return best as { at: string; n: number; by: string } | null;
  }, [sk.anchors, kho]);

  var shown = rows.filter(function(r) {
    if (q.trim() && !matchQ(r.product + ' ' + (skuOf[r.product] || []).join(' '), q)) return false;
    if (flt === 'chua-kiem') return r.anchor === null;
    if (flt === 'am') return r.stock !== null && r.stock < 0;
    if (flt === 'phat-sinh') return r.slipQty !== 0 || r.moveQty !== 0;
    return true;
  });
  var nChua = rows.filter(function(r) { return r.anchor === null; }).length;
  var nAm = rows.filter(function(r) { return r.stock !== null && r.stock < 0; }).length;

  function exportExcel() {
    var aoa: Array<Array<string | number>> = [['Sản phẩm', 'Mã SKU', 'Số kiểm kho', 'Lúc kiểm', 'Nhập/điều chỉnh sau kiểm', 'Đã xuất theo phiếu', 'Tồn hiện tại', 'Tồn Sapo/app', 'Lệch với Sapo']];
    rows.forEach(function(r) {
      var app = inv ? getCurrentStock(inv, r.product, kho) : '';
      aoa.push([r.product, (skuOf[r.product] || []).join(' / '), r.anchor ? r.anchor.qty : '', r.anchor ? fmtAt(r.anchor.at) : '', r.moveQty, r.slipQty, r.stock === null ? '' : r.stock, app, r.stock === null || app === '' ? '' : r.stock - (app as number)]);
    });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), SK_KHO_LABEL[kho]);
    XLSX.writeFile(wb, 'so-kho-' + kho + '-' + localInput(new Date()).slice(0, 10) + '.xlsx');
  }

  // ----- Thêm / bỏ sản phẩm khỏi danh sách -----
  var [addOpen, setAddOpen] = useState(false);
  var [addName, setAddName] = useState('');

  async function addProduct() {
    var name = addName.trim();
    if (!name) { say('Nhập hoặc chọn tên sản phẩm.'); return; }
    if (products.indexOf(name) >= 0) { say('Sản phẩm này đã có trong danh sách.'); return; }
    setBusy(true);
    try {
      var wasHidden = (sk.hidden[kho] || []).indexOf(name) >= 0;
      var inMapping = allProducts.indexOf(name) >= 0;
      if (wasHidden || inMapping) setSk(await dbSoKhoAction('hideProduct', { kho: kho, product: name, hide: false }));
      else setSk(await dbSoKhoAction('addExtra', { name: name }));
      setAddName(''); setAddOpen(false);
      say(wasHidden ? 'Đã hiện lại ' + name + '.' : inMapping ? 'Đã thêm ' + name + '.' : 'Đã thêm ' + name + ' (sản phẩm tự thêm, ngoài bảng quy đổi SKU: tự nhập kiểm kho và nhập/điều chỉnh, phiếu xuất kho chưa tự trừ).');
    } catch (e) { say(e instanceof Error ? e.message : 'Không thêm được.'); }
    setBusy(false);
  }

  async function readSheet(file: File): Promise<unknown[][]> {
    var wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null }) as unknown[][];
  }

  var [listMode, setListMode] = useState<'them' | 'giu'>('them');
  var [listMsg, setListMsg] = useState('');

  async function importProductFile(file: File) {
    setListMsg('');
    try {
      var known = allProducts.concat(sk.extra || [], sk.hidden[kho] || []);
      var r = skParseProductSheet(await readSheet(file), known, getSkuProducts);
      if (!r.names.length) { setListMsg('Không đọc được sản phẩm nào trong file. Cần cột "Sản phẩm" (hoặc "Mã SKU").' + (r.errors.length ? ' ' + r.errors.slice(0, 3).join(' | ') : '')); return; }
      var inFile = new Set(r.names);
      var toShow = r.names.filter(function(n) { return products.indexOf(n) < 0; });
      var toHide = listMode === 'giu' ? products.filter(function(p) { return !inFile.has(p); }) : [];
      if (!toShow.length && !toHide.length) { setListMsg('Danh sách trong file đã khớp với danh sách hiện tại, không có gì thay đổi.'); return; }
      var ask = 'Nhập danh sách sản phẩm cho ' + SK_KHO_LABEL[kho] + ' từ file (' + r.names.length + ' sản phẩm):\n\n• Thêm / hiện lại: ' + toShow.length + (r.isNew.length ? ' (trong đó ' + r.isNew.length + ' sản phẩm MỚI ngoài bảng quy đổi SKU: ' + r.isNew.slice(0, 6).join(', ') + (r.isNew.length > 6 ? '…' : '') + ')' : '') + '\n• Bỏ khỏi danh sách: ' + toHide.length + (toHide.length ? ' (số liệu vẫn giữ, hiện lại được)' : '') + (r.errors.length ? '\n• Bỏ qua ' + r.errors.length + ' dòng không hợp lệ' : '') + '\n\nTiếp tục?';
      if (!window.confirm(ask)) return;
      setBusy(true);
      try {
        setSk(await dbSoKhoAction('bulkProducts', { kho: kho, show: r.names, hide: toHide, addExtra: r.isNew }));
        setListMsg('Đã cập nhật: thêm/hiện lại ' + toShow.length + ', bỏ ' + toHide.length + '.' + (r.errors.length ? ' Bỏ qua: ' + r.errors.slice(0, 3).join(' | ') : ''));
      } catch (e) { setListMsg(e instanceof Error ? e.message : 'Không lưu được.'); }
      setBusy(false);
    } catch { setListMsg('Không đọc được file Excel này.'); }
  }

  async function removeProduct(r: SkRow) {
    var hasData = r.anchor !== null || r.moveQty !== 0 || r.slipQty !== 0;
    var isExtra = sk.extra.indexOf(r.product) >= 0;
    var ask = 'Bỏ "' + r.product + '" khỏi danh sách ' + SK_KHO_LABEL[kho] + '?' + (hasData ? '\n\nSản phẩm này đang có số liệu (kiểm kho/nhập/xuất theo phiếu). Số liệu vẫn được giữ, chỉ ẩn khỏi bảng; hiện lại được ở mục "Đã ẩn" bên dưới.' : '');
    if (!window.confirm(ask)) return;
    setBusy(true);
    try {
      if (isExtra && !hasData) setSk(await dbSoKhoAction('removeExtra', { name: r.product }));
      else setSk(await dbSoKhoAction('hideProduct', { kho: kho, product: r.product, hide: true }));
      say('Đã bỏ ' + r.product + ' khỏi danh sách.');
    } catch (e) { say(e instanceof Error ? e.message : 'Không bỏ được.'); }
    setBusy(false);
  }

  async function restoreProduct(name: string) {
    setBusy(true);
    try { setSk(await dbSoKhoAction('hideProduct', { kho: kho, product: name, hide: false })); say('Đã hiện lại ' + name + '.'); } catch (e) { say(e instanceof Error ? e.message : 'Không hiện lại được.'); }
    setBusy(false);
  }

  // ----- Kiểm kho -----
  var [countAt, setCountAt] = useState(localInput(new Date()));
  var [countNote, setCountNote] = useState('');
  var [countVals, setCountVals] = useState<Record<string, string>>({});
  var [pasteText, setPasteText] = useState('');
  var [pasteMsg, setPasteMsg] = useState('');

  function doPaste() {
    var r = skParseCount(pasteText, products, getSkuProducts);
    var next = Object.assign({}, countVals);
    r.items.forEach(function(i) { next[i.product] = String(i.qty); });
    setCountVals(next);
    setPasteMsg('Đã điền ' + r.items.length + ' sản phẩm.' + (r.errors.length ? ' ' + r.errors.length + ' dòng bỏ qua: ' + r.errors.slice(0, 4).join(' | ') : ''));
    if (!r.errors.length) setPasteText('');
  }

  var [fileMsg, setFileMsg] = useState('');

  function downloadCountTemplate() {
    var aoa: Array<Array<string | number>> = [['Sản phẩm', 'Mã SKU', 'Tồn hiện tại', 'Số đếm thực tế']];
    rows.forEach(function(r) { aoa.push([r.product, (skuOf[r.product] || []).join(' / '), r.stock === null ? '' : r.stock, '']); });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Kiem kho ' + kho);
    XLSX.writeFile(wb, 'mau-kiem-kho-' + kho + '.xlsx');
  }

  async function importCountFile(file: File) {
    setFileMsg('');
    try {
      var r = skParseCountSheet(await readSheet(file), products, getSkuProducts);
      if (!r.items.length) { setFileMsg('Không đọc được số lượng nào. Cần cột "Sản phẩm" (hoặc "Mã SKU") và cột "Số đếm thực tế" (hoặc "Số kiểm kho", "Số lượng").' + (r.errors.length ? ' ' + r.errors.slice(0, 3).join(' | ') : '')); return; }
      var next = Object.assign({}, countVals);
      r.items.forEach(function(i) { next[i.product] = String(i.qty); });
      setCountVals(next);
      setFileMsg('Đã điền ' + r.items.length + ' sản phẩm từ cột "' + r.qtyHeader + '" (chưa lưu, hãy kiểm tra rồi bấm Lưu kiểm kho).' + (r.errors.length ? ' ' + r.errors.length + ' dòng bỏ qua: ' + r.errors.slice(0, 4).join(' | ') : ''));
    } catch { setFileMsg('Không đọc được file Excel này.'); }
  }

  async function saveCount() {
    var items = products.filter(function(p) { return (countVals[p] || '').trim() !== ''; }).map(function(p) { return { product: p, qty: parseFloat((countVals[p] || '').replace(',', '.')) }; });
    if (!items.length) { say('Chưa nhập số lượng nào.'); return; }
    if (items.some(function(i) { return !isFinite(i.qty) || i.qty < 0; })) { say('Có số lượng không hợp lệ.'); return; }
    var at = new Date(countAt);
    if (!isFinite(at.getTime())) { say('Chọn thời điểm kiểm kho.'); return; }
    if (!window.confirm('Lưu kiểm kho ' + SK_KHO_LABEL[kho] + ' lúc ' + fmtAt(at.getTime()) + ' với ' + items.length + ' sản phẩm?\n\nTừ thời điểm này, tồn các sản phẩm đó = số vừa nhập. Phiếu lập trước thời điểm này không trừ; phiếu lập sau sẽ tự trừ (mỗi đơn một lần).' + (items.length < products.length ? '\n\nLưu ý: ' + (products.length - items.length) + ' sản phẩm để trống sẽ giữ nguyên số kiểm cũ (hoặc "chưa kiểm").' : ''))) return;
    setBusy(true);
    try {
      var d = await dbSoKhoAction('addCount', { kho: kho, at: at.toISOString(), note: countNote, by: currentUser ? currentUser.name : '', items: items });
      setSk(d);
      setCountVals({}); setCountNote('');
      say('Đã lưu kiểm kho ' + items.length + ' sản phẩm.');
      await reload();
      setTab('ton');
    } catch (e) { say(e instanceof Error ? e.message : 'Không lưu được.'); }
    setBusy(false);
  }

  // ----- Nhập hàng / điều chỉnh -----
  var [mvProduct, setMvProduct] = useState('');
  var [mvType, setMvType] = useState<'import' | 'adjust'>('import');
  var [mvQty, setMvQty] = useState('');
  var [mvAt, setMvAt] = useState(localInput(new Date()));
  var [mvNote, setMvNote] = useState('');

  async function saveMove() {
    var qty = parseFloat(mvQty.replace(',', '.'));
    // gõ chưa chọn trong danh sách: chấp nhận nếu chỉ có đúng 1 sản phẩm khớp
    var prod = products.indexOf(mvProduct) >= 0 ? mvProduct : '';
    if (!prod && mvProduct.trim()) { var hit = products.filter(function(p) { return matchQ(p + ' ' + (skuOf[p] || []).join(' '), mvProduct); }); if (hit.length === 1) prod = hit[0]; }
    if (!prod) { say(mvProduct.trim() ? 'Chưa chọn đúng sản phẩm: bấm một dòng trong danh sách gợi ý.' : 'Chọn sản phẩm.'); return; }
    if (!isFinite(qty) || qty === 0) { say('Nhập số lượng khác 0.'); return; }
    if (mvType === 'import' && qty < 0) { say('Nhập hàng phải là số dương. Hàng hỏng/mất thì chọn "Điều chỉnh" và nhập số âm.'); return; }
    setBusy(true);
    try {
      setSk(await dbSoKhoAction('addMove', { kho: kho, product: prod, qty: qty, type: mvType, at: new Date(mvAt).toISOString(), note: mvNote, by: currentUser ? currentUser.name : '' }));
      setMvQty(''); setMvNote('');
      say('Đã ghi.');
    } catch (e) { say(e instanceof Error ? e.message : 'Không lưu được.'); }
    setBusy(false);
  }

  async function removeEntries(payload: { sessions?: string[]; moveIds?: string[] }, ask: string) {
    if (!window.confirm(ask)) return;
    setBusy(true);
    try { setSk(await dbSoKhoAction('removeEntries', payload)); await reload(); say('Đã xóa.'); } catch (e) { say(e instanceof Error ? e.message : 'Không xóa được.'); }
    setBusy(false);
  }

  async function toggleDeduct(on: boolean) {
    var ask = on
      ? 'BẬT trừ kho theo phiếu xuất kho?\n\nTừ lúc bật, mọi phiếu lập sau số kiểm kho của từng sản phẩm (kể cả phiếu đã lập trong thời gian tạm dừng) sẽ bị trừ vào tồn. Chỉ nên bật khi đã kiểm kho đủ các sản phẩm đang theo dõi, nếu không tồn sẽ lệch.'
      : 'TẠM DỪNG trừ kho theo phiếu xuất kho? Sổ kho chỉ còn lưu số kiểm kho, nhập hàng và điều chỉnh.';
    if (!window.confirm(ask)) return;
    setBusy(true);
    try { setSk(await dbSoKhoAction('setDeduct', { on: on })); say(on ? 'Đã bật trừ kho theo phiếu.' : 'Đã tạm dừng trừ kho theo phiếu.'); } catch (e) { say(e instanceof Error ? e.message : 'Không lưu được.'); }
    setBusy(false);
  }

  async function setUserKho(userId: string, k: SkKho | '') {
    setBusy(true);
    try { setSk(await dbSoKhoAction('setKhoUser', { userId: userId, kho: k === '' ? null : k })); say('Đã lưu.'); } catch (e) { say(e instanceof Error ? e.message : 'Không lưu được.'); }
    setBusy(false);
  }

  if (!allowed) return <div className="p-6 text-red-400">Trang này chỉ dành cho nhân sự kho và admin.</div>;

  var sessions = (function() {
    var m: Record<string, { id: string; at: string; kho: SkKho; by: string; n: number; note: string }> = {};
    sk.anchors.forEach(function(a) { var s = m[a.session] || (m[a.session] = { id: a.session, at: a.at, kho: a.kho, by: a.by, n: 0, note: a.note || '' }); s.n++; });
    return Object.keys(m).map(function(k) { return m[k]; }).sort(function(a, b) { return Date.parse(b.at) - Date.parse(a.at); });
  })();
  var whUsers = users.filter(function(u) { return u.role === 'warehouse'; });

  var khoStat = (function() {
    var counted = rows.filter(function(r) { return r.anchor !== null; }).length;
    var nLech = 0;
    if (inv) rows.forEach(function(r) { var a = getCurrentStock(inv as InventoryData, r.product, kho); if (r.stock !== null && r.stock !== a) nLech++; });
    return { total: rows.length, counted: counted, pct: rows.length ? Math.round(counted / rows.length * 100) : 0, nLech: nLech };
  })();

  // Danh sách hiển thị ở tab Tồn hiện tại: lọc + sắp xếp
  var shownSorted = (function() {
    var list = shown.slice();
    var diffOf = function(r: SkRow) { return inv && r.stock !== null ? Math.abs(r.stock - getCurrentStock(inv as InventoryData, r.product, kho)) : -1; };
    if (sortBy === 'ton-giam') list.sort(function(a, b) { return (b.stock === null ? -Infinity : b.stock) - (a.stock === null ? -Infinity : a.stock); });
    else if (sortBy === 'ton-tang') list.sort(function(a, b) { return (a.stock === null ? Infinity : a.stock) - (b.stock === null ? Infinity : b.stock); });
    else if (sortBy === 'lech') list.sort(function(a, b) { return diffOf(b) - diffOf(a); });
    return list;
  })();

  var tabs: Array<[Tab, string, string]> = isAdmin
    ? [['ton', '📦', 'Tồn hiện tại'], ['kiem', '📝', 'Kiểm kho'], ['nhap', '➕', 'Nhập hàng / điều chỉnh'], ['gan', '👤', 'Gán kho']]
    : [['ton', '📦', 'Tồn hiện tại']];

  var gridCls = inv
    ? (isAdmin ? 'md:grid-cols-[minmax(0,3fr)_repeat(5,minmax(0,1fr))_2rem]' : 'md:grid-cols-[minmax(0,3fr)_repeat(5,minmax(0,1fr))]')
    : (isAdmin ? 'md:grid-cols-[minmax(0,3fr)_repeat(4,minmax(0,1fr))_2rem]' : 'md:grid-cols-[minmax(0,3fr)_repeat(4,minmax(0,1fr))]');

  var kiemRows = rows.filter(function(r) {
    if (kq.trim() && !matchQ(r.product + ' ' + (skuOf[r.product] || []).join(' '), kq)) return false;
    if (onlyEmpty && (countVals[r.product] || '').trim() !== '') return false;
    return true;
  });
  var filledN = products.filter(function(p) { return (countVals[p] || '').trim() !== ''; }).length;

  return (
    <div className="max-w-6xl mx-auto pb-24">
      {/* Tiêu đề + chọn kho */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-2">📒 Sổ kho thực tế</h1>
          <p className="text-sm text-gray-500 mt-1">Số hàng đếm thực tế của kho, cộng nhập hàng và điều chỉnh{sk.deductFromSlips ? ', trừ theo phiếu xuất kho.' : '.'}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={'hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border ' + (sk.deductFromSlips ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-300')}>
            <span className={'w-2 h-2 rounded-full ' + (sk.deductFromSlips ? 'bg-emerald-400' : 'bg-amber-400')}></span>{sk.deductFromSlips ? 'Đang trừ kho theo phiếu' : 'Tạm dừng trừ kho theo phiếu'}
          </span>
          {!isAdmin && myKho ? <div className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm font-medium">{SK_KHO_LABEL[myKho]}</div> : (
            <div className="inline-flex p-1 rounded-xl bg-slate-800 border border-slate-700">{SK_KHO.map(function(k) {
              return <button key={k} onClick={function() { setKhoPick(k); }} className={'px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ' + (kho === k ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-gray-200')}>{SK_KHO_LABEL[k]}</button>;
            })}</div>
          )}
        </div>
      </div>

      {/* Tab */}
      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-5" role="tablist">
          {tabs.map(function(t) {
            return <button key={t[0]} role="tab" aria-selected={tab === t[0]} onClick={function() { setTab(t[0]); }}
              className={'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border transition-colors ' + (tab === t[0] ? 'bg-blue-600 border-blue-500 text-white shadow' : 'bg-slate-900 border-slate-700 text-gray-300 hover:bg-slate-800')}><span>{t[1]}</span>{t[2]}</button>;
          })}
        </div>
      )}

      {err && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">Không tải được dữ liệu sổ kho: {err}</div>}
      {loading && !err && <div className="p-10 text-center text-gray-400 text-sm">Đang tải…</div>}

      {/* ===== TỒN HIỆN TẠI ===== */}
      {!loading && !err && tab === 'ton' && (
        <div>
          {/* Thẻ tổng quan */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
              <div className="text-xs text-gray-500">Sản phẩm theo dõi</div>
              <div className="text-2xl font-bold text-gray-100 mt-1">{khoStat.total}</div>
              <div className="text-xs text-gray-500 mt-1">{SK_KHO_LABEL[kho]}</div>
            </div>
            <button onClick={function() { setFlt(flt === 'chua-kiem' ? 'tat-ca' : 'chua-kiem'); }} className="text-left bg-slate-900 border border-slate-700 hover:border-blue-500/60 rounded-xl p-4 transition-colors">
              <div className="text-xs text-gray-500">Đã kiểm kho</div>
              <div className="text-2xl font-bold text-gray-100 mt-1">{khoStat.counted}<span className="text-base font-normal text-gray-500"> / {khoStat.total}</span></div>
              <div className="h-1.5 rounded-full bg-slate-800 mt-2 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: khoStat.pct + '%' }}></div></div>
              <div className="text-xs text-gray-500 mt-1">{nChua > 0 ? 'Bấm để xem ' + nChua + ' sản phẩm chưa kiểm' : 'Đã kiểm đủ'}</div>
            </button>
            <button onClick={function() { setFlt(flt === 'am' ? 'tat-ca' : 'am'); }} className="text-left bg-slate-900 border border-slate-700 hover:border-blue-500/60 rounded-xl p-4 transition-colors">
              <div className="text-xs text-gray-500">Tồn âm</div>
              <div className={'text-2xl font-bold mt-1 ' + (nAm ? 'text-red-300' : 'text-gray-100')}>{nAm}</div>
              <div className="text-xs text-gray-500 mt-1">{nAm ? 'Bấm để lọc' : 'Không có'}</div>
            </button>
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
              <div className="text-xs text-gray-500">Kiểm kho gần nhất</div>
              {lastCount ? (
                <>
                  <div className="text-lg font-bold text-gray-100 mt-1">{fmtAt(lastCount.at)}</div>
                  <div className="text-xs text-gray-500 mt-1">{lastCount.n} sản phẩm · {lastCount.by || 'không rõ người'}</div>
                </>
              ) : <div className="text-sm text-gray-400 mt-2">Chưa có số kiểm nào</div>}
            </div>
          </div>

          {/* Thông báo */}
          {!sk.deductFromSlips ? (
            <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200 flex flex-wrap items-center justify-between gap-2">
              <span><b>Đang tạm dừng trừ kho theo phiếu xuất kho.</b> Tồn = số kiểm gần nhất + nhập/điều chỉnh. Chờ kiểm đủ kho rồi bật lại.</span>
              {isAdmin && <button className={btnCls} disabled={busy} onClick={function() { toggleDeduct(true); }}>Bật trừ kho theo phiếu</button>}
            </div>
          ) : (
            isAdmin && <div className="mb-3 text-xs text-gray-500">Đang trừ kho theo phiếu xuất kho. <button className="underline text-gray-400 hover:text-gray-200" disabled={busy} onClick={function() { toggleDeduct(false); }}>Tạm dừng</button></div>
          )}
          {!isAdmin && !myKho && <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">Tài khoản của bạn chưa được gán kho. Nhờ admin gán ở mục Gán kho; trong lúc chờ bạn xem được cả hai kho.</div>}
          {!lastCount && <div className="mb-4 p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sm text-sky-200">{SK_KHO_LABEL[kho]} chưa có số kiểm kho nào. Admin vào mục “Kiểm kho” nhập số đếm thực tế.</div>}
          {sk.deductFromSlips && calc.noKho.length > 0 && <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-200">{calc.noKho.length} phiếu lập sau lần kiểm kho nhưng KHÔNG ghi kho nên chưa trừ được: {calc.noKho.slice(0, 8).map(function(n) { return n.id + ' (' + n.orders + ' đơn)'; }).join(', ')}{calc.noKho.length > 8 ? ' và ' + (calc.noKho.length - 8) + ' phiếu khác' : ''}.</div>}
          {sk.deductFromSlips && calc.unmapped.length > 0 && (
            <details className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">
              <summary className="cursor-pointer">{calc.unmapped.length} loại hàng trong phiếu chưa quy ra được sản phẩm nên CHƯA trừ kho (bấm để xem)</summary>
              <ul className="mt-2 list-disc pl-5 text-xs">{calc.unmapped.slice(0, 40).map(function(u) { return <li key={u.key}>{u.key.indexOf('sku:') === 0 ? 'SKU ' : 'Chưa có SKU: '}{u.label} — {fmt(u.qty)} cái (phiếu {u.batches.join(', ')})</li>; })}</ul>
              <div className="text-xs mt-1">Sửa bảng quy đổi SKU (hoặc gắn SKU cho dòng chưa có SKU), phiếu cũ sẽ tự tính lại.</div>
            </details>
          )}

          {/* Thanh tìm kiếm + lọc (dính trên đầu khi cuộn) */}
          <div className="sticky top-0 z-20 -mx-1 px-1 pt-1 pb-3 bg-slate-950/95 backdrop-blur">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-lg pointer-events-none">🔍</span>
              <input value={q} onChange={function(e) { setQ(e.target.value); }} placeholder="Tìm sản phẩm hoặc mã SKU… (gõ không dấu cũng được)" autoFocus
                className="w-full pl-12 pr-24 py-3.5 bg-slate-900 border border-slate-600 focus:border-blue-500 rounded-xl text-base text-gray-100 outline-none placeholder:text-gray-500" />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                {q && <span className="text-xs text-gray-400">{shownSorted.length} kết quả</span>}
                {q && <button aria-label="Xóa tìm kiếm" onClick={function() { setQ(''); }} className="w-7 h-7 rounded-full bg-slate-700 hover:bg-slate-600 text-gray-200 text-sm">×</button>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {([['tat-ca', 'Tất cả', rows.length], ['chua-kiem', 'Chưa kiểm kho', nChua], ['am', 'Tồn âm', nAm], ['phat-sinh', 'Có phát sinh', rows.filter(function(r) { return r.slipQty !== 0 || r.moveQty !== 0; }).length]] as Array<[Flt, string, number]>).map(function(c) {
                return <button key={c[0]} onClick={function() { setFlt(c[0]); }} aria-pressed={flt === c[0]} className={'px-3.5 py-1.5 rounded-full text-sm border transition-colors ' + (flt === c[0] ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-700 text-gray-300 hover:bg-slate-800')}>{c[1]} <b className={flt === c[0] ? '' : 'text-gray-100'}>{c[2]}</b></button>;
              })}
              <span className="ml-auto flex flex-wrap items-center gap-2">
                <label className="text-xs text-gray-500 hidden sm:block">Sắp xếp</label>
                <select value={sortBy} onChange={function(e) { setSortBy(e.target.value as SortBy); }} className={inputCls + ' !py-1.5'}>
                  <option value="ten">Tên A → Z</option>
                  <option value="ton-giam">Tồn cao → thấp</option>
                  <option value="ton-tang">Tồn thấp → cao</option>
                  {inv && <option value="lech">Lệch Sapo nhiều nhất</option>}
                </select>
                {isAdmin && <button className={btnCls} onClick={function() { setAddOpen(!addOpen); }}>＋ Thêm sản phẩm</button>}
                <button className={btnCls} onClick={exportExcel}>⬇ Tải Excel</button>
              </span>
            </div>
          </div>

          {isAdmin && addOpen && (
            <div className={cardCls + ' !p-4'}>
              <div className="text-sm font-medium text-gray-200 mb-1">Thêm sản phẩm vào {SK_KHO_LABEL[kho]}</div>
              <div className="text-xs text-gray-500 mb-3">Chọn sản phẩm đã ẩn hoặc trong bảng quy đổi SKU để hiện lại, hoặc gõ tên mới (vật tư, bao bì… ngoài bảng quy đổi: tự nhập kiểm kho và nhập/điều chỉnh, phiếu xuất kho chưa tự trừ).</div>
              <div className="flex flex-wrap gap-2">
                <div className="w-80 max-w-full"><ProductPicker value={addName} onChange={setAddName} options={allProducts.concat(sk.hidden[kho] || []).filter(function(p, i, a) { return a.indexOf(p) === i && products.indexOf(p) < 0; })} skuOf={skuOf} placeholder="Tên sản phẩm (gõ để tìm hoặc nhập tên mới)" className={inputCls + ' w-full pr-9'} emptyHint="Bấm Thêm để tạo sản phẩm mới đúng tên này." /></div>
                <button className={btnPrimaryCls + ' !py-1.5'} disabled={busy} onClick={addProduct}>Thêm vào {SK_KHO_LABEL[kho]}</button>
                <button className={btnCls} onClick={function() { setAddOpen(false); }}>Đóng</button>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-700">
                <div className="text-xs text-gray-500 mb-2">Hoặc nhập cả danh sách từ file Excel (cột “Sản phẩm” hoặc “Mã SKU”; dùng được file vừa tải ở nút Tải Excel).</div>
                <div className="flex flex-wrap items-center gap-2">
                  <select value={listMode} onChange={function(e) { setListMode(e.target.value as 'them' | 'giu'); }} className={inputCls}>
                    <option value="them">Chỉ thêm / hiện lại các sản phẩm trong file</option>
                    <option value="giu">Chỉ giữ các sản phẩm trong file (bỏ phần còn lại)</option>
                  </select>
                  <label className={btnCls + ' cursor-pointer'}>Chọn file Excel…<input type="file" accept=".xlsx,.xls" className="hidden" disabled={busy} onChange={function(e) { var f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) importProductFile(f); }} /></label>
                </div>
                {listMsg && <div className="text-xs text-gray-300 mt-2">{listMsg}</div>}
              </div>
            </div>
          )}

          {/* Tiêu đề cột (máy tính) */}
          <div className={'hidden md:grid gap-x-4 px-4 pb-2 text-xs font-medium text-gray-500 ' + gridCls}>
            <div>Sản phẩm</div><div className="text-right">Tồn hiện tại</div><div className="text-right">Số kiểm kho</div><div className="text-right">Nhập / điều chỉnh</div><div className="text-right">Xuất theo phiếu</div>{inv && <div className="text-right" title="Số trong trang Kho (đồng bộ từ Sapo)">Tồn Sapo / lệch</div>}{isAdmin && <div></div>}
          </div>

          {/* Danh sách sản phẩm */}
          <div className="space-y-2">
            {shownSorted.map(function(r) {
              var app = inv ? getCurrentStock(inv, r.product, kho) : null;
              var diff = r.stock !== null && app !== null ? r.stock - app : null;
              var isOpen = open === r.product;
              var hist = isOpen ? skProductHistory(sk, calc, kho, r.product) : [];
              var tone = r.stock === null ? 'border-l-slate-600' : r.stock < 0 ? 'border-l-red-500' : r.stock === 0 ? 'border-l-amber-500' : 'border-l-emerald-500';
              var stockCls = r.stock === null ? 'text-gray-500' : r.stock < 0 ? 'text-red-300' : r.stock === 0 ? 'text-amber-300' : 'text-emerald-300';
              return (
                <div key={r.product} className={'bg-slate-900 border border-slate-700 border-l-4 rounded-xl overflow-hidden ' + tone + (isOpen ? ' ring-1 ring-blue-500/40' : '')}>
                  <div role="button" tabIndex={0} onClick={function() { setOpen(isOpen ? '' : r.product); }} onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(isOpen ? '' : r.product); } }}
                    className={'grid grid-cols-2 gap-x-4 gap-y-3 p-3 md:p-4 items-center cursor-pointer hover:bg-slate-800/60 ' + gridCls}>
                    <div className="col-span-2 md:col-span-1 min-w-0">
                      <div className="font-medium text-gray-100 leading-snug"><Hl text={r.product} q={q} /></div>
                      <div className="flex flex-wrap gap-1 mt-1">{(skuOf[r.product] || []).slice(0, 4).map(function(c) { return <code key={c} className="px-1.5 py-0.5 bg-slate-800 rounded text-[11px] text-blue-300 font-mono"><Hl text={c} q={q} /></code>; })}{sk.extra.indexOf(r.product) >= 0 && <span className="px-1.5 py-0.5 rounded text-[11px] bg-purple-500/15 text-purple-300">tự thêm</span>}</div>
                    </div>
                    <div className="md:text-right"><span className="md:hidden text-[11px] text-gray-500 block">Tồn hiện tại</span>
                      {r.stock === null ? <span className="inline-block px-2 py-0.5 rounded-md bg-slate-800 text-gray-500 text-xs">Chưa kiểm</span> : <span className={'text-xl font-bold font-mono ' + stockCls}>{fmt(r.stock)}</span>}</div>
                    <div className="md:text-right font-mono text-sm text-gray-200"><span className="md:hidden text-[11px] text-gray-500 block font-sans">Số kiểm kho</span>
                      {r.anchor ? <>{fmt(r.anchor.qty)}<div className="text-[11px] text-gray-500 font-sans">{fmtAt(r.anchor.at)}</div></> : <span className="text-gray-600">—</span>}</div>
                    <div className="md:text-right font-mono text-sm"><span className="md:hidden text-[11px] text-gray-500 block font-sans">Nhập / điều chỉnh</span>
                      {r.moveQty ? <span className={r.moveQty > 0 ? 'text-emerald-300' : 'text-red-300'}>{(r.moveQty > 0 ? '+' : '') + fmt(r.moveQty)}</span> : <span className="text-gray-600">—</span>}</div>
                    <div className="md:text-right font-mono text-sm"><span className="md:hidden text-[11px] text-gray-500 block font-sans">Xuất theo phiếu</span>
                      {!sk.deductFromSlips ? <span className="text-gray-600 text-xs font-sans">tạm dừng</span> : r.slipQty ? <span className="text-red-300">{'−' + fmt(r.slipQty)}</span> : <span className="text-gray-600">—</span>}</div>
                    {inv && <div className="md:text-right font-mono text-sm text-gray-300"><span className="md:hidden text-[11px] text-gray-500 block font-sans">Tồn Sapo / lệch</span>
                      {app === null ? '—' : fmt(app)}
                      {diff !== null && diff !== 0 && <div className="text-[11px] text-amber-300 font-sans">lệch {(diff > 0 ? '+' : '') + fmt(diff)}</div>}
                      {diff === 0 && <div className="text-[11px] text-emerald-400 font-sans">khớp</div>}</div>}
                    {isAdmin && <div className="text-right"><button title="Bỏ khỏi danh sách" aria-label="Bỏ khỏi danh sách" disabled={busy} className="w-7 h-7 rounded-full text-gray-600 hover:text-red-400 hover:bg-red-500/10" onClick={function(e) { e.stopPropagation(); removeProduct(r); }}>×</button></div>}
                  </div>
                  {isOpen && (
                    <div className="border-t border-slate-800 bg-slate-950/60 px-4 py-3">
                      <div className="text-xs font-medium text-gray-400 mb-2">Lịch sử biến động · {SK_KHO_LABEL[kho]}</div>
                      {hist.length === 0 ? <div className="text-xs text-gray-500">Chưa có biến động nào cho sản phẩm này.</div> : (
                        <ul className="space-y-1.5">{hist.map(function(h, i) {
                          return <li key={i} className={'flex flex-wrap items-baseline gap-x-3 text-xs ' + (h.counted ? 'text-gray-200' : 'text-gray-600 line-through')}>
                            <span className="font-mono text-gray-400 w-24 shrink-0">{fmtAt(h.at)}</span>
                            <span className="flex-1 min-w-[10rem]">{h.label}{!h.counted && ' (không tính)'}</span>
                            <b className={'font-mono ' + (h.kind === 'kiem' ? 'text-sky-300' : h.qty < 0 ? 'text-red-300' : 'text-emerald-300')}>{h.kind === 'kiem' ? '= ' + fmt(h.qty) : (h.qty > 0 ? '+' : '') + fmt(h.qty)}</b>
                          </li>;
                        })}</ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {shownSorted.length === 0 && (
              <div className="p-10 text-center bg-slate-900 border border-slate-700 rounded-xl">
                <div className="text-3xl mb-2">🔎</div>
                <div className="text-gray-300">{q ? 'Không tìm thấy sản phẩm nào khớp “' + q + '”' : 'Không có sản phẩm nào trong nhóm này'}</div>
                {(q || flt !== 'tat-ca') && <button className={btnCls + ' mt-3'} onClick={function() { setQ(''); setFlt('tat-ca'); }}>Xóa tìm kiếm và bộ lọc</button>}
              </div>
            )}
          </div>

          {isAdmin && hiddenRows.length > 0 && (
            <details className="mt-5 p-3 rounded-xl bg-slate-900 border border-slate-700">
              <summary className="cursor-pointer text-sm text-gray-300">Đã ẩn khỏi danh sách {SK_KHO_LABEL[kho]} ({hiddenRows.length})</summary>
              <ul className="mt-2 text-sm">{hiddenRows.map(function(r) {
                return <li key={r.product} className="flex items-center gap-3 py-1.5 border-t border-slate-800"><span className="flex-1 text-gray-300">{r.product}{(r.slipQty !== 0 || r.anchor) && <span className="ml-2 text-xs text-gray-500">{r.anchor ? 'có số kiểm kho' : ''}{r.slipQty !== 0 ? ' · đã xuất theo phiếu ' + fmt(r.slipQty) : ''}</span>}</span><button className={btnCls} disabled={busy} onClick={function() { restoreProduct(r.product); }}>Hiện lại</button></li>;
              })}</ul>
            </details>
          )}
        </div>
      )}

      {/* ===== KIỂM KHO ===== */}
      {!loading && !err && tab === 'kiem' && isAdmin && (
        <div>
          <div className={cardCls}>
            <h2 className="text-base font-semibold text-gray-100 mb-1">Kiểm kho {SK_KHO_LABEL[kho]}</h2>
            <p className="text-xs text-gray-500 mb-4">Chọn đúng thời điểm đếm kho, nhập số đếm thực tế vào ô bên phải mỗi sản phẩm (bấm Enter để xuống dòng dưới). Sản phẩm để trống giữ nguyên số kiểm cũ, nên đếm một phần cũng được.</p>
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div><div className="text-xs text-gray-400 mb-1">Thời điểm kiểm kho</div><input type="datetime-local" value={countAt} onChange={function(e) { setCountAt(e.target.value); }} className={inputCls} /></div>
              <div className="flex-1 min-w-[200px]"><div className="text-xs text-gray-400 mb-1">Ghi chú</div><input value={countNote} onChange={function(e) { setCountNote(e.target.value); }} placeholder="VD: Kiểm kho toàn bộ 24/10" className={inputCls + ' w-full'} /></div>
            </div>
            <details className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
              <summary className="cursor-pointer text-sm text-gray-300">⚡ Nhập nhanh bằng file Excel hoặc dán bảng</summary>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <button className={btnCls} onClick={downloadCountTemplate}>Tải file mẫu kiểm kho</button>
                <label className={btnCls + ' cursor-pointer'}>Nhập số đếm từ file Excel…<input type="file" accept=".xlsx,.xls" className="hidden" onChange={function(e) { var f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) importCountFile(f); }} /></label>
                {fileMsg && <span className="text-xs text-gray-300">{fileMsg}</span>}
              </div>
              <div className="mt-3">
                <div className="text-xs text-gray-500 mb-1">Hoặc dán bảng (Tên sản phẩm hoặc SKU lẻ + số lượng, mỗi dòng một sản phẩm):</div>
                <textarea rows={4} value={pasteText} onChange={function(e) { setPasteText(e.target.value); }} className={inputCls + ' w-full'} placeholder={'GH040-1\t120\nKeo vá tường\t45'} />
                <div className="flex items-center gap-2 mt-2"><button className={btnCls} onClick={doPaste} disabled={!pasteText.trim()}>Điền vào bảng</button>{pasteMsg && <span className="text-xs text-gray-300">{pasteMsg}</span>}</div>
              </div>
            </details>
          </div>

          <div className="sticky top-0 z-20 -mx-1 px-1 pb-3 bg-slate-950/95 backdrop-blur">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">🔍</span>
                <input value={kq} onChange={function(e) { setKq(e.target.value); }} placeholder="Tìm sản phẩm để nhập số đếm…" className="w-full pl-10 pr-9 py-2.5 bg-slate-900 border border-slate-600 focus:border-blue-500 rounded-xl text-sm text-gray-100 outline-none" />
                {kq && <button aria-label="Xóa tìm kiếm" onClick={function() { setKq(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-700 hover:bg-slate-600 text-gray-200 text-xs">×</button>}
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-300 cursor-pointer"><input type="checkbox" checked={onlyEmpty} onChange={function(e) { setOnlyEmpty(e.target.checked); }} className="w-4 h-4 accent-blue-500" />Chỉ hiện sản phẩm chưa nhập</label>
            </div>
            <div className="mt-2.5 flex items-center gap-3">
              <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-blue-500 transition-all" style={{ width: (products.length ? Math.round(filledN / products.length * 100) : 0) + '%' }}></div></div>
              <span className="text-xs text-gray-400 whitespace-nowrap">Đã nhập <b className="text-gray-100">{filledN}</b> / {products.length} sản phẩm</span>
            </div>
          </div>

          <div className="space-y-1.5">
            {kiemRows.map(function(r, idx) {
              var v = countVals[r.product] || '';
              var filled = v.trim() !== '';
              var delta = filled && r.stock !== null && isFinite(parseFloat(v.replace(',', '.'))) ? parseFloat(v.replace(',', '.')) - r.stock : null;
              return (
                <div key={r.product} className={'flex items-center gap-3 rounded-xl border px-3 py-2.5 ' + (filled ? 'bg-blue-500/10 border-blue-500/40' : 'bg-slate-900 border-slate-700')}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-100 leading-snug"><Hl text={r.product} q={kq} /></div>
                    <div className="text-[11px] text-gray-500 mt-0.5">{(skuOf[r.product] || []).slice(0, 3).join(' · ')}{r.stock !== null ? ' · tồn hiện tại ' + fmt(r.stock) : ' · chưa kiểm'}</div>
                  </div>
                  {delta !== null && delta !== 0 && <span className={'text-xs font-mono ' + (delta > 0 ? 'text-emerald-300' : 'text-red-300')}>{(delta > 0 ? '+' : '') + fmt(delta)}</span>}
                  <input data-ck={idx} inputMode="decimal" value={v} placeholder="Số đếm"
                    onChange={function(e) { var val = e.target.value; setCountVals(function(c) { return Object.assign({}, c, { [r.product]: val }); }); }}
                    onKeyDown={function(e) { if (e.key === 'Enter') { e.preventDefault(); var nx = document.querySelector('[data-ck="' + (idx + 1) + '"]') as HTMLInputElement | null; if (nx) { nx.focus(); nx.select(); } } }}
                    className="w-32 text-right text-lg font-mono px-3 py-2 bg-slate-800 border border-slate-600 focus:border-blue-500 rounded-lg text-gray-100 outline-none" />
                </div>
              );
            })}
            {kiemRows.length === 0 && <div className="p-8 text-center text-gray-500 bg-slate-900 border border-slate-700 rounded-xl">{onlyEmpty && !kq ? 'Đã nhập hết các sản phẩm.' : 'Không tìm thấy sản phẩm nào.'}</div>}
          </div>

          <div className="sticky bottom-3 z-20 mt-5 flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-slate-900/95 border border-slate-600 shadow-xl backdrop-blur">
            <span className="text-sm text-gray-300">Đã nhập <b className="text-gray-100">{filledN}</b> / {products.length} sản phẩm · kiểm lúc <b className="text-gray-100">{countAt ? fmtAt(new Date(countAt).getTime()) : '—'}</b></span>
            <span className="flex gap-2">
              {filledN > 0 && <button className={btnCls} onClick={function() { setCountVals({}); }}>Xóa số đã nhập</button>}
              <button className={btnPrimaryCls} disabled={busy || filledN === 0} onClick={saveCount}>{busy ? 'Đang lưu…' : 'Lưu kiểm kho'}</button>
            </span>
          </div>

          <div className={cardCls + ' mt-6'}>
            <h2 className="text-sm font-semibold text-gray-200 mb-2">Các lần kiểm kho đã lưu</h2>
            {sessions.length === 0 ? <div className="text-sm text-gray-500">Chưa có.</div> : (
              <div className="space-y-2">{sessions.map(function(s) {
                return <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 border-t border-slate-800 first:border-0 text-sm">
                  <span className="font-mono text-gray-100">{fmtAt(s.at)}</span><span className="px-2 py-0.5 rounded-md bg-slate-800 text-gray-300 text-xs">{SK_KHO_LABEL[s.kho]}</span>
                  <span className="text-gray-400">{s.n} sản phẩm</span><span className="text-gray-500 text-xs">{s.by}</span><span className="text-gray-500 text-xs flex-1 min-w-[6rem]">{s.note}</span>
                  <button className={btnCls} disabled={busy} onClick={function() { removeEntries({ sessions: [s.id] }, 'Xóa lần kiểm kho ' + fmtAt(s.at) + ' (' + s.n + ' sản phẩm)? Tồn sẽ quay về theo lần kiểm trước đó.'); }}>Xóa</button>
                </div>;
              })}</div>
            )}
          </div>
        </div>
      )}

      {/* ===== NHẬP HÀNG / ĐIỀU CHỈNH ===== */}
      {!loading && !err && tab === 'nhap' && isAdmin && (
        <div>
          <div className={cardCls}>
            <h2 className="text-base font-semibold text-gray-100 mb-1">Ghi nhập hàng hoặc điều chỉnh · {SK_KHO_LABEL[kho]}</h2>
            <p className="text-xs text-gray-500 mb-4">Chỉ tính các lần ghi sau thời điểm kiểm kho gần nhất của sản phẩm đó.</p>
            <div className="inline-flex p-1 rounded-xl bg-slate-800 border border-slate-700 mb-4">
              <button onClick={function() { setMvType('import'); }} className={'px-4 py-1.5 text-sm font-medium rounded-lg ' + (mvType === 'import' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-gray-200')}>📥 Nhập hàng (+)</button>
              <button onClick={function() { setMvType('adjust'); }} className={'px-4 py-1.5 text-sm font-medium rounded-lg ' + (mvType === 'adjust' ? 'bg-amber-600 text-white' : 'text-gray-400 hover:text-gray-200')}>🛠 Điều chỉnh (+ / −)</button>
            </div>
            <p className="text-xs text-gray-500 mb-3">{mvType === 'import' ? 'Hàng nhập về kho: nhập số dương.' : 'Hàng hỏng, mất, tặng, chuyển kho: nhập số âm (ví dụ −3). Kiểm thấy thừa thì nhập số dương.'}</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="lg:col-span-2">
                <div className="text-xs text-gray-400 mb-1">Sản phẩm (gõ để tìm)</div>
                <ProductPicker value={mvProduct} onChange={setMvProduct} options={products} skuOf={skuOf} placeholder="Gõ tên (không dấu cũng được) hoặc mã SKU…" className={inputCls + ' w-full pr-9'} emptyHint={'Sản phẩm phải nằm trong danh sách của ' + SK_KHO_LABEL[kho] + '; nếu đang ẩn thì thêm lại ở tab Tồn hiện tại.'} />
              </div>
              <div><div className="text-xs text-gray-400 mb-1">Số lượng</div><input inputMode="decimal" value={mvQty} onChange={function(e) { setMvQty(e.target.value); }} placeholder={mvType === 'import' ? '120' : '-3'} className={inputCls + ' w-full text-right text-lg font-mono'} /></div>
              <div><div className="text-xs text-gray-400 mb-1">Thời điểm</div><input type="datetime-local" value={mvAt} onChange={function(e) { setMvAt(e.target.value); }} className={inputCls + ' w-full'} /></div>
              <div className="sm:col-span-2 lg:col-span-3"><div className="text-xs text-gray-400 mb-1">Ghi chú</div><input value={mvNote} onChange={function(e) { setMvNote(e.target.value); }} className={inputCls + ' w-full'} placeholder="VD: nhập từ NCC, vỡ 3 cái" /></div>
              <div className="flex items-end"><button className={btnPrimaryCls + ' w-full'} disabled={busy} onClick={saveMove}>Ghi vào sổ</button></div>
            </div>
          </div>
          <div className={cardCls}>
            <h2 className="text-sm font-semibold text-gray-200 mb-2">Các lần nhập / điều chỉnh gần đây</h2>
            {(function() {
              var list = sk.moves.filter(function(m) { return m.kho === kho; }).sort(function(a, b) { return Date.parse(b.at) - Date.parse(a.at); }).slice(0, 60);
              return list.length === 0 ? <div className="text-sm text-gray-500">Chưa có.</div> : (
                <div>{list.map(function(m) {
                  return <div key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 border-t border-slate-800 first:border-0 text-sm">
                    <span className="font-mono text-gray-400 w-28 shrink-0">{fmtAt(m.at)}</span>
                    <span className="flex-1 min-w-[10rem] text-gray-100">{m.product}</span>
                    <span className={'px-2 py-0.5 rounded-md text-xs ' + (m.type === 'import' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300')}>{m.type === 'import' ? 'Nhập hàng' : 'Điều chỉnh'}</span>
                    <b className={'font-mono w-20 text-right ' + (m.qty < 0 ? 'text-red-300' : 'text-emerald-300')}>{m.qty > 0 ? '+' : ''}{fmt(m.qty)}</b>
                    <span className="text-xs text-gray-500 min-w-[6rem]">{m.by}{m.note ? ' · ' + m.note : ''}</span>
                    <button className={btnCls} disabled={busy} onClick={function() { removeEntries({ moveIds: [m.id] }, 'Xóa dòng này?'); }}>Xóa</button>
                  </div>;
                })}</div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ===== GÁN KHO ===== */}
      {!loading && !err && tab === 'gan' && isAdmin && (
        <div className={cardCls}>
          <h2 className="text-base font-semibold text-gray-100 mb-1">Gán kho cho tài khoản nhân sự kho</h2>
          <p className="text-xs text-gray-500 mb-4">Tài khoản đã gán kho thì lập phiếu xuất kho là tự ghi kho của mình, không phải chọn. Tài khoản chưa gán (và admin) có thể chọn kho khi lập phiếu.</p>
          {whUsers.length === 0 ? <div className="text-sm text-gray-500">Chưa có tài khoản vai trò Nhân sự kho (tạo ở Admin → User).</div> : (
            <div>{whUsers.map(function(u) {
              return <div key={u.id} className="flex flex-wrap items-center gap-3 py-3 border-t border-slate-800 first:border-0">
                <div className="flex-1 min-w-[10rem]"><div className="text-gray-100">{u.name}</div><div className="text-xs text-gray-500">{u.email}</div></div>
                <select value={sk.khoUsers[u.id] || ''} disabled={busy} onChange={function(e) { setUserKho(u.id, e.target.value as SkKho | ''); }} className={inputCls + (sk.khoUsers[u.id] ? '' : ' border-amber-500')}><option value="">Chưa gán</option>{SK_KHO.map(function(k) { return <option key={k} value={k}>{SK_KHO_LABEL[k]}</option>; })}</select>
              </div>;
            })}</div>
          )}
        </div>
      )}

      {toast && <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-700 border border-slate-500 text-sm text-gray-100 shadow-lg max-w-[90vw]">{toast}</div>}
    </div>
  );
}
