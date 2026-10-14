'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useAppState } from '@/lib/store';
import { getAllSkuCodes, subscribeSkuMap } from '@/lib/sku';
import { refreshInventory, addPxkTransactions, WAREHOUSES, WAREHOUSE_LABELS, type Warehouse } from '@/lib/inventory';
import { dbGetPxk, dbUpdatePxk } from '@/lib/db';
import { learnShopeeFromRowSets } from '@/lib/pxk-learn';
import * as XLSX from 'xlsx';
import {
  parsePxkFile, summarizePxk, buildPxkHtml, pxkNameKey, PXK_PLATFORM_LABELS,
  type PxkPlatform, type PxkOrder, type PxkBatch, type PxkData, type PxkItem,
} from '@/lib/pxk';

function todayStr(): string {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function fmtDate(d: string): string {
  var p = d.split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : d;
}

function makeBatchId(): string {
  var d = new Date();
  var ymd = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  return 'PX' + ymd + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export default function PhieuXuatKhoPage() {
  const { currentUser } = useAppState();
  const [platform, setPlatform] = useState<PxkPlatform>('tiktok');
  const [wh, setWh] = useState<Warehouse>('HCM');
  const [printDate, setPrintDate] = useState(todayStr());
  const [orders, setOrders] = useState<PxkOrder[]>([]);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [data, setData] = useState<PxkData>({ names: {}, batches: [] });
  const [dataErr, setDataErr] = useState('');
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [includeOld, setIncludeOld] = useState(false);
  const [showOrders, setShowOrders] = useState(true);
  const [skuVer, setSkuVer] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const learnRef = useRef<HTMLInputElement>(null);
  const [learning, setLearning] = useState(false);
  const [learnMsg, setLearnMsg] = useState('');

  useEffect(function() {
    dbGetPxk().then(setData).catch(function(e) { setDataErr(e instanceof Error ? e.message : String(e)); });
    return subscribeSkuMap(function() { setSkuVer(function(v) { return v + 1; }); });
  }, []);

  const skuCodes = useMemo(function() { return getAllSkuCodes(); }, [skuVer]);

  // Đơn đã có trong các phiếu trước (cùng sàn) hoặc bị lặp trong lần tải này
  const knownIds = useMemo(function() {
    var s = new Set<string>();
    // Chỉ các phiếu đã trừ kho mới khoá đơn lại; phiếu "chỉ in" không ngăn việc lập phiếu trừ kho sau đó
    data.batches.forEach(function(b) { if (b.platform === platform && b.deducted) b.orders.forEach(function(o) { s.add(o.orderId); }); });
    return s;
  }, [data, platform]);

  const analysis = useMemo(function() {
    var seen = new Set<string>();
    var fresh: PxkOrder[] = [];
    var old: PxkOrder[] = [];
    var dupInUpload = 0;
    var noId: PxkOrder[] = [];
    orders.forEach(function(o) {
      if (!o.orderId) { noId.push(o); return; }
      if (seen.has(o.orderId)) { dupInUpload++; return; }
      seen.add(o.orderId);
      (knownIds.has(o.orderId) ? old : fresh).push(o);
    });
    return { fresh: fresh, old: old, dupInUpload: dupInUpload, noId: noId };
  }, [orders, knownIds]);

  const used = useMemo(function() {
    return analysis.fresh.concat(includeOld ? analysis.old : []);
  }, [analysis, includeOld]);

  // Gắn SKU cho dòng Shopee từ từ điển đã học + lựa chọn của nhân sự
  const resolved = useMemo(function() {
    return used.map(function(o) {
      var items: PxkItem[] = o.items.map(function(it) {
        if (it.sku) return it;
        var key = pxkNameKey(it.name);
        var sku = assign[key] || data.names[key] || '';
        return sku ? { sku: sku, name: it.name, qty: it.qty } : it;
      });
      return { orderId: o.orderId, items: items };
    });
  }, [used, assign, data.names]);

  const summary = useMemo(function() { return summarizePxk(resolved); }, [resolved, skuVer]);
  const badLabels = useMemo(function() { return used.filter(function(o) { return !o.ok; }); }, [used]);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(''); setNotice(''); setParsing(true);
    try {
      var all: PxkOrder[] = [];
      var names: string[] = [];
      for (var i = 0; i < files.length; i++) {
        var list = await parsePxkFile(files[i], platform);
        all = all.concat(list);
        names.push(files[i].name + ' (' + list.length + ' nhãn)');
      }
      setOrders(all); setFileNames(names); setAssign({}); setIncludeOld(false);
      if (all.length === 0) setError('Không đọc được nhãn nào. Kiểm tra lại: đã chọn đúng sàn chưa, file có phải PDF in đơn của sàn không?');
    } catch (e) {
      setError('Không đọc được file PDF: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function onLearnFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setLearning(true); setLearnMsg(''); setError('');
    try {
      var sets: Array<Array<Record<string, unknown>>> = [];
      for (var i = 0; i < files.length; i++) {
        var wb = XLSX.read(await files[i].arrayBuffer(), { type: 'array' });
        sets.push(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as Record<string, unknown>[]);
      }
      var res = await learnShopeeFromRowSets(sets);
      if (res.keys === 0) {
        setLearnMsg('Không thấy cột "Tên sản phẩm", "Tên phân loại hàng", "SKU phân loại hàng" trong file. Hãy chọn file đơn hàng Shopee (xuất từ Seller Center).');
      } else {
        setData(res.data);
        setLearnMsg('Đã học từ ' + res.lines + ' dòng đơn: ' + res.keys + ' sản phẩm/phân loại, ' + res.added + ' cái mới gắn SKU.' + (res.ambiguous > 0 ? ' ' + res.ambiguous + ' cái ghi nhiều SKU khác nhau — nhân sự sẽ chọn khi lập phiếu.' : ''));
      }
    } catch (e) {
      setError('Không học được từ file đơn: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLearning(false);
      if (learnRef.current) learnRef.current.value = '';
    }
  }

  function reset() { setOrders([]); setFileNames([]); setAssign({}); setError(''); setNotice(''); setIncludeOld(false); }

  function openPrint(html: string, w: Window | null) {
    if (!w) { setError('Trình duyệt chặn cửa sổ in. Hãy cho phép cửa sổ bật lên (pop-up) cho trang này rồi bấm "In lại" ở mục Lịch sử.'); return; }
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    setTimeout(function() { try { w.print(); } catch { /* người dùng tự in */ } }, 500);
  }

  async function createSlip(deduct: boolean) {
    setError(''); setNotice('');
    if (resolved.length === 0) { setError('Chưa có đơn mới nào để lập phiếu.'); return; }
    var noSku = summary.unresolved.reduce(function(s, u) { return s + u.qty; }, 0);
    var lines = [
      (deduct ? 'LẬP PHIẾU VÀ TRỪ KHO ' : 'CHỈ IN PHIẾU (không trừ kho) ') + WAREHOUSE_LABELS[wh] + ' — ' + PXK_PLATFORM_LABELS[platform],
      resolved.length + ' đơn, ' + summary.totalQty + ' sản phẩm, ngày ' + fmtDate(printDate),
    ];
    if (noSku > 0) lines.push('⚠ ' + noSku + ' sản phẩm chưa có SKU: vẫn in lên phiếu nhưng KHÔNG được trừ kho.');
    if (summary.unmappedSkus.length > 0) lines.push('⚠ SKU chưa có trong bảng quy đổi (không trừ kho): ' + summary.unmappedSkus.join(', '));
    if (badLabels.length > 0) lines.push('⚠ ' + badLabels.length + ' nhãn đọc chưa chắc chắn, nên kiểm tra lại.');
    if (includeOld && analysis.old.length > 0) lines.push('⚠ Có ' + analysis.old.length + ' đơn đã lập phiếu trước đó — chúng sẽ bị trừ kho LẠI.');
    lines.push('', 'Tiếp tục?');
    if (!window.confirm(lines.join('\n'))) return;

    var w = window.open('', '_blank');
    setBusy(true);
    try {
      var batch: PxkBatch = {
        id: makeBatchId(), platform: platform, warehouse: wh, printDate: printDate,
        createdAt: new Date().toISOString(), createdBy: currentUser ? currentUser.name : '', deducted: deduct,
        orders: resolved,
      };
      var msg = '';
      if (deduct) {
        var inv = await refreshInventory();
        var res = addPxkTransactions(inv, summary.productLines.map(function(p) { return { product: p.product, quantity: p.qty }; }), printDate, PXK_PLATFORM_LABELS[platform] + ' ' + batch.id, wh);
        var done = res.plan.deduct.reduce(function(s, x) { return s + x.quantity; }, 0);
        msg = 'Đã trừ kho ' + WAREHOUSE_LABELS[wh] + ': ' + done + ' sản phẩm gốc (' + res.plan.deduct.length + ' mặt hàng).';
        if (res.plan.noConfig.length > 0) msg += ' Chưa cài tồn đầu nên không trừ: ' + Array.from(new Set(res.plan.noConfig)).join(', ') + '.';
        if (res.plan.beforeBaseline.length > 0) msg += ' Ngày in nằm trước mốc chốt tồn nên không trừ: ' + Array.from(new Set(res.plan.beforeBaseline)).join(', ') + '.';
      } else {
        msg = 'Đã lập phiếu, không trừ kho.';
      }
      try {
        var learned: Record<string, string> = {};
        Object.keys(assign).forEach(function(k) { if (assign[k]) learned[k] = assign[k]; });
        var next = await dbUpdatePxk(function(cur) {
          var amb = Object.assign({}, cur.ambiguous || {});
          Object.keys(learned).forEach(function(k) { delete amb[k]; });
          return { names: Object.assign({}, cur.names, learned), ambiguous: amb, batches: cur.batches.concat([batch]) };
        });
        setData(next);
      } catch (e) {
        msg += ' ⚠ Chưa lưu được lịch sử phiếu (' + (e instanceof Error ? e.message : String(e)) + ') — KHÔNG tải lại file này để tránh trừ kho hai lần.';
      }
      setNotice(msg);
      openPrint(buildPxkHtml(batch, { showOrders: showOrders }), w);
      setOrders([]); setFileNames([]); setAssign({});
    } catch (e) {
      if (w) w.close();
      setError('Lỗi: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  function reprint(b: PxkBatch) {
    var w = window.open('', '_blank');
    openPrint(buildPxkHtml(b, { showOrders: showOrders }), w);
  }

  var inputCls = 'px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none';

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-100">Phiếu xuất kho</h1>
        <p className="text-sm text-gray-500 mt-1">Tải file PDF in đơn của Shopee / TikTok → app tổng hợp sản phẩm để kho nhặt hàng, in phiếu và trừ kho.</p>
      </div>

      {platform === 'shopee' && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 mb-4">
          <div className="text-sm font-semibold text-gray-200 mb-1">Quy luật gắn SKU cho nhãn Shopee</div>
          <p className="text-xs text-gray-400 mb-3">
            Nhãn Shopee không in SKU. App học từ <b>file đơn hàng Shopee</b> (cột Tên sản phẩm + Tên phân loại → SKU phân loại hàng) để tự gắn SKU cho nhãn.
            Mỗi shop đặt tên sản phẩm khác nhau nên cần nạp file đơn của <b>từng shop</b> một lần; file đơn tải ở mục Nhập báo cáo cũng được học tự động.
            Hiện app đã biết <b className="text-gray-200">{Object.keys(data.names).length}</b> sản phẩm/phân loại{Object.keys(data.ambiguous || {}).length > 0 ? ', ' + Object.keys(data.ambiguous || {}).length + ' cái còn mơ hồ' : ''}.
          </p>
          <input ref={learnRef} type="file" accept=".xlsx,.xls,.csv" multiple className="hidden" onChange={function(e) { onLearnFiles(e.target.files); }} />
          <button onClick={function() { learnRef.current?.click(); }} disabled={learning}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-white text-sm font-medium rounded-lg">
            {learning ? 'Đang học...' : '📥 Nạp file đơn hàng Shopee để học SKU'}
          </button>
          {learnMsg && <div className="mt-3 text-sm text-emerald-300">{learnMsg}</div>}
        </div>
      )}

      {dataErr && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">Không đọc được lịch sử phiếu: {dataErr}. Chưa nên lập phiếu mới (có thể trùng đơn cũ).</div>}

      <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 mb-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <div className="text-xs text-gray-400 mb-1.5">Sàn</div>
            <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
              {(['tiktok', 'shopee'] as PxkPlatform[]).map(function(p) {
                return <button key={p} disabled={orders.length > 0} onClick={function() { setPlatform(p); }}
                  className={'px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-60 ' + (platform === p ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200')}>{PXK_PLATFORM_LABELS[p]}</button>;
              })}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1.5">Kho xuất</div>
            <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
              {WAREHOUSES.map(function(w) {
                return <button key={w} onClick={function() { setWh(w); }}
                  className={'px-3 py-1.5 rounded-md text-sm font-medium ' + (wh === w ? (w === 'HCM' ? 'bg-blue-600 text-white' : 'bg-violet-600 text-white') : 'text-gray-400 hover:text-gray-200')}>{WAREHOUSE_LABELS[w]}</button>;
              })}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1.5">Ngày in phiếu</div>
            <input type="date" value={printDate} onChange={function(e) { setPrintDate(e.target.value); }} className={inputCls} />
          </div>
          <div className="flex-1 min-w-[220px]">
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={function(e) { onFiles(e.target.files); }} />
            <button onClick={function() { fileRef.current?.click(); }} disabled={parsing || busy}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-medium rounded-lg">
              {parsing ? 'Đang đọc PDF...' : '📄 Chọn file PDF in đơn ' + PXK_PLATFORM_LABELS[platform]}
            </button>
            {orders.length > 0 && <button onClick={reset} className="ml-2 px-3 py-2 text-sm text-gray-400 hover:text-gray-200">Làm lại</button>}
          </div>
        </div>
        {fileNames.length > 0 && <div className="mt-3 text-xs text-gray-400">{fileNames.join(' · ')}</div>}
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300 whitespace-pre-wrap">{error}</div>}
      {notice && <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-300">{notice}</div>}

      {orders.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Stat label="Đơn mới" value={String(analysis.fresh.length)} />
            <Stat label="Tổng sản phẩm" value={String(summary.totalQty)} />
            <Stat label="Mã SKU" value={String(summary.skuLines.length + summary.unresolved.length)} />
            <Stat label="Đơn đã lập phiếu trước" value={String(analysis.old.length)} warn={analysis.old.length > 0} />
          </div>

          {(analysis.old.length > 0 || analysis.dupInUpload > 0 || analysis.noId.length > 0) && (
            <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200 space-y-1">
              {analysis.old.length > 0 && (
                <div>{analysis.old.length} đơn đã có trong phiếu trước đó nên được bỏ qua (tránh trừ kho hai lần).{' '}
                  <label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={includeOld} onChange={function(e) { setIncludeOld(e.target.checked); }} /> vẫn lập lại cả các đơn này</label>
                </div>
              )}
              {analysis.dupInUpload > 0 && <div>{analysis.dupInUpload} nhãn bị lặp mã đơn trong file vừa tải — chỉ tính một lần.</div>}
              {analysis.noId.length > 0 && <div>{analysis.noId.length} nhãn không đọc được mã đơn — bỏ qua, hãy kiểm tra tay (trang {analysis.noId.map(function(o) { return o.pages.join('-'); }).join(', ')}).</div>}
            </div>
          )}

          {badLabels.length > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">
              {badLabels.length} nhãn đọc chưa chắc chắn (số lượng không khớp tổng trên nhãn hoặc thiếu SKU). Kiểm tra tay các mã đơn:{' '}
              {badLabels.slice(0, 10).map(function(o) { return o.orderId || ('trang ' + o.pages.join('-')); }).join(', ')}{badLabels.length > 10 ? '...' : ''}
            </div>
          )}

          {summary.unresolved.length > 0 && (
            <div className="mb-4 bg-slate-900 border border-amber-500/40 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700 text-sm text-amber-200">
                Nhãn Shopee không có mã SKU — chọn SKU cho {summary.unresolved.length} sản phẩm dưới đây (app nhớ cho lần sau). Dòng chưa chọn vẫn lên phiếu theo tên nhưng không trừ kho.
              </div>
              <datalist id="pxk-skus">{skuCodes.map(function(c) { return <option key={c} value={c} />; })}</datalist>
              <div className="divide-y divide-slate-800">
                {summary.unresolved.map(function(u) {
                  var v = assign[u.key] || '';
                  var bad = v !== '' && skuCodes.indexOf(v) < 0;
                  return (
                    <div key={u.key} className="px-4 py-2.5 flex flex-wrap items-center gap-3">
                      <div className="flex-1 min-w-[260px] text-sm text-gray-300">{u.name}</div>
                      <div className="text-sm text-gray-400 w-24">SL {u.qty} · {u.orders} đơn</div>
                      {(data.ambiguous || {})[u.key] && (
                        <div className="flex gap-1 flex-wrap">
                          {(data.ambiguous || {})[u.key].map(function(c) {
                            return <button key={c} onClick={function() { setAssign(function(a) { var n = Object.assign({}, a); n[u.key] = c; return n; }); }}
                              className={'px-2 py-1 rounded text-xs border ' + (v === c ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-600 text-gray-300 hover:bg-slate-800')}>{c}</button>;
                          })}
                        </div>
                      )}
                      <input list="pxk-skus" value={v} placeholder="Chọn / gõ SKU"
                        onChange={function(e) { var val = e.target.value.trim(); setAssign(function(a) { var n = Object.assign({}, a); n[u.key] = val; return n; }); }}
                        className={inputCls + ' w-44 ' + (bad ? 'border-red-500' : '')} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {summary.unmappedSkus.length > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">
              SKU chưa có trong bảng quy đổi (vẫn in, không trừ kho): {summary.unmappedSkus.join(', ')}. Thêm ở Quản lý SKU rồi lập lại phiếu nếu cần trừ kho.
            </div>
          )}

          <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-slate-700 text-sm font-semibold text-gray-200">Tổng hợp theo SKU</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-400 border-b border-slate-700">
                  <th className="px-4 py-2 text-left w-10">#</th><th className="px-4 py-2 text-left">SKU</th><th className="px-4 py-2 text-left">Tên sản phẩm</th>
                  <th className="px-4 py-2 text-right">Số đơn</th><th className="px-4 py-2 text-right">Số lượng</th>
                </tr></thead>
                <tbody>
                  {summary.skuLines.map(function(l, i) {
                    return (
                      <tr key={l.sku} className="border-b border-slate-800">
                        <td className="px-4 py-2 text-gray-500">{i + 1}</td>
                        <td className="px-4 py-2 font-mono text-gray-200">{l.sku}</td>
                        <td className={'px-4 py-2 ' + (l.mapped ? 'text-gray-300' : 'text-amber-300')}>{l.name || '—'}{!l.mapped && ' (chưa có trong bảng quy đổi)'}</td>
                        <td className="px-4 py-2 text-right text-gray-400">{l.orders}</td>
                        <td className="px-4 py-2 text-right font-bold text-gray-100">{l.qty}</td>
                      </tr>
                    );
                  })}
                  {summary.unresolved.map(function(u, i) {
                    return (
                      <tr key={u.key} className="border-b border-slate-800 bg-amber-500/5">
                        <td className="px-4 py-2 text-gray-500">{summary.skuLines.length + i + 1}</td>
                        <td className="px-4 py-2 text-amber-300">(chưa có SKU)</td>
                        <td className="px-4 py-2 text-gray-300">{u.name}</td>
                        <td className="px-4 py-2 text-right text-gray-400">{u.orders}</td>
                        <td className="px-4 py-2 text-right font-bold text-gray-100">{u.qty}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {summary.hasCombo && summary.productLines.length > 0 && (
            <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden mb-4">
              <div className="px-4 py-3 border-b border-slate-700 text-sm font-semibold text-gray-200">Quy ra sản phẩm gốc cần nhặt (cũng là số sẽ trừ kho)</div>
              <table className="w-full text-sm">
                <tbody>
                  {summary.productLines.map(function(p) {
                    return <tr key={p.product} className="border-b border-slate-800"><td className="px-4 py-2 text-gray-300">{p.product}</td><td className="px-4 py-2 text-right font-bold text-gray-100 w-24">{p.qty}</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 mb-8">
            <button onClick={function() { createSlip(true); }} disabled={busy || resolved.length === 0 || !!dataErr}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg">
              {busy ? 'Đang xử lý...' : '🖨 Lập phiếu + trừ kho (' + WAREHOUSE_LABELS[wh] + ')'}
            </button>
            <button onClick={function() { createSlip(false); }} disabled={busy || resolved.length === 0 || !!dataErr}
              className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-gray-200 text-sm rounded-lg">Chỉ in phiếu, không trừ kho</button>
            <label className="inline-flex items-center gap-1.5 text-sm text-gray-400 cursor-pointer">
              <input type="checkbox" checked={showOrders} onChange={function(e) { setShowOrders(e.target.checked); }} /> Kèm trang danh sách từng đơn
            </label>
          </div>
        </>
      )}

      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 text-sm font-semibold text-gray-200">Lịch sử phiếu đã lập</div>
        {data.batches.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-500">Chưa có phiếu nào.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-400 border-b border-slate-700">
                <th className="px-4 py-2 text-left">Mã phiếu</th><th className="px-4 py-2 text-left">Sàn</th><th className="px-4 py-2 text-left">Kho</th>
                <th className="px-4 py-2 text-left">Ngày in</th><th className="px-4 py-2 text-right">Đơn</th><th className="px-4 py-2 text-right">SL</th>
                <th className="px-4 py-2 text-left">Trừ kho</th><th className="px-4 py-2 text-left">Người lập</th><th className="px-4 py-2"></th>
              </tr></thead>
              <tbody>
                {data.batches.slice().sort(function(a, b) { return b.createdAt.localeCompare(a.createdAt); }).slice(0, 30).map(function(b) {
                  var qty = b.orders.reduce(function(s, o) { return s + o.items.reduce(function(a, x) { return a + x.qty; }, 0); }, 0);
                  return (
                    <tr key={b.id} className="border-b border-slate-800">
                      <td className="px-4 py-2 font-mono text-gray-300">{b.id}</td>
                      <td className="px-4 py-2 text-gray-300">{PXK_PLATFORM_LABELS[b.platform]}</td>
                      <td className="px-4 py-2 text-gray-300">{b.warehouse}</td>
                      <td className="px-4 py-2 text-gray-300">{fmtDate(b.printDate)}</td>
                      <td className="px-4 py-2 text-right text-gray-300">{b.orders.length}</td>
                      <td className="px-4 py-2 text-right text-gray-300">{qty}</td>
                      <td className="px-4 py-2">{b.deducted ? <span className="text-emerald-400">Đã trừ</span> : <span className="text-gray-500">Không</span>}</td>
                      <td className="px-4 py-2 text-gray-400">{b.createdBy}</td>
                      <td className="px-4 py-2 text-right"><button onClick={function() { reprint(b); }} className="text-blue-400 hover:text-blue-300">In lại</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat(props: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={'rounded-xl border p-3 ' + (props.warn ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-900 border-slate-700')}>
      <div className="text-xs text-gray-400">{props.label}</div>
      <div className="text-2xl font-bold text-gray-100 mt-1">{props.value}</div>
    </div>
  );
}
