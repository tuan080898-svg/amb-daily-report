'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAppState } from '@/lib/store';
import { getAllProducts, getProductSkuCodes, getSkuProducts, subscribeSkuMap } from '@/lib/sku';
import { dbGetPxk, dbGetPxkArchive, dbGetSoKho, dbSoKhoAction } from '@/lib/db';
import { getCurrentStock, refreshInventory, type InventoryData } from '@/lib/inventory';
import type { PxkBatch } from '@/lib/pxk';
import {
  SK_KHO, SK_KHO_LABEL, skCalcSlips, skEmptyData, skParseCount, skProductHistory, skStock, skVisibleProducts,
  type SkData, type SkKho, type SkRow, type SkSlipCalc,
} from '@/lib/sokho';

type Tab = 'ton' | 'kiem' | 'nhap' | 'gan';
type Flt = 'tat-ca' | 'chua-kiem' | 'am' | 'phat-sinh';

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
    if (q.trim()) {
      var needle = q.trim().toLowerCase();
      var hay = (r.product + ' ' + (skuOf[r.product] || []).join(' ')).toLowerCase();
      if (hay.indexOf(needle) < 0) return false;
    }
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
    if (!mvProduct || !isFinite(qty) || qty === 0) { say('Chọn sản phẩm và nhập số lượng khác 0.'); return; }
    if (mvType === 'import' && qty < 0) { say('Nhập hàng phải là số dương. Hàng hỏng/mất thì chọn "Điều chỉnh" và nhập số âm.'); return; }
    setBusy(true);
    try {
      setSk(await dbSoKhoAction('addMove', { kho: kho, product: mvProduct, qty: qty, type: mvType, at: new Date(mvAt).toISOString(), note: mvNote, by: currentUser ? currentUser.name : '' }));
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
  var tabs: Array<[Tab, string]> = isAdmin ? [['ton', 'Tồn hiện tại'], ['kiem', 'Kiểm kho (nhập tồn thực tế)'], ['nhap', 'Nhập hàng / điều chỉnh'], ['gan', 'Gán kho cho tài khoản']] : [['ton', 'Tồn hiện tại']];
  var whUsers = users.filter(function(u) { return u.role === 'warehouse'; });

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Sổ kho thực tế</h1>
          <p className="text-sm text-gray-500 mt-1">Nhập số hàng đếm thực tế tại một thời điểm, sau đó các phiếu xuất kho tự trừ vào kho. Mỗi đơn chỉ trừ một lần, lập lại phiếu không trừ thêm.</p>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Kho</div>
          {!isAdmin && myKho ? <div className={inputCls + ' text-emerald-300'}>{SK_KHO_LABEL[myKho]}</div> : (
            <div className="flex gap-1">{SK_KHO.map(function(k) {
              return <button key={k} onClick={function() { setKhoPick(k); }} className={'px-3 py-2 text-sm rounded-lg border ' + (kho === k ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-600 text-gray-300 hover:bg-slate-700')}>{SK_KHO_LABEL[k]}</button>;
            })}</div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-700 mb-4" role="tablist">
        {tabs.map(function(t) {
          return <button key={t[0]} role="tab" aria-selected={tab === t[0]} onClick={function() { setTab(t[0]); }}
            className={'px-4 py-2 text-sm rounded-t-lg ' + (tab === t[0] ? 'bg-slate-800 text-white border border-slate-700 border-b-slate-800 -mb-px' : 'text-gray-400 hover:text-gray-200')}>{t[1]}</button>;
        })}
      </div>

      {err && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">Không tải được dữ liệu sổ kho: {err}</div>}
      {loading && !err && <div className="p-6 text-gray-400 text-sm">Đang tải…</div>}

      {!loading && !err && tab === 'ton' && (
        <div>
          {!isAdmin && !myKho && <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">Tài khoản của bạn chưa được gán kho. Nhờ admin gán ở Sổ kho → Gán kho cho tài khoản; trong lúc chờ bạn xem được cả hai kho.</div>}
          {!lastCount && <div className="mb-3 p-3 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sm text-sky-200">{SK_KHO_LABEL[kho]} chưa có số kiểm kho nào. Admin vào tab “Kiểm kho” nhập số thực tế, từ đó phiếu xuất kho mới bắt đầu trừ.</div>}
          {lastCount && <div className="mb-3 text-sm text-gray-400">Kiểm kho gần nhất: <b className="text-gray-200">{fmtAt(lastCount.at)}</b> ({lastCount.n} sản phẩm, {lastCount.by || 'không rõ người'}). Phiếu lập sau thời điểm này mới trừ kho.</div>}
          {calc.noKho.length > 0 && <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-200">{calc.noKho.length} phiếu lập sau lần kiểm kho nhưng KHÔNG ghi kho nên chưa trừ được (phiếu lập trước khi có tính năng chọn kho): {calc.noKho.slice(0, 8).map(function(n) { return n.id + ' (' + n.orders + ' đơn)'; }).join(', ')}{calc.noKho.length > 8 ? ' và ' + (calc.noKho.length - 8) + ' phiếu khác' : ''}.</div>}
          {calc.unmapped.length > 0 && (
            <details className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">
              <summary className="cursor-pointer">{calc.unmapped.length} loại hàng trong phiếu chưa quy ra được sản phẩm nên CHƯA trừ kho (bấm để xem)</summary>
              <ul className="mt-2 list-disc pl-5 text-xs">{calc.unmapped.slice(0, 40).map(function(u) { return <li key={u.key}>{u.key.indexOf('sku:') === 0 ? 'SKU ' : 'Chưa có SKU: '}{u.label} — {fmt(u.qty)} cái (phiếu {u.batches.join(', ')})</li>; })}</ul>
              <div className="text-xs mt-1">Sửa bảng quy đổi SKU (hoặc gắn SKU cho dòng chưa có SKU), phiếu cũ sẽ tự tính lại.</div>
            </details>
          )}
          {calc.dupOrders > 0 && <div className="mb-3 text-xs text-gray-500">Đã bỏ qua {calc.dupOrders} đơn lặp trong các phiếu (không trừ lần hai).</div>}

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input value={q} onChange={function(e) { setQ(e.target.value); }} placeholder="Tìm sản phẩm hoặc mã SKU…" className={inputCls + ' w-64'} />
            {([['tat-ca', 'Tất cả', rows.length], ['chua-kiem', 'Chưa kiểm kho', nChua], ['am', 'Tồn âm', nAm], ['phat-sinh', 'Có phát sinh', rows.filter(function(r) { return r.slipQty !== 0 || r.moveQty !== 0; }).length]] as Array<[Flt, string, number]>).map(function(c) {
              return <button key={c[0]} onClick={function() { setFlt(c[0]); }} aria-pressed={flt === c[0]} className={'px-3 py-1 rounded-full text-xs border ' + (flt === c[0] ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-600 text-gray-300 hover:bg-slate-700')}>{c[1]} <b>{c[2]}</b></button>;
            })}
            <span className="ml-auto flex gap-2">
              {isAdmin && <button className={btnCls} onClick={function() { setAddOpen(!addOpen); }}>＋ Thêm sản phẩm</button>}
              <button className={btnCls} onClick={exportExcel}>Tải Excel</button>
            </span>
          </div>
          {isAdmin && addOpen && (
            <div className={cardCls + ' !p-3'}>
              <div className="text-xs text-gray-500 mb-2">Chọn sản phẩm đã ẩn hoặc trong bảng quy đổi SKU để hiện lại, hoặc gõ tên mới (vật tư, bao bì… ngoài bảng quy đổi: tự nhập kiểm kho và nhập/điều chỉnh, phiếu xuất kho chưa tự trừ).</div>
              <div className="flex flex-wrap gap-2">
                <input list="sk-add-list" value={addName} onChange={function(e) { setAddName(e.target.value); }} placeholder="Tên sản phẩm" className={inputCls + ' w-72'} />
                <datalist id="sk-add-list">{allProducts.concat(sk.hidden[kho] || []).filter(function(p, i, a) { return a.indexOf(p) === i && products.indexOf(p) < 0; }).map(function(p) { return <option key={p} value={p} />; })}</datalist>
                <button className={btnPrimaryCls + ' !py-1.5'} disabled={busy} onClick={addProduct}>Thêm vào {SK_KHO_LABEL[kho]}</button>
                <button className={btnCls} onClick={function() { setAddOpen(false); }}>Đóng</button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto bg-slate-900 border border-slate-700 rounded-xl">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-400 border-b border-slate-700">
                <th className="p-2 text-left">Sản phẩm</th><th className="p-2 text-right">Số kiểm kho</th><th className="p-2 text-right">Nhập / điều chỉnh</th><th className="p-2 text-right">Xuất theo phiếu</th><th className="p-2 text-right">Tồn hiện tại</th>{inv && <th className="p-2 text-right" title="Số trong trang Kho (đồng bộ từ Sapo)">Tồn Sapo/app</th>}{inv && <th className="p-2 text-right">Lệch</th>}{isAdmin && <th className="p-2"></th>}
              </tr></thead>
              <tbody>
                {shown.map(function(r) {
                  var app = inv ? getCurrentStock(inv, r.product, kho) : null;
                  var diff = r.stock !== null && app !== null ? r.stock - app : null;
                  var isOpen = open === r.product;
                  var hist = isOpen ? skProductHistory(sk, calc, kho, r.product) : [];
                  return [
                    <tr key={r.product} className="border-t border-slate-800 cursor-pointer hover:bg-slate-800/50" onClick={function() { setOpen(isOpen ? '' : r.product); }}>
                      <td className="p-2"><div className="text-gray-100">{r.product}</div><div className="text-xs text-gray-500">{(skuOf[r.product] || []).slice(0, 4).join(' · ')}</div></td>
                      <td className="p-2 text-right font-mono">{r.anchor ? <>{fmt(r.anchor.qty)}<div className="text-xs text-gray-500">{fmtAt(r.anchor.at)}</div></> : <span className="text-gray-600">chưa kiểm</span>}</td>
                      <td className="p-2 text-right font-mono">{r.moveQty ? (r.moveQty > 0 ? '+' : '') + fmt(r.moveQty) : '—'}</td>
                      <td className="p-2 text-right font-mono">{r.slipQty ? '−' + fmt(r.slipQty) : '—'}</td>
                      <td className={'p-2 text-right font-mono font-semibold ' + (r.stock === null ? 'text-gray-600' : r.stock < 0 ? 'text-red-300' : 'text-emerald-300')}>{r.stock === null ? '—' : fmt(r.stock)}</td>
                      {inv && <td className="p-2 text-right font-mono text-gray-400">{app === null ? '—' : fmt(app)}</td>}
                      {inv && <td className={'p-2 text-right font-mono ' + (diff === null || diff === 0 ? 'text-gray-600' : 'text-amber-300')}>{diff === null ? '—' : diff === 0 ? '0' : (diff > 0 ? '+' : '') + fmt(diff)}</td>}
                      {isAdmin && <td className="p-2 text-right"><button title="Bỏ khỏi danh sách" aria-label="Bỏ khỏi danh sách" disabled={busy} className="text-gray-600 hover:text-red-400 px-2" onClick={function(e) { e.stopPropagation(); removeProduct(r); }}>×</button></td>}
                    </tr>,
                    isOpen && <tr key={r.product + '-h'} className="bg-slate-950/60"><td colSpan={(inv ? 7 : 5) + (isAdmin ? 1 : 0)} className="p-3">
                      {hist.length === 0 ? <div className="text-xs text-gray-500">Chưa có biến động nào cho sản phẩm này ở {SK_KHO_LABEL[kho]}.</div> : (
                        <ul className="text-xs space-y-0.5">{hist.map(function(h, i) {
                          return <li key={i} className={h.counted ? 'text-gray-200' : 'text-gray-600 line-through'}><span className="font-mono">{fmtAt(h.at)}</span> · {h.label} · <b className={h.qty < 0 ? 'text-red-300' : 'text-emerald-300'}>{h.kind === 'kiem' ? '= ' + fmt(h.qty) : (h.qty > 0 ? '+' : '') + fmt(h.qty)}</b>{!h.counted && ' (trước lần kiểm kho gần nhất, không tính)'}</li>;
                        })}</ul>
                      )}
                    </td></tr>,
                  ];
                })}
                {shown.length === 0 && <tr><td colSpan={8} className="p-4 text-gray-500">Không có sản phẩm nào.</td></tr>}
              </tbody>
            </table>
          </div>
          {isAdmin && hiddenRows.length > 0 && (
            <details className="mt-4 p-3 rounded-lg bg-slate-900 border border-slate-700">
              <summary className="cursor-pointer text-sm text-gray-300">Đã ẩn khỏi danh sách {SK_KHO_LABEL[kho]} ({hiddenRows.length})</summary>
              <ul className="mt-2 text-sm">{hiddenRows.map(function(r) {
                return <li key={r.product} className="flex items-center gap-3 py-1 border-t border-slate-800"><span className="flex-1 text-gray-300">{r.product}{(r.slipQty !== 0 || r.anchor) && <span className="ml-2 text-xs text-gray-500">{r.anchor ? 'có số kiểm kho' : ''}{r.slipQty !== 0 ? ' · đã xuất theo phiếu ' + fmt(r.slipQty) : ''}</span>}</span><button className={btnCls} disabled={busy} onClick={function() { restoreProduct(r.product); }}>Hiện lại</button></li>;
              })}</ul>
            </details>
          )}
        </div>
      )}

      {!loading && !err && tab === 'kiem' && isAdmin && (
        <div>
          <div className={cardCls}>
            <h2 className="text-sm font-semibold text-gray-200 mb-1">Kiểm kho {SK_KHO_LABEL[kho]}: nhập số đếm thực tế</h2>
            <p className="text-xs text-gray-500 mb-3">Chọn đúng thời điểm đếm kho (ví dụ 24/10 lúc 9:00). Phiếu xuất kho lập TRƯỚC thời điểm này không trừ (hàng đã có trong số đếm); phiếu lập SAU sẽ tự trừ. Sản phẩm để trống giữ nguyên số kiểm cũ, nên đếm một phần cũng được.</p>
            <div className="flex flex-wrap items-end gap-3 mb-3">
              <div><div className="text-xs text-gray-400 mb-1">Thời điểm kiểm kho</div><input type="datetime-local" value={countAt} onChange={function(e) { setCountAt(e.target.value); }} className={inputCls} /></div>
              <div className="flex-1 min-w-[200px]"><div className="text-xs text-gray-400 mb-1">Ghi chú</div><input value={countNote} onChange={function(e) { setCountNote(e.target.value); }} placeholder="VD: Kiểm kho toàn bộ 24/10" className={inputCls + ' w-full'} /></div>
            </div>
            <details className="mb-3">
              <summary className="cursor-pointer text-sm text-gray-300">Dán bảng từ Excel (Tên sản phẩm hoặc SKU lẻ + số lượng)</summary>
              <textarea rows={5} value={pasteText} onChange={function(e) { setPasteText(e.target.value); }} className={inputCls + ' w-full mt-2'} placeholder={'GH040-1\t120\nKeo vá tường\t45'} />
              <div className="flex items-center gap-2 mt-2"><button className={btnCls} onClick={doPaste} disabled={!pasteText.trim()}>Điền vào bảng</button>{pasteMsg && <span className="text-xs text-gray-300">{pasteMsg}</span>}</div>
            </details>
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto border border-slate-700 rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-800"><tr className="text-xs text-gray-400"><th className="p-2 text-left">Sản phẩm</th><th className="p-2 text-right">Tồn hiện tại</th><th className="p-2 text-right w-36">Số đếm thực tế</th></tr></thead>
                <tbody>
                  {rows.map(function(r) {
                    return (
                      <tr key={r.product} className="border-t border-slate-800">
                        <td className="p-2"><div className="text-gray-100">{r.product}</div><div className="text-xs text-gray-500">{(skuOf[r.product] || []).slice(0, 4).join(' · ')}</div></td>
                        <td className="p-2 text-right font-mono text-gray-400">{r.stock === null ? '—' : fmt(r.stock)}</td>
                        <td className="p-2 text-right"><input inputMode="decimal" value={countVals[r.product] || ''} onChange={function(e) { var v = e.target.value; setCountVals(function(c) { return Object.assign({}, c, { [r.product]: v }); }); }} className={inputCls + ' w-28 text-right !py-1'} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-gray-500">Đã điền {products.filter(function(p) { return (countVals[p] || '').trim() !== ''; }).length} / {products.length} sản phẩm</span>
              <button className={btnPrimaryCls} disabled={busy} onClick={saveCount}>{busy ? 'Đang lưu…' : 'Lưu kiểm kho'}</button>
            </div>
          </div>
          <div className={cardCls}>
            <h2 className="text-sm font-semibold text-gray-200 mb-2">Các lần kiểm kho đã lưu</h2>
            {sessions.length === 0 ? <div className="text-sm text-gray-500">Chưa có.</div> : (
              <table className="w-full text-sm"><thead><tr className="text-xs text-gray-400"><th className="p-2 text-left">Thời điểm kiểm</th><th className="p-2 text-left">Kho</th><th className="p-2 text-right">Số sản phẩm</th><th className="p-2 text-left">Người nhập</th><th className="p-2 text-left">Ghi chú</th><th></th></tr></thead>
                <tbody>{sessions.map(function(s) {
                  return <tr key={s.id} className="border-t border-slate-800"><td className="p-2 font-mono">{fmtAt(s.at)}</td><td className="p-2">{SK_KHO_LABEL[s.kho]}</td><td className="p-2 text-right">{s.n}</td><td className="p-2 text-gray-400">{s.by}</td><td className="p-2 text-xs text-gray-500">{s.note}</td>
                    <td className="p-2 text-right"><button className={btnCls} disabled={busy} onClick={function() { removeEntries({ sessions: [s.id] }, 'Xóa lần kiểm kho ' + fmtAt(s.at) + ' (' + s.n + ' sản phẩm)? Tồn sẽ quay về theo lần kiểm trước đó.'); }}>Xóa</button></td></tr>;
                })}</tbody></table>
            )}
          </div>
        </div>
      )}

      {!loading && !err && tab === 'nhap' && isAdmin && (
        <div>
          <div className={cardCls}>
            <h2 className="text-sm font-semibold text-gray-200 mb-1">Nhập hàng hoặc điều chỉnh {SK_KHO_LABEL[kho]}</h2>
            <p className="text-xs text-gray-500 mb-3">Hàng nhập về kho thì chọn “Nhập hàng”. Hàng hỏng, mất, tặng, chuyển kho thì chọn “Điều chỉnh” và nhập số âm. Chỉ tính các lần ghi sau thời điểm kiểm kho gần nhất của sản phẩm đó.</p>
            <div className="flex flex-wrap items-end gap-3">
              <div><div className="text-xs text-gray-400 mb-1">Sản phẩm</div><select value={mvProduct} onChange={function(e) { setMvProduct(e.target.value); }} className={inputCls + ' w-64'}><option value="">Chọn sản phẩm…</option>{products.map(function(p) { return <option key={p} value={p}>{p}</option>; })}</select></div>
              <div><div className="text-xs text-gray-400 mb-1">Loại</div><select value={mvType} onChange={function(e) { setMvType(e.target.value as 'import' | 'adjust'); }} className={inputCls}><option value="import">Nhập hàng (+)</option><option value="adjust">Điều chỉnh (+ hoặc −)</option></select></div>
              <div><div className="text-xs text-gray-400 mb-1">Số lượng</div><input inputMode="decimal" value={mvQty} onChange={function(e) { setMvQty(e.target.value); }} className={inputCls + ' w-28 text-right'} /></div>
              <div><div className="text-xs text-gray-400 mb-1">Thời điểm</div><input type="datetime-local" value={mvAt} onChange={function(e) { setMvAt(e.target.value); }} className={inputCls} /></div>
              <div className="flex-1 min-w-[180px]"><div className="text-xs text-gray-400 mb-1">Ghi chú</div><input value={mvNote} onChange={function(e) { setMvNote(e.target.value); }} className={inputCls + ' w-full'} placeholder="VD: nhập từ NCC, vỡ 3 cái" /></div>
              <button className={btnPrimaryCls} disabled={busy} onClick={saveMove}>Ghi</button>
            </div>
          </div>
          <div className={cardCls}>
            <h2 className="text-sm font-semibold text-gray-200 mb-2">Các lần nhập / điều chỉnh gần đây ({SK_KHO_LABEL[kho]})</h2>
            {(function() {
              var list = sk.moves.filter(function(m) { return m.kho === kho; }).sort(function(a, b) { return Date.parse(b.at) - Date.parse(a.at); }).slice(0, 60);
              return list.length === 0 ? <div className="text-sm text-gray-500">Chưa có.</div> : (
                <table className="w-full text-sm"><thead><tr className="text-xs text-gray-400"><th className="p-2 text-left">Thời điểm</th><th className="p-2 text-left">Sản phẩm</th><th className="p-2 text-left">Loại</th><th className="p-2 text-right">SL</th><th className="p-2 text-left">Người ghi</th><th className="p-2 text-left">Ghi chú</th><th></th></tr></thead>
                  <tbody>{list.map(function(m) {
                    return <tr key={m.id} className="border-t border-slate-800"><td className="p-2 font-mono">{fmtAt(m.at)}</td><td className="p-2">{m.product}</td><td className="p-2">{m.type === 'import' ? 'Nhập hàng' : 'Điều chỉnh'}</td><td className={'p-2 text-right font-mono ' + (m.qty < 0 ? 'text-red-300' : 'text-emerald-300')}>{m.qty > 0 ? '+' : ''}{fmt(m.qty)}</td><td className="p-2 text-gray-400">{m.by}</td><td className="p-2 text-xs text-gray-500">{m.note}</td>
                      <td className="p-2 text-right"><button className={btnCls} disabled={busy} onClick={function() { removeEntries({ moveIds: [m.id] }, 'Xóa dòng này?'); }}>Xóa</button></td></tr>;
                  })}</tbody></table>
              );
            })()}
          </div>
        </div>
      )}

      {!loading && !err && tab === 'gan' && isAdmin && (
        <div className={cardCls}>
          <h2 className="text-sm font-semibold text-gray-200 mb-1">Gán kho cho tài khoản nhân sự kho</h2>
          <p className="text-xs text-gray-500 mb-3">Tài khoản đã gán kho thì lập phiếu xuất kho là tự trừ kho của mình, không phải chọn. Tài khoản chưa gán (và admin) phải chọn kho mỗi lần lập phiếu.</p>
          {whUsers.length === 0 ? <div className="text-sm text-gray-500">Chưa có tài khoản vai trò Nhân sự kho (tạo ở Admin → User).</div> : (
            <table className="w-full text-sm"><thead><tr className="text-xs text-gray-400"><th className="p-2 text-left">Tài khoản</th><th className="p-2 text-left">Email</th><th className="p-2 text-left">Kho</th></tr></thead>
              <tbody>{whUsers.map(function(u) {
                return <tr key={u.id} className="border-t border-slate-800"><td className="p-2 text-gray-100">{u.name}</td><td className="p-2 text-xs text-gray-500">{u.email}</td>
                  <td className="p-2"><select value={sk.khoUsers[u.id] || ''} disabled={busy} onChange={function(e) { setUserKho(u.id, e.target.value as SkKho | ''); }} className={inputCls + (sk.khoUsers[u.id] ? '' : ' border-amber-500')}><option value="">Chưa gán</option>{SK_KHO.map(function(k) { return <option key={k} value={k}>{SK_KHO_LABEL[k]}</option>; })}</select></td></tr>;
              })}</tbody></table>
          )}
        </div>
      )}

      {toast && <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-slate-700 border border-slate-500 text-sm text-gray-100 shadow-lg max-w-[90vw]">{toast}</div>}
    </div>
  );
}
