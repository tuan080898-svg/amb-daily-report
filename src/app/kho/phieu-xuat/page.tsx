'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useAppState } from '@/lib/store';
import { getAllSkuCodes, getSkuProducts, subscribeSkuMap } from '@/lib/sku';
import { WAREHOUSES, WAREHOUSE_LABELS, type Warehouse } from '@/lib/inventory';
import { dbGetPxk, dbUpdatePxk } from '@/lib/db';
import { learnShopeeFromRowSets } from '@/lib/pxk-learn';
import * as XLSX from 'xlsx';
import {
  parsePxkFileAuto, guessWarehouse, summarizePxk, buildPxkHtmlMulti, pxkNameKey, PXK_PLATFORM_LABELS,
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

// Một file PDF đã đọc: sàn (tự nhận diện) + kho (đoán từ tên file, sửa được) + các nhãn trong file
interface PxkFile {
  id: string;
  file: File;
  name: string;
  platform: PxkPlatform | null;
  wh: Warehouse;
  whGuessed: boolean;
  orders: PxkOrder[];
  error: string;
}

interface GroupView {
  key: string;
  platform: PxkPlatform;
  wh: Warehouse;
  used: PxkOrder[];
  oldCount: number;
  resolved: Array<{ orderId: string; items: PxkItem[] }>;
  summary: ReturnType<typeof summarizePxk>;
  bad: PxkOrder[];
}

export default function PhieuXuatKhoPage() {
  const { currentUser } = useAppState();
  const [defaultWh, setDefaultWh] = useState<Warehouse>('HCM');
  const [printDate, setPrintDate] = useState(todayStr());
  const [files, setFiles] = useState<PxkFile[]>([]);
  const [parsingMsg, setParsingMsg] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [data, setData] = useState<PxkData>({ names: {}, batches: [] });
  const [dataErr, setDataErr] = useState('');
  // SKU nhân sự đã gắn trong lần này (khoá tên chuẩn hoá -> { sku, tên }); cũng được lưu ngay lên cloud để nhớ cho lần sau
  const [assign, setAssign] = useState<Record<string, { sku: string; name: string }>>({});
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const [excludeOld, setExcludeOld] = useState(false); // mặc định in ĐỦ mọi đơn đã chọn, kể cả đơn đã lập phiếu trước
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

  // Đơn đã có trong các phiếu trước (cùng sàn): mã đơn -> phiếu gần nhất chứa đơn đó
  const prevOrders = useMemo(function() {
    var out: Record<PxkPlatform, Record<string, { id: string; by: string; at: string }>> = { shopee: {}, tiktok: {} };
    data.batches.slice().sort(function(a, b) { return a.createdAt.localeCompare(b.createdAt); }).forEach(function(b) {
      b.orders.forEach(function(o) { out[b.platform][o.orderId] = { id: b.id, by: b.createdBy, at: b.createdAt }; });
    });
    return out;
  }, [data]);

  function resolveOrders(os: PxkOrder[]): Array<{ orderId: string; items: PxkItem[] }> {
    return os.map(function(o) {
      var items: PxkItem[] = o.items.map(function(it) {
        if (it.sku) return it;
        var key = pxkNameKey(it.name);
        var sku = (assign[key] && assign[key].sku) || data.names[key] || '';
        return sku ? { sku: sku, name: it.name, qty: it.qty } : it;
      });
      return { orderId: o.orderId, items: items };
    });
  }

  // Gộp các file theo (sàn, kho); mã đơn lặp giữa các file chỉ tính một lần
  const analysis = useMemo(function() {
    var seen: Record<PxkPlatform, Set<string>> = { shopee: new Set<string>(), tiktok: new Set<string>() };
    var map: Record<string, { platform: PxkPlatform; wh: Warehouse; fresh: PxkOrder[]; old: PxkOrder[] }> = {};
    var dupInUpload = 0;
    var noId: PxkOrder[] = [];
    files.forEach(function(f) {
      if (!f.platform) return;
      var plat = f.platform;
      f.orders.forEach(function(o) {
        if (!o.orderId) { noId.push(o); return; }
        if (seen[plat].has(o.orderId)) { dupInUpload++; return; }
        seen[plat].add(o.orderId);
        var key = plat + '|' + f.wh;
        var g = map[key] || (map[key] = { platform: plat, wh: f.wh, fresh: [], old: [] });
        (prevOrders[plat][o.orderId] ? g.old : g.fresh).push(o);
      });
    });
    return { groups: Object.keys(map).sort().map(function(k) { return Object.assign({ key: k }, map[k]); }), dupInUpload: dupInUpload, noId: noId };
  }, [files, prevOrders]);

  const groups: GroupView[] = useMemo(function() {
    return analysis.groups.map(function(g) {
      var used = g.fresh.concat(excludeOld ? [] : g.old);
      var resolved = resolveOrders(used);
      return {
        key: g.key, platform: g.platform, wh: g.wh, used: used, oldCount: g.old.length,
        resolved: resolved, summary: summarizePxk(resolved), bad: used.filter(function(o) { return !o.ok; }),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, excludeOld, assign, data.names, skuVer]);

  // Dòng Shopee chưa có SKU: gộp từ mọi nhóm Shopee để gắn một lần
  const shopeeUnresolved = useMemo(function() {
    var all: Array<{ orderId: string; items: PxkItem[] }> = [];
    groups.forEach(function(g) { if (g.platform === 'shopee') all = all.concat(g.resolved); });
    return summarizePxk(all).unresolved;
  }, [groups]);

  const unmappedAll = useMemo(function() {
    var s = new Set<string>();
    groups.forEach(function(g) { g.summary.unmappedSkus.forEach(function(c) { s.add(c); }); });
    return Array.from(s).sort();
  }, [groups]);

  // Đếm số đơn trong phiếu mới trùng với từng phiếu cũ (để báo rõ, không âm thầm bỏ)
  const oldSummary = useMemo(function() {
    var by: Record<string, { id: string; by: string; n: number }> = {};
    analysis.groups.forEach(function(g) {
      g.old.forEach(function(o) { var p = prevOrders[g.platform][o.orderId]; if (!p) return; (by[p.id] = by[p.id] || { id: p.id, by: p.by, n: 0 }).n++; });
    });
    return Object.values(by).sort(function(a, b) { return b.n - a.n; });
  }, [analysis, prevOrders]);

  const totalOrders = groups.reduce(function(s, g) { return s + g.used.length; }, 0);
  const totalQty = groups.reduce(function(s, g) { return s + g.summary.totalQty; }, 0);
  const totalOld = groups.reduce(function(s, g) { return s + g.oldCount; }, 0);
  const totalBad = groups.reduce(function(s, g) { return s + g.bad.length; }, 0);

  async function addFiles(list: FileList | File[] | null) {
    if (!list || list.length === 0) return;
    var incoming = Array.from(list).filter(function(f) { return /\.pdf$/i.test(f.name) || f.type === 'application/pdf'; });
    if (incoming.length === 0) { setError('Chỉ nhận file PDF in đơn của Shopee / TikTok.'); return; }
    setError(''); setNotice('');
    var skipped: string[] = [];
    for (var i = 0; i < incoming.length; i++) {
      var f = incoming[i];
      var dup = files.some(function(x) { return x.name === f.name && x.file.size === f.size; });
      if (dup) { skipped.push(f.name); continue; }
      setParsingMsg('Đang đọc ' + (i + 1) + '/' + incoming.length + ': ' + f.name);
      var entry: PxkFile;
      var guess = guessWarehouse(f.name);
      try {
        var r = await parsePxkFileAuto(f);
        guess = r.warehouse || guess; // địa chỉ người gửi trên nhãn đáng tin hơn tên file
        entry = {
          id: f.name + '|' + f.size + '|' + Date.now() + i, file: f, name: f.name, platform: r.platform,
          wh: guess || defaultWh, whGuessed: !!guess, orders: r.orders,
          error: r.platform ? (r.orders.length === 0 ? 'Không đọc được nhãn nào trong file này.' : '') : 'Không nhận diện được sàn (không phải nhãn Shopee / TikTok?). Chọn sàn thủ công bên dưới.',
        };
      } catch (e) {
        entry = {
          id: f.name + '|' + f.size + '|' + Date.now() + i, file: f, name: f.name, platform: null, wh: guess || defaultWh, whGuessed: !!guess, orders: [],
          error: 'Không đọc được file: ' + (e instanceof Error ? e.message : String(e)),
        };
      }
      var added = entry;
      setFiles(function(prev) { return prev.concat([added]); });
    }
    setParsingMsg('');
    if (skipped.length > 0) setNotice('Bỏ qua file đã chọn trước đó: ' + skipped.join(', '));
    if (fileRef.current) fileRef.current.value = '';
  }

  async function forcePlatform(id: string, platform: PxkPlatform) {
    var target = files.find(function(f) { return f.id === id; });
    if (!target) return;
    setParsingMsg('Đang đọc lại ' + target.name + '...');
    try {
      var r = await parsePxkFileAuto(target.file, platform);
      setFiles(function(prev) {
        return prev.map(function(f) {
          return f.id === id ? Object.assign({}, f, { platform: platform, orders: r.orders, error: r.orders.length === 0 ? 'Không đọc được nhãn nào theo định dạng ' + PXK_PLATFORM_LABELS[platform] + '.' : '' }) : f;
        });
      });
    } catch (e) {
      setError('Không đọc lại được file: ' + (e instanceof Error ? e.message : String(e)));
    }
    setParsingMsg('');
  }

  function setFileWh(id: string, wh: Warehouse) {
    setFiles(function(prev) { return prev.map(function(f) { return f.id === id ? Object.assign({}, f, { wh: wh, whGuessed: false }) : f; }); });
  }

  function removeFile(id: string) {
    setFiles(function(prev) { return prev.filter(function(f) { return f.id !== id; }); });
  }

  async function onLearnFiles(fl: FileList | null) {
    if (!fl || fl.length === 0) return;
    setLearning(true); setLearnMsg(''); setError('');
    try {
      var sets: Array<Array<Record<string, unknown>>> = [];
      for (var i = 0; i < fl.length; i++) {
        var wb = XLSX.read(await fl[i].arrayBuffer(), { type: 'array' });
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

  function reset() { setFiles([]); setAssign({}); setError(''); setNotice(''); setExcludeOld(false); setParsingMsg(''); }

  // Ghi chú in lên phiếu: bao nhiêu đơn trong phiếu đã nằm trong phiếu cũ nào
  function noteForOld(g: GroupView): string[] {
    var by: Record<string, number> = {};
    g.used.forEach(function(o) { var p = prevOrders[g.platform][o.orderId]; if (p) by[p.id + ' (' + p.by + ')'] = (by[p.id + ' (' + p.by + ')'] || 0) + 1; });
    var keys = Object.keys(by);
    if (keys.length === 0) return [];
    return [Object.values(by).reduce(function(s, n) { return s + n; }, 0) + ' đơn trong phiếu này ĐÃ CÓ trong phiếu lập trước đó: ' + keys.map(function(k) { return k + ' ×' + by[k]; }).join(', ') + '. Kiểm tra để không nhặt hàng hai lần.'];
  }

  function openPrint(html: string, w: Window | null) {
    if (!w) { setError('Trình duyệt chặn cửa sổ in. Hãy cho phép cửa sổ bật lên (pop-up) cho trang này rồi bấm "In lại" ở mục Lịch sử.'); return; }
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    setTimeout(function() { try { w.print(); } catch { /* người dùng tự in */ } }, 500);
  }

  async function createSlips() {
    setError(''); setNotice('');
    var ready = groups.filter(function(g) { return g.resolved.length > 0; });
    if (ready.length === 0) { setError('Chưa có đơn mới nào để lập phiếu.'); return; }
    var lines = ['LẬP VÀ IN ' + ready.length + ' PHIẾU (ngày ' + fmtDate(printDate) + ')', ''];
    ready.forEach(function(g) {
      var noSku = g.summary.unresolved.reduce(function(s, u) { return s + u.qty; }, 0);
      lines.push('• ' + PXK_PLATFORM_LABELS[g.platform] + ' — ' + WAREHOUSE_LABELS[g.wh] + ': ' + g.resolved.length + ' đơn, ' + g.summary.totalQty + ' sản phẩm' +
        (noSku > 0 ? ' (⚠ ' + noSku + ' sản phẩm chưa có SKU)' : '') + (g.bad.length > 0 ? ' (⚠ ' + g.bad.length + ' nhãn đọc chưa chắc)' : ''));
    });
    if (unmappedAll.length > 0) lines.push('', '⚠ SKU chưa có trong bảng quy đổi (vẫn in, không quy ra sản phẩm gốc): ' + unmappedAll.join(', '));
    if (totalOld > 0) lines.push('', (excludeOld ? 'ℹ Đã BỎ ' : '⚠ Có ') + totalOld + (excludeOld ? ' đơn đã lập phiếu trước đó (không in).' : ' đơn đã lập phiếu trước đó — vẫn được in lại trong các phiếu này.'));
    lines.push('', 'Tiếp tục?');
    if (!window.confirm(lines.join('\n'))) return;

    var w = window.open('', '_blank');
    setBusy(true);
    try {
      var createdAt = new Date().toISOString();
      var by = currentUser ? currentUser.name : '';
      var batches: PxkBatch[] = ready.map(function(g) {
        return {
          id: makeBatchId(), platform: g.platform, warehouse: g.wh, printDate: printDate, createdAt: createdAt, createdBy: by,
          issues: g.bad.map(function(o) { return o.orderId || ('trang ' + o.pages.join('-')); }),
          notes: noteForOld(g),
          orders: g.resolved,
        };
      });
      var msg = 'Đã lập ' + batches.length + ' phiếu: ' + batches.map(function(b) { return b.id; }).join(', ') + '.';
      try {
        var learned: Record<string, string> = {};
        Object.keys(assign).forEach(function(k) { if (assign[k] && assign[k].sku) learned[k] = assign[k].sku; });
        var next = await dbUpdatePxk(function(cur) {
          var amb = Object.assign({}, cur.ambiguous || {});
          Object.keys(learned).forEach(function(k) { delete amb[k]; });
          return { names: Object.assign({}, cur.names, learned), ambiguous: amb, batches: cur.batches.concat(batches) };
        });
        setData(next);
      } catch (e) {
        msg += ' ⚠ Chưa lưu được lịch sử phiếu (' + (e instanceof Error ? e.message : String(e)) + '). Phiếu vẫn được in, nhưng sẽ không có trong Lịch sử.';
      }
      setNotice(msg);
      openPrint(buildPxkHtmlMulti(batches, { showOrders: showOrders }), w);
      setFiles([]); setAssign({}); setExcludeOld(false);
    } catch (e) {
      if (w) w.close();
      setError('Lỗi: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  function reprint(b: PxkBatch) {
    var w = window.open('', '_blank');
    openPrint(buildPxkHtmlMulti([b], { showOrders: showOrders }), w);
  }

  var inputCls = 'px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none';
  var hasShopee = files.some(function(f) { return f.platform === 'shopee'; });

  if (!allowed) {
    return <div className="p-6 text-red-400">Trang này chỉ dành cho nhân sự kho và admin.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-100">Phiếu xuất kho</h1>
        <p className="text-sm text-gray-500 mt-1">Chọn một lúc nhiều file PDF in đơn (Shopee và TikTok, nhiều kho) → app tự nhận diện sàn, tổng hợp theo SKU để kho nhặt hàng, mỗi sàn/kho một phiếu và in một lượt.</p>
      </div>

      {(hasShopee || files.length === 0) && (
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
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={function(e) { addFiles(e.target.files); }} />
        <div
          onDragOver={function(e) { e.preventDefault(); setDragging(true); }}
          onDragLeave={function() { setDragging(false); }}
          onDrop={function(e) { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
          onClick={function() { if (!parsingMsg && !busy) fileRef.current?.click(); }}
          className={'cursor-pointer rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ' + (dragging ? 'border-blue-400 bg-blue-500/10' : 'border-slate-600 hover:border-slate-500')}>
          <div className="text-sm font-medium text-gray-200">{parsingMsg ? parsingMsg : '📄 Kéo thả hoặc bấm để chọn nhiều file PDF in đơn'}</div>
          <div className="text-xs text-gray-500 mt-1">Chọn cả file Shopee và TikTok cùng lúc được · có thể thêm file nhiều lần · app tự nhận diện sàn; kho tự nhận từ địa chỉ người gửi trên nhãn Shopee hoặc từ tên file (có HN / HCM)</div>
        </div>
        <div className="flex flex-wrap gap-4 items-end mt-4">
          <div>
            <div className="text-xs text-gray-400 mb-1.5">Kho mặc định (file không có HN/HCM trong tên)</div>
            <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
              {WAREHOUSES.map(function(w) {
                return <button key={w} onClick={function() { setDefaultWh(w); }}
                  className={'px-3 py-1.5 rounded-md text-sm font-medium ' + (defaultWh === w ? (w === 'HCM' ? 'bg-blue-600 text-white' : 'bg-violet-600 text-white') : 'text-gray-400 hover:text-gray-200')}>{WAREHOUSE_LABELS[w]}</button>;
              })}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1.5">Ngày in phiếu</div>
            <input type="date" value={printDate} onChange={function(e) { setPrintDate(e.target.value); }} className={inputCls} />
          </div>
          {files.length > 0 && <button onClick={reset} className="px-3 py-2 text-sm text-gray-400 hover:text-gray-200">Làm lại (xóa hết file)</button>}
        </div>

        {files.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-400 border-b border-slate-700">
                <th className="px-2 py-2 text-left">File</th><th className="px-2 py-2 text-left">Sàn</th><th className="px-2 py-2 text-right">Số nhãn</th>
                <th className="px-2 py-2 text-left">Kho</th><th className="px-2 py-2"></th>
              </tr></thead>
              <tbody>
                {files.map(function(f) {
                  return (
                    <tr key={f.id} className="border-b border-slate-800 align-top">
                      <td className="px-2 py-2 text-gray-300 max-w-[320px] break-words">
                        {f.name}
                        {f.error && <div className="text-xs text-amber-300 mt-0.5">{f.error}</div>}
                      </td>
                      <td className="px-2 py-2">
                        {f.platform
                          ? <span className={'inline-flex px-2 py-0.5 rounded text-xs font-medium ' + (f.platform === 'shopee' ? 'bg-orange-500/15 text-orange-400' : 'bg-pink-500/15 text-pink-400')}>{PXK_PLATFORM_LABELS[f.platform]}</span>
                          : <select value="" onChange={function(e) { if (e.target.value) forcePlatform(f.id, e.target.value as PxkPlatform); }} className={inputCls + ' py-1'}>
                              <option value="">Chọn sàn...</option><option value="shopee">Shopee</option><option value="tiktok">TikTok Shop</option>
                            </select>}
                      </td>
                      <td className="px-2 py-2 text-right text-gray-300">{f.orders.length}</td>
                      <td className="px-2 py-2">
                        <select value={f.wh} onChange={function(e) { setFileWh(f.id, e.target.value as Warehouse); }} className={inputCls + ' py-1'}>
                          {WAREHOUSES.map(function(w) { return <option key={w} value={w}>{WAREHOUSE_LABELS[w]}</option>; })}
                        </select>
                        {f.whGuessed && <span className="ml-2 text-xs text-gray-500">tự nhận</span>}
                      </td>
                      <td className="px-2 py-2 text-right"><button onClick={function() { removeFile(f.id); }} className="text-xs text-red-400 hover:text-red-300">Gỡ</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300 whitespace-pre-wrap">{error}</div>}
      {notice && <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-300">{notice}</div>}

      {files.some(function(f) { return f.orders.length > 0; }) && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Stat label="Số phiếu sẽ lập" value={String(groups.filter(function(g) { return g.resolved.length > 0; }).length)} />
            <Stat label="Đơn sẽ in" value={String(totalOrders)} />
            <Stat label="Tổng sản phẩm" value={String(totalQty)} />
            <Stat label="Đơn đã lập phiếu trước" value={String(totalOld)} warn={totalOld > 0} />
          </div>

          {(totalOld > 0 || analysis.dupInUpload > 0 || analysis.noId.length > 0) && (
            <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200 space-y-1">
              {totalOld > 0 && (
                <div>
                  <b>{totalOld} đơn đã có trong phiếu lập trước đó</b>: {oldSummary.map(function(x) { return x.id + ' (' + x.by + ', ' + x.n + ' đơn)'; }).join('; ')}.{' '}
                  {excludeOld ? 'Các đơn này ĐANG BỊ BỎ, không in.' : 'Các đơn này VẪN ĐƯỢC IN lại trong phiếu mới (có ghi chú trên phiếu).'}{' '}
                  <label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={excludeOld} onChange={function(e) { setExcludeOld(e.target.checked); }} /> chỉ in các đơn chưa từng lập phiếu</label>
                </div>
              )}
              {analysis.dupInUpload > 0 && <div>{analysis.dupInUpload} nhãn bị lặp mã đơn giữa các file vừa chọn — chỉ tính một lần.</div>}
              {analysis.noId.length > 0 && <div>{analysis.noId.length} nhãn không đọc được mã đơn — bỏ qua, hãy kiểm tra tay ({analysis.noId.map(function(o) { return o.file + ' trang ' + o.pages.join('-'); }).slice(0, 8).join('; ')}).</div>}
            </div>
          )}

          {totalBad > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">
              {totalBad} nhãn đọc chưa chắc chắn (số lượng không khớp tổng trên nhãn hoặc thiếu SKU). Kiểm tra tay các mã đơn:{' '}
              {groups.flatMap(function(g) { return g.bad; }).slice(0, 10).map(function(o) { return o.orderId || (o.file + ' trang ' + o.pages.join('-')); }).join(', ')}{totalBad > 10 ? '...' : ''}
            </div>
          )}

          {shopeeUnresolved.length > 0 && (
            <div className="mb-4 bg-slate-900 border border-amber-500/40 rounded-xl overflow-visible">
              <div className="px-4 py-3 border-b border-slate-700 text-sm text-amber-200">
                Nhãn Shopee không có mã SKU — gắn SKU cho {shopeeUnresolved.length} sản phẩm dưới đây. Gõ mã rồi chọn trong danh sách (hoặc bấm Enter); dòng được gắn sẽ tự xuống bảng tổng hợp và app nhớ cho lần sau. Dòng chưa gắn vẫn lên phiếu theo tên sản phẩm.
              </div>
              <div className="divide-y divide-slate-800">
                {shopeeUnresolved.map(function(u) {
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

          {unmappedAll.length > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">
              SKU chưa có trong bảng quy đổi (vẫn in, không quy ra được sản phẩm gốc): {unmappedAll.join(', ')}. Thêm ở Quản lý SKU để lần sau có tên sản phẩm gốc.
            </div>
          )}

          {groups.map(function(g) {
            var s = g.summary;
            return (
              <details key={g.key} open={groups.length === 1} className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden mb-4">
                <summary className="px-4 py-3 cursor-pointer flex flex-wrap items-center gap-3 text-sm">
                  <span className={'inline-flex px-2 py-0.5 rounded text-xs font-medium ' + (g.platform === 'shopee' ? 'bg-orange-500/15 text-orange-400' : 'bg-pink-500/15 text-pink-400')}>{PXK_PLATFORM_LABELS[g.platform]}</span>
                  <span className={'inline-flex px-2 py-0.5 rounded text-xs font-medium ' + (g.wh === 'HCM' ? 'bg-blue-500/15 text-blue-300' : 'bg-violet-500/15 text-violet-300')}>{WAREHOUSE_LABELS[g.wh]}</span>
                  <span className="font-semibold text-gray-100">1 phiếu: {g.resolved.length} đơn · {s.totalQty} sản phẩm · {s.skuLines.length + s.unresolved.length} mã SKU</span>
                  {g.oldCount > 0 && <span className="text-xs text-amber-300">({g.oldCount} đơn đã lập phiếu trước{excludeOld ? ', ĐÃ BỎ' : ', vẫn in'})</span>}
                  {g.bad.length > 0 && <span className="text-xs text-amber-300">⚠ {g.bad.length} nhãn chưa chắc</span>}
                  <span className="text-xs text-gray-500">bấm để xem chi tiết</span>
                </summary>
                <div className="overflow-x-auto border-t border-slate-700">
                  <table className="w-full text-sm">
                    <thead><tr className="text-xs text-gray-400 border-b border-slate-700">
                      <th className="px-4 py-2 text-left w-10">#</th><th className="px-4 py-2 text-left">SKU</th><th className="px-4 py-2 text-left">Tên sản phẩm</th>
                      <th className="px-4 py-2 text-right">Số đơn</th><th className="px-4 py-2 text-right">Số lượng</th>
                    </tr></thead>
                    <tbody>
                      {s.skuLines.map(function(l, i) {
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
                      {s.unresolved.map(function(u, i) {
                        return (
                          <tr key={u.key} className="border-b border-slate-800 bg-amber-500/5">
                            <td className="px-4 py-2 text-gray-500">{s.skuLines.length + i + 1}</td>
                            <td className="px-4 py-2 text-amber-300">(chưa có SKU)</td>
                            <td className="px-4 py-2 text-gray-300">{u.name}</td>
                            <td className="px-4 py-2 text-right text-gray-400">{u.orders}</td>
                            <td className="px-4 py-2 text-right font-bold text-gray-100">{u.qty}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {s.hasCombo && s.productLines.length > 0 && (
                    <div className="border-t border-slate-700">
                      <div className="px-4 py-2 text-sm font-semibold text-gray-200">Quy ra sản phẩm gốc cần nhặt</div>
                      <table className="w-full text-sm"><tbody>
                        {s.productLines.map(function(p) {
                          return <tr key={p.product} className="border-b border-slate-800"><td className="px-4 py-2 font-mono text-gray-200 w-40">{p.skus || '—'}</td><td className="px-4 py-2 text-gray-300">{p.product}</td><td className="px-4 py-2 text-right font-bold text-gray-100 w-24">{p.qty}</td></tr>;
                        })}
                      </tbody></table>
                    </div>
                  )}
                </div>
              </details>
            );
          })}

          <div className="flex flex-wrap items-center gap-3 mb-8">
            <button onClick={function() { createSlips(); }} disabled={busy || !!parsingMsg || totalOrders === 0 || !!dataErr}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg">
              {busy ? 'Đang xử lý...' : '🖨 Lập và in ' + groups.filter(function(g) { return g.resolved.length > 0; }).length + ' phiếu'}
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
