'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useAppState } from '@/lib/store';
import { getAllSkuCodes, getSkuProducts, subscribeSkuMap } from '@/lib/sku';
import { WAREHOUSES, WAREHOUSE_LABELS, type Warehouse } from '@/lib/inventory';
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
  // SKU nhân sự đã gắn trong lần này (khoá tên chuẩn hoá -> { sku, tên }); cũng được lưu ngay lên cloud để nhớ cho lần sau
  const [assign, setAssign] = useState<Record<string, { sku: string; name: string }>>({});
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
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

  const allowed = !!currentUser && (currentUser.role === 'admin' || currentUser.role === 'warehouse');
  const skuCodes = useMemo(function() { return getAllSkuCodes(); }, [skuVer]);

  // Đơn đã có trong các phiếu trước (cùng sàn) hoặc bị lặp trong lần tải này
  const knownIds = useMemo(function() {
    var s = new Set<string>();
    data.batches.forEach(function(b) { if (b.platform === platform) b.orders.forEach(function(o) { s.add(o.orderId); }); });
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
        var sku = (assign[key] && assign[key].sku) || data.names[key] || '';
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

  // Gắn SKU cho một dòng Shopee: dòng chuyển xuống bảng tổng hợp ngay, và được ghi nhớ ngay (không chờ bấm lập phiếu)
  function commitSku(key: string, name: string, sku: string) {
    setAssign(function(a) { var n = Object.assign({}, a); n[key] = { sku: sku, name: name }; return n; });
    setError('');
    saveChain.current = saveChain.current.then(function() {
      return dbUpdatePxk(function(cur) {
        var amb = Object.assign({}, cur.ambiguous || {});
        delete amb[key];
        var names = Object.assign({}, cur.names);
        names[key] = sku;
        return { names: names, ambiguous: amb, batches: cur.batches };
      }).then(setData);
    }).catch(function(e) {
      setError('Chưa lưu được ghi nhớ SKU (' + (e instanceof Error ? e.message : String(e)) + '). Lần sau app có thể hỏi lại dòng này.');
    });
  }

  function uncommitSku(key: string) {
    var cur = assign[key];
    setAssign(function(a) { var n = Object.assign({}, a); delete n[key]; return n; });
    saveChain.current = saveChain.current.then(function() {
      return dbUpdatePxk(function(c) {
        var names = Object.assign({}, c.names);
        if (cur && names[key] === cur.sku) delete names[key];
        return { names: names, ambiguous: c.ambiguous || {}, batches: c.batches };
      }).then(setData);
    }).catch(function(e) {
      setError('Chưa bỏ được ghi nhớ SKU (' + (e instanceof Error ? e.message : String(e)) + ').');
    });
  }

  function reset() { setOrders([]); setFileNames([]); setAssign({}); setError(''); setNotice(''); setIncludeOld(false); }

  function openPrint(html: string, w: Window | null) {
    if (!w) { setError('Trình duyệt chặn cửa sổ in. Hãy cho phép cửa sổ bật lên (pop-up) cho trang này rồi bấm "In lại" ở mục Lịch sử.'); return; }
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    setTimeout(function() { try { w.print(); } catch { /* người dùng tự in */ } }, 500);
  }

  async function createSlip() {
    setError(''); setNotice('');
    if (resolved.length === 0) { setError('Chưa có đơn mới nào để lập phiếu.'); return; }
    var noSku = summary.unresolved.reduce(function(s, u) { return s + u.qty; }, 0);
    var lines = [
      'LẬP VÀ IN PHIẾU ' + WAREHOUSE_LABELS[wh] + ' — ' + PXK_PLATFORM_LABELS[platform],
      resolved.length + ' đơn, ' + summary.totalQty + ' sản phẩm, ngày ' + fmtDate(printDate),
    ];
    if (noSku > 0) lines.push('⚠ ' + noSku + ' sản phẩm chưa có SKU: vẫn in lên phiếu theo tên sản phẩm.');
    if (summary.unmappedSkus.length > 0) lines.push('⚠ SKU chưa có trong bảng quy đổi (vẫn in, không quy ra sản phẩm gốc): ' + summary.unmappedSkus.join(', '));
    if (badLabels.length > 0) lines.push('⚠ ' + badLabels.length + ' nhãn đọc chưa chắc chắn, nên kiểm tra lại.');
    if (includeOld && analysis.old.length > 0) lines.push('⚠ Có ' + analysis.old.length + ' đơn đã lập phiếu trước đó — chúng sẽ được in lại.');
    lines.push('', 'Tiếp tục?');
    if (!window.confirm(lines.join('\n'))) return;

    var w = window.open('', '_blank');
    setBusy(true);
    try {
      var batch: PxkBatch = {
        id: makeBatchId(), platform: platform, warehouse: wh, printDate: printDate,
        createdAt: new Date().toISOString(), createdBy: currentUser ? currentUser.name : '',
        orders: resolved,
      };
      var msg = 'Đã lập phiếu ' + batch.id + '.';
      try {
        var learned: Record<string, string> = {};
        Object.keys(assign).forEach(function(k) { if (assign[k] && assign[k].sku) learned[k] = assign[k].sku; });
        var next = await dbUpdatePxk(function(cur) {
          var amb = Object.assign({}, cur.ambiguous || {});
          Object.keys(learned).forEach(function(k) { delete amb[k]; });
          return { names: Object.assign({}, cur.names, learned), ambiguous: amb, batches: cur.batches.concat([batch]) };
        });
        setData(next);
      } catch (e) {
        msg += ' ⚠ Chưa lưu được lịch sử phiếu (' + (e instanceof Error ? e.message : String(e)) + '). Phiếu vẫn được in, nhưng sẽ không có trong Lịch sử.';
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

  if (!allowed) {
    return <div className="p-6 text-red-400">Trang này chỉ dành cho nhân sự kho và admin.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-100">Phiếu xuất kho</h1>
        <p className="text-sm text-gray-500 mt-1">Tải file PDF in đơn của Shopee / TikTok → app tổng hợp sản phẩm theo SKU để kho nhặt hàng và in phiếu.</p>
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
                <div>{analysis.old.length} đơn đã có trong phiếu trước đó nên được bỏ qua (tránh in trùng).{' '}
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
            <div className="mb-4 bg-slate-900 border border-amber-500/40 rounded-xl overflow-visible">
              <div className="px-4 py-3 border-b border-slate-700 text-sm text-amber-200">
                Nhãn Shopee không có mã SKU — gắn SKU cho {summary.unresolved.length} sản phẩm dưới đây. Gõ mã rồi chọn trong danh sách (hoặc bấm Enter); dòng được gắn sẽ tự xuống bảng tổng hợp và app nhớ cho lần sau. Dòng chưa gắn vẫn lên phiếu theo tên sản phẩm.
              </div>
              <div className="divide-y divide-slate-800">
                {summary.unresolved.map(function(u) {
                  var cands = (data.ambiguous || {})[u.key];
                  return (
                    <div key={u.key} className="px-4 py-2.5 flex flex-wrap items-center gap-3">
                      <div className="flex-1 min-w-[260px] text-sm text-gray-300">{u.name}</div>
                      <div className="text-sm text-gray-400 w-24">SL {u.qty} · {u.orders} đơn</div>
                      {cands && cands.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {cands.map(function(c) {
                            return <button key={c} onClick={function() { commitSku(u.key, u.name, c); }}
                              className="px-2 py-1 rounded text-xs border border-slate-600 text-gray-300 hover:bg-slate-800">{c}</button>;
                          })}
                        </div>
                      )}
                      <SkuPicker codes={skuCodes} onCommit={function(sku) { commitSku(u.key, u.name, sku); }} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {Object.keys(assign).length > 0 && (
            <div className="mb-4 bg-slate-900 border border-emerald-500/30 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-700 text-sm text-emerald-300">Đã gắn SKU lần này (đã được ghi nhớ)</div>
              <div className="divide-y divide-slate-800">
                {Object.keys(assign).map(function(k) {
                  return (
                    <div key={k} className="px-4 py-2 flex flex-wrap items-center gap-3 text-sm">
                      <div className="flex-1 min-w-[260px] text-gray-400">{assign[k].name}</div>
                      <div className="font-mono text-gray-100">{assign[k].sku}</div>
                      <button onClick={function() { uncommitSku(k); }} className="text-xs text-red-400 hover:text-red-300">Bỏ gắn / gắn lại</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {summary.unmappedSkus.length > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">
              SKU chưa có trong bảng quy đổi (vẫn in, không quy ra được sản phẩm gốc): {summary.unmappedSkus.join(', ')}. Thêm ở Quản lý SKU để lần sau có tên sản phẩm gốc.
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
              <div className="px-4 py-3 border-b border-slate-700 text-sm font-semibold text-gray-200">Quy ra sản phẩm gốc cần nhặt</div>
              <table className="w-full text-sm">
                <tbody>
                  {summary.productLines.map(function(p) {
                    return <tr key={p.product} className="border-b border-slate-800"><td className="px-4 py-2 font-mono text-gray-200 w-40">{p.skus || '—'}</td><td className="px-4 py-2 text-gray-300">{p.product}</td><td className="px-4 py-2 text-right font-bold text-gray-100 w-24">{p.qty}</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 mb-8">
            <button onClick={function() { createSlip(); }} disabled={busy || resolved.length === 0 || !!dataErr}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg">
              {busy ? 'Đang xử lý...' : '🖨 Lập và in phiếu (' + WAREHOUSE_LABELS[wh] + ')'}
            </button>
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
                <th className="px-4 py-2 text-left">Người lập</th><th className="px-4 py-2"></th>
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

function describeCode(code: string): string {
  var items = getSkuProducts(code);
  if (items.length === 0) return '';
  var qty: Record<string, number> = {};
  var order: string[] = [];
  items.forEach(function(p) { if (!(p.product in qty)) { qty[p.product] = 0; order.push(p.product); } qty[p.product] += p.quantity; });
  return order.map(function(n) { return (qty[n] > 1 ? qty[n] + '× ' : '') + n; }).join(' + ');
}

// Ô chọn SKU: gõ để lọc, bấm vào gợi ý (hoặc Enter) mới gắn — tránh gắn nhầm khi mới gõ được vài ký tự.
function SkuPicker(props: { codes: string[]; onCommit: (sku: string) => void }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const q = text.trim().toUpperCase();
  const matches = useMemo(function() {
    if (!q) return [];
    var starts = props.codes.filter(function(c) { return c.toUpperCase().indexOf(q) === 0; });
    var has = props.codes.filter(function(c) { return c.toUpperCase().indexOf(q) > 0; });
    return starts.concat(has).slice(0, 8);
  }, [q, props.codes]);
  const exact = props.codes.find(function(c) { return c.toUpperCase() === q; });

  function submit() {
    if (!q) return;
    if (exact) { props.onCommit(exact); return; }
    if (window.confirm('Mã "' + text.trim() + '" chưa có trong bảng quy đổi SKU. Vẫn gắn mã này?\n(Phiếu vẫn in, nhưng không quy ra được sản phẩm gốc cho tới khi thêm mã ở Quản lý SKU.)')) props.onCommit(text.trim());
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input value={text} placeholder="Gõ mã SKU rồi chọn"
          onChange={function(e) { setText(e.target.value); setOpen(true); }}
          onFocus={function() { setOpen(true); }}
          onBlur={function() { setTimeout(function() { setOpen(false); }, 150); }}
          onKeyDown={function(e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none w-48" />
        <button type="button" onClick={submit} disabled={!q}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm rounded-lg">Gắn</button>
      </div>
      {open && matches.length > 0 && (
        <div className="absolute z-20 right-0 mt-1 w-80 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-64 overflow-y-auto">
          {matches.map(function(c) {
            return (
              <button key={c} type="button"
                onMouseDown={function(e) { e.preventDefault(); props.onCommit(c); }}
                className="block w-full text-left px-3 py-1.5 text-sm hover:bg-slate-700">
                <span className="font-mono text-gray-100">{c}</span>
                <span className="text-gray-400 ml-2 text-xs">{describeCode(c)}</span>
              </button>
            );
          })}
        </div>
      )}
      {q && !exact && <div className="text-xs text-amber-300 mt-1">Chưa có mã này trong bảng quy đổi SKU</div>}
    </div>
  );
}
