'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useAppState } from '@/lib/store';
import { toDateString } from '@/lib/utils';
import { getProductSkuCodes, getAllComboSkus, subscribeSkuMap } from '@/lib/sku';
import {
  loadInventory, saveInventory, refreshInventory, makeStockBaselineTx, getCurrentStock, getStockStatus,
  getProductTransactions, getTrackedProducts,
  isProductTracked, getWarehouseConfig,
  WAREHOUSES, WAREHOUSE_LABELS,
  type InventoryData, type Warehouse,
} from '@/lib/inventory';
import * as XLSX from 'xlsx';

type ActionTab = 'import' | 'export' | 'audit' | 'config';
type ListTab = 'all' | 'low' | 'out' | 'combo';
type StatusFilter = 'all' | 'ok' | 'low' | 'out' | 'unset';
type SortKey = 'name' | 'total' | 'updated';
interface BatchItem { product: string; quantity: number; }

const PAGE_SIZES = [20, 50, 100];

export default function AdminInventoryPage() {
  const { currentUser } = useAppState();
  const [inv, setInv] = useState<InventoryData>({ products: {}, transactions: [] });
  const [successMsg, setSuccessMsg] = useState('');

  // Danh sách (kiểu Sapo "Quản lý kho")
  const [listTab, setListTab] = useState<ListTab>('all');
  const [search, setSearch] = useState('');
  const [selectedWh, setSelectedWh] = useState<Warehouse | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [drawerProduct, setDrawerProduct] = useState<string | null>(null);

  // Cửa sổ thao tác (nhập / trừ / kiểm / cài đặt tồn)
  const [opOpen, setOpOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActionTab>('import');
  const [opWh, setOpWh] = useState<Warehouse>('HCM');
  const [opSearch, setOpSearch] = useState('');
  const [opShowDropdown, setOpShowDropdown] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [opNote, setOpNote] = useState('');
  const [configThreshold, setConfigThreshold] = useState(10);
  const [configLeadTime, setConfigLeadTime] = useState(10);
  const searchRef = useRef<HTMLDivElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [excelPreview, setExcelPreview] = useState<Array<{ product: string; qtyHCM: number; qtyHN: number; matched: boolean }> | null>(null);
  const [excelDualMode, setExcelDualMode] = useState(false);

  useEffect(function() {
    var alive = true;
    setInv(loadInventory());
    refreshInventory().then(function(fresh) { if (alive) setInv(fresh); });
    return function() { alive = false; };
  }, []);

  useEffect(function() {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setOpShowDropdown(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return function() { document.removeEventListener('mousedown', handleClickOutside); };
  }, []);

  var [skuVer, setSkuVer] = useState(0);
  useEffect(function() { return subscribeSkuMap(function() { setSkuVer(function(v) { return v + 1; }); }); }, []);
  var allProducts = useMemo(function() { return getTrackedProducts(); }, [skuVer]);
  var productSkuMap = useMemo(function() { return getProductSkuCodes(); }, [skuVer]);

  var opResults = useMemo(function() {
    if (!opSearch.trim()) return [];
    var q = opSearch.trim().toLowerCase();
    var selected = new Set(batchItems.map(function(b) { return b.product; }));
    return allProducts.filter(function(p) {
      if (selected.has(p)) return false;
      if (p.toLowerCase().includes(q)) return true;
      return (productSkuMap[p] || []).some(function(c) { return c.toLowerCase().includes(q); });
    }).slice(0, 8);
  }, [opSearch, allProducts, productSkuMap, batchItems]);

  // Ngày giao dịch gần nhất của từng sản phẩm (cột "Cập nhật")
  var lastUpdated = useMemo(function() {
    var out: Record<string, string> = {};
    inv.transactions.forEach(function(t) { if (!out[t.product] || t.date > out[t.product]) out[t.product] = t.date; });
    return out;
  }, [inv]);

  interface Row {
    product: string; skuCodes: string[]; tracked: boolean;
    hcm: number | null; hn: number | null; total: number; threshold: number;
    status: 'ok' | 'low' | 'out' | 'unset'; updated: string;
  }

  var rows: Row[] = useMemo(function() {
    return allProducts.map(function(product) {
      var tracked = isProductTracked(inv, product);
      var skuCodes = productSkuMap[product] || [];
      var vals: Record<string, number | null> = {};
      var thr = 0; var worst: Row['status'] = 'unset';
      WAREHOUSES.forEach(function(wh) {
        var cfg = getWarehouseConfig(inv, product, wh);
        var cur = getCurrentStock(inv, product, wh);
        var has = (cfg && cfg.initialStock > 0) || cur !== 0;
        vals[wh] = has ? cur : null;
        if (selectedWh !== 'ALL' && selectedWh !== wh) return;
        if (has) {
          thr += cfg ? cfg.alertThreshold : 0;
          var st = getStockStatus(cur, cfg ? cfg.alertThreshold : 0);
          if (st === 'out') worst = 'out';
          else if (st === 'low' && worst !== 'out') worst = 'low';
          else if (worst === 'unset') worst = 'ok';
        }
      });
      var shown = WAREHOUSES.filter(function(w) { return selectedWh === 'ALL' || selectedWh === w; });
      var total = shown.reduce(function(s, w) { return s + (vals[w] || 0); }, 0);
      return {
        product: product, skuCodes: skuCodes, tracked: tracked,
        hcm: vals['HCM'], hn: vals['HN'], total: total, threshold: thr,
        status: worst, updated: lastUpdated[product] || '',
      };
    });
  }, [allProducts, inv, productSkuMap, selectedWh, lastUpdated]);

  var counts = useMemo(function() {
    return {
      all: rows.length,
      low: rows.filter(function(r) { return r.status === 'low'; }).length,
      out: rows.filter(function(r) { return r.status === 'out'; }).length,
      tracked: rows.filter(function(r) { return r.tracked; }).length,
    };
  }, [rows]);

  var filtered = useMemo(function() {
    var q = search.trim().toLowerCase();
    var list = rows.filter(function(r) {
      if (listTab === 'low' && r.status !== 'low') return false;
      if (listTab === 'out' && r.status !== 'out') return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (q) {
        if (r.product.toLowerCase().includes(q)) return true;
        return r.skuCodes.some(function(c) { return c.toLowerCase().includes(q); });
      }
      return true;
    });
    list = list.slice().sort(function(a, b) {
      var c = 0;
      if (sortKey === 'name') {
        // sản phẩm đang theo dõi tồn lên trước, chưa theo dõi xuống cuối (rồi theo tên)
        if (a.tracked !== b.tracked) return a.tracked ? -1 : 1;
        c = a.product.localeCompare(b.product, 'vi');
      }
      else if (sortKey === 'total') c = a.total - b.total;
      else c = a.updated.localeCompare(b.updated);
      return c * sortDir;
    });
    return list;
  }, [rows, listTab, statusFilter, search, sortKey, sortDir]);

  var pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  var curPage = Math.min(page, pageCount);
  var pageRows = filtered.slice((curPage - 1) * pageSize, curPage * pageSize);

  var comboStocks = useMemo(function() {
    var combos = getAllComboSkus();
    var wh = selectedWh === 'ALL' ? undefined : selectedWh;
    return combos.map(function(combo) {
      var componentStocks = combo.items.map(function(item) {
        var stock = getCurrentStock(inv, item.product, wh);
        return { product: item.product, quantity: item.quantity, stock: stock, available: Math.floor(stock / item.quantity) };
      });
      var canMake = Math.min.apply(null, componentStocks.map(function(c) { return c.available; }));
      return { code: combo.code, items: componentStocks, canMake: Math.max(0, canMake) };
    }).filter(function(c) {
      var q = search.trim().toLowerCase();
      return !q || c.code.toLowerCase().includes(q) || c.items.some(function(i) { return i.product.toLowerCase().includes(q); });
    });
  }, [inv, selectedWh, skuVer, search]);

  if (!currentUser || currentUser.role !== 'admin') {
    return <div className="p-6 text-red-400">Bạn không có quyền truy cập trang này.</div>;
  }

  function showSuccess(msg: string) { setSuccessMsg(msg); setTimeout(function() { setSuccessMsg(''); }, 3000); }
  function formatNum(n: number): string { return n.toLocaleString('vi-VN'); }
  function fmtDate(d: string): string { var p = d.split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : d; }

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === 1 ? -1 : 1);
    else { setSortKey(k); setSortDir(k === 'name' ? 1 : -1); }
    setPage(1);
  }

  // Mở cửa sổ thao tác, có thể nạp sẵn một sản phẩm và kho
  function openOp(tab: ActionTab, product?: string, wh?: Warehouse) {
    var w = wh || opWh;
    setActiveTab(tab); setOpWh(w); setOpSearch(''); setOpNote('');
    if (product) {
      var qty = tab === 'audit' ? getCurrentStock(inv, product, w) : 0;
      if (tab === 'config') { var cfg = getWarehouseConfig(inv, product, w); qty = cfg ? cfg.initialStock : 0; if (cfg) { setConfigThreshold(cfg.alertThreshold); setConfigLeadTime(cfg.leadTimeDays || 10); } }
      setBatchItems([{ product: product, quantity: qty }]);
    } else {
      setBatchItems([]);
    }
    setOpOpen(true);
  }

  function handleAddToBatch(product: string) {
    if (batchItems.find(function(b) { return b.product === product; })) return;
    var defaultQty = 0;
    if (activeTab === 'audit') defaultQty = getCurrentStock(inv, product, opWh);
    setBatchItems(batchItems.concat([{ product: product, quantity: defaultQty }]));
    setOpSearch(''); setOpShowDropdown(false);
  }

  function handleRemoveFromBatch(product: string) {
    setBatchItems(batchItems.filter(function(b) { return b.product !== product; }));
  }

  function handleBatchQtyChange(product: string, qty: number) {
    setBatchItems(batchItems.map(function(b) { return b.product !== product ? b : { product: b.product, quantity: qty }; }));
  }

  function handleSubmitBatch() {
    if (batchItems.length === 0) return;
    var validItems = batchItems.filter(function(b) { return b.quantity > 0 || activeTab === 'audit'; });
    if (validItems.length === 0 && activeTab !== 'audit') { alert('Vui lòng nhập số lượng > 0'); return; }

    var updated: InventoryData = { products: JSON.parse(JSON.stringify(inv.products)), transactions: inv.transactions.slice() };
    var count = 0;
    var whLabel = WAREHOUSE_LABELS[opWh];

    if (activeTab === 'import') {
      validItems.forEach(function(item) {
        updated.transactions = updated.transactions.concat([{
          id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
          date: new Date().toISOString().slice(0, 10),
          product: item.product, quantity: item.quantity, type: 'import',
          note: opNote || 'Nhập kho', warehouse: opWh,
        }]);
        count++;
      });
      setInv(saveInventory(updated));
      showSuccess('Đã nhập ' + whLabel + ': ' + count + ' sản phẩm');
    } else if (activeTab === 'export') {
      validItems.forEach(function(item) {
        updated.transactions = updated.transactions.concat([{
          id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
          date: new Date().toISOString().slice(0, 10),
          product: item.product, quantity: -item.quantity, type: 'adjust',
          note: opNote || 'Trừ kho thủ công', warehouse: opWh,
        }]);
        count++;
      });
      setInv(saveInventory(updated));
      showSuccess('Đã trừ ' + whLabel + ': ' + count + ' sản phẩm');
    } else if (activeTab === 'audit') {
      batchItems.forEach(function(item) {
        var current = getCurrentStock(updated, item.product, opWh);
        var diff = item.quantity - current;
        if (diff === 0) return;
        updated.transactions = updated.transactions.concat([{
          id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
          date: new Date().toISOString().slice(0, 10),
          product: item.product, quantity: diff, type: 'adjust',
          note: (opNote || 'Kiểm kho') + ' (trước: ' + current + ' → sau: ' + item.quantity + ')', warehouse: opWh,
        }]);
        count++;
      });
      setInv(saveInventory(updated));
      showSuccess(count > 0 ? 'Đã cân đối ' + whLabel + ': ' + count + ' SP' : 'Tồn kho khớp');
    } else if (activeTab === 'config') {
      batchItems.forEach(function(item) {
        if (!updated.products[item.product]) updated.products[item.product] = {};
        updated.products[item.product][opWh] = { initialStock: item.quantity, alertThreshold: configThreshold, leadTimeDays: configLeadTime };
        if (item.quantity > 0) {
          updated.transactions = updated.transactions.concat([makeStockBaselineTx(item.product, opWh, toDateString(new Date()), 'Mốc tồn đầu')]);
        }
        count++;
      });
      setInv(saveInventory(updated));
      showSuccess('Đã cài đặt ' + whLabel + ': ' + count + ' sản phẩm');
    }
    setBatchItems([]); setOpNote(''); setOpOpen(false);
  }

  function handleExcelFile(e: React.ChangeEvent<HTMLInputElement>) {
    var file = e.target.files?.[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(evt) {
      try {
        var data = new Uint8Array(evt.target?.result as ArrayBuffer);
        var wb = XLSX.read(data, { type: 'array' });
        var ws = wb.Sheets[wb.SheetNames[0]];
        var json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
        if (json.length === 0) { alert('File rỗng hoặc không đọc được'); return; }

        var productSet = new Set(allProducts.map(function(p) { return p.toLowerCase(); }));
        var productMap: Record<string, string> = {};
        allProducts.forEach(function(p) { productMap[p.toLowerCase()] = p; });

        var headers = Object.keys(json[0]);
        var productKeys = ['Sản phẩm', 'Product', 'Tên sản phẩm', 'Tên SP'];
        var foundProductKey = '';
        productKeys.forEach(function(k) { if (!foundProductKey && headers.some(function(h) { return h.toLowerCase() === k.toLowerCase(); })) foundProductKey = headers.find(function(h) { return h.toLowerCase() === k.toLowerCase(); }) || ''; });
        if (!foundProductKey) { alert('Không tìm thấy cột "Sản phẩm" trong file.\nCác cột có: ' + headers.join(', ')); return; }

        var hcmKey: string | undefined = headers.find(function(h) { return h === 'Tồn HCM'; });
        var hnKey: string | undefined = headers.find(function(h) { return h === 'Tồn HN'; });
        var isDual = !!(hcmKey && hnKey);

        if (!isDual) {
          var qtyKeys = ['Số lượng', 'SL nhập', 'SL', 'Quantity', 'Qty', 'Tồn hiện tại', 'Tồn HCM', 'Tồn HN', 'Tổng'];
          var foundQtyKey = '';
          qtyKeys.forEach(function(k) { if (!foundQtyKey && headers.some(function(h) { return h.toLowerCase() === k.toLowerCase(); })) foundQtyKey = headers.find(function(h) { return h.toLowerCase() === k.toLowerCase(); }) || ''; });
          if (!foundQtyKey) { alert('Không tìm thấy cột số lượng trong file.\nCần có: Số lượng, SL nhập, Tồn HCM, Tồn HN...\nCác cột có: ' + headers.join(', ')); return; }
          hcmKey = foundQtyKey;
        }

        var items = json.map(function(row) {
          var name = String(row[foundProductKey] || '').trim();
          var qHCM = Math.max(0, Math.round(Number(row[hcmKey!]) || 0));
          var qHN = isDual ? Math.max(0, Math.round(Number(row[hnKey!]) || 0)) : 0;
          var matched = productSet.has(name.toLowerCase());
          return { product: matched ? productMap[name.toLowerCase()] : name, qtyHCM: qHCM, qtyHN: qHN, matched: matched };
        }).filter(function(item) { return item.product && (item.qtyHCM > 0 || item.qtyHN > 0); });

        if (items.length === 0) { alert('Không có sản phẩm nào với số lượng > 0 trong file'); return; }
        setExcelDualMode(isDual);
        setExcelPreview(items);
      } catch (err) {
        alert('Lỗi đọc file: ' + (err instanceof Error ? err.message : 'Unknown'));
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  function confirmExcelImport() {
    if (!excelPreview) return;
    var matched = excelPreview.filter(function(item) { return item.matched; });
    if (matched.length === 0) { alert('Không có sản phẩm nào khớp với danh sách'); return; }
    var updated: InventoryData = { products: JSON.parse(JSON.stringify(inv.products)), transactions: inv.transactions.slice() };
    matched.forEach(function(item) {
      if (item.qtyHCM > 0) {
        updated.transactions = updated.transactions.concat([{
          id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
          date: new Date().toISOString().slice(0, 10),
          product: item.product, quantity: item.qtyHCM, type: 'import',
          note: 'Nhập từ Excel', warehouse: excelDualMode ? 'HCM' as Warehouse : opWh,
        }]);
      }
      if (excelDualMode && item.qtyHN > 0) {
        updated.transactions = updated.transactions.concat([{
          id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
          date: new Date().toISOString().slice(0, 10),
          product: item.product, quantity: item.qtyHN, type: 'import',
          note: 'Nhập từ Excel', warehouse: 'HN' as Warehouse,
        }]);
      }
    });
    setInv(saveInventory(updated));
    setExcelPreview(null);
    var whInfo = excelDualMode ? 'Kho HCM + Kho HN' : WAREHOUSE_LABELS[opWh];
    showSuccess('Đã nhập ' + whInfo + ': ' + matched.length + ' sản phẩm từ Excel');
  }

  function exportExcel() {
    var data = filtered.map(function(row) {
      var base: Record<string, unknown> = { 'Sản phẩm': row.product, 'Mã SKU': row.skuCodes.join(', ') };
      if (selectedWh === 'ALL') {
        base['Tồn HCM'] = row.hcm === null ? '' : row.hcm;
        base['Tồn HN'] = row.hn === null ? '' : row.hn;
        base['Tổng'] = row.total;
      } else {
        base['Tồn ' + selectedWh] = row.total;
      }
      base['Ngưỡng cảnh báo'] = row.threshold > 0 ? row.threshold : '';
      base['Trạng thái'] = row.status === 'ok' ? 'OK' : row.status === 'low' ? 'Thấp' : row.status === 'out' ? 'Hết' : '—';
      base['Cập nhật'] = row.updated;
      return base;
    });
    var ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = Object.keys(data[0] || {}).map(function(key) {
      var maxLen = key.length;
      data.forEach(function(r) { var v = String(r[key] ?? ''); if (v.length > maxLen) maxLen = v.length; });
      return { wch: Math.min(maxLen + 2, 40) };
    });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, selectedWh === 'ALL' ? 'Tổng hợp' : 'Kho ' + selectedWh);
    XLSX.writeFile(wb, 'Ton_kho_' + (selectedWh === 'ALL' ? 'tong_hop' : selectedWh) + '_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  }

  var tabConfig = {
    import: { label: 'Nhập kho', color: 'emerald', qtyLabel: 'SL nhập', notePlaceholder: 'VD: Nhập từ NCC tháng 8', btnLabel: 'Nhập kho', btnClass: 'bg-emerald-600 hover:bg-emerald-500' },
    export: { label: 'Trừ kho', color: 'red', qtyLabel: 'SL trừ', notePlaceholder: 'VD: Hàng lỗi, trả NCC', btnLabel: 'Trừ kho', btnClass: 'bg-red-600 hover:bg-red-500' },
    audit: { label: 'Kiểm kho', color: 'purple', qtyLabel: 'Thực tế', notePlaceholder: 'VD: Kiểm kho tháng 8', btnLabel: 'Cân đối', btnClass: 'bg-purple-600 hover:bg-purple-500' },
    config: { label: 'Cài đặt tồn', color: 'blue', qtyLabel: 'Tồn đầu', notePlaceholder: '', btnLabel: 'Lưu cài đặt', btnClass: 'bg-blue-600 hover:bg-blue-500' },
  };
  var tc = tabConfig[activeTab];

  var drawerTxs = drawerProduct ? getProductTransactions(inv, drawerProduct, selectedWh === 'ALL' ? undefined : selectedWh) : [];
  var inputCls = 'px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none';

  function stockCell(v: number | null, wh: Warehouse, product: string) {
    if (v === null) return <span className="text-gray-600">—</span>;
    var cfg = getWarehouseConfig(inv, product, wh);
    var st = getStockStatus(v, cfg ? cfg.alertThreshold : 0);
    return <span className={st === 'out' ? 'text-red-400 font-semibold' : st === 'low' ? 'text-amber-400 font-semibold' : 'text-gray-100'}>{formatNum(v)}</span>;
  }

  function statusBadge(s: Row['status']) {
    if (s === 'out') return <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-red-500/15 text-red-400">Hết hàng</span>;
    if (s === 'low') return <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-amber-500/15 text-amber-400">Sắp hết</span>;
    if (s === 'ok') return <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/15 text-emerald-400">Còn hàng</span>;
    return <span className="text-xs text-gray-600">Chưa theo dõi</span>;
  }

  function sortMark(k: SortKey) { return sortKey === k ? (sortDir === 1 ? ' ▲' : ' ▼') : ''; }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Tiêu đề + thao tác chính (kiểu Sapo) */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Quản lý kho</h1>
          <p className="text-sm text-gray-500 mt-1">{counts.tracked}/{counts.all} sản phẩm đang theo dõi tồn · {inv.transactions.length} giao dịch</p>
        </div>
        <button onClick={function() { openOp('import'); }}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg">+ Nhập kho</button>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4 text-sm">
        <button onClick={function() { openOp('audit'); }} className="text-gray-300 hover:text-blue-400">📋 Kiểm kho</button>
        <button onClick={function() { openOp('export'); }} className="text-gray-300 hover:text-blue-400">➖ Trừ kho</button>
        <button onClick={function() { openOp('config'); }} className="text-gray-300 hover:text-blue-400">⚙️ Cài đặt tồn</button>
        <input ref={excelInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelFile} className="hidden" />
        <button onClick={function() { excelInputRef.current?.click(); }} className="text-gray-300 hover:text-blue-400">📥 Nhập từ Excel</button>
        <button onClick={exportExcel} className="text-gray-300 hover:text-blue-400">📤 Xuất Excel</button>
      </div>

      {successMsg && (
        <div className="mb-4 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-sm text-emerald-400">{successMsg}</div>
      )}

      <div className="bg-slate-900 border border-slate-700/60 rounded-xl overflow-hidden">
        {/* Tab danh sách */}
        <div className="flex flex-wrap border-b border-slate-700/60 px-2">
          {([
            ['all', 'Tất cả sản phẩm', counts.all],
            ['low', 'Sắp hết hàng', counts.low],
            ['out', 'Hết hàng', counts.out],
            ['combo', 'Combo', comboStocks.length],
          ] as Array<[ListTab, string, number]>).map(function(t) {
            return (
              <button key={t[0]} onClick={function() { setListTab(t[0]); setPage(1); }}
                className={'px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ' + (listTab === t[0] ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200')}>
                {t[1]} <span className="ml-1 text-xs text-gray-500">{t[2]}</span>
              </button>
            );
          })}
        </div>

        {/* Bộ lọc */}
        <div className="flex flex-wrap items-center gap-3 p-4">
          <input type="text" value={search} onChange={function(e) { setSearch(e.target.value); setPage(1); }}
            placeholder="🔍 Tìm theo mã sản phẩm, tên sản phẩm"
            className={inputCls + ' flex-1 min-w-[220px]'} />
          <select value={selectedWh} onChange={function(e) { setSelectedWh(e.target.value as Warehouse | 'ALL'); setPage(1); }} className={inputCls}>
            <option value="ALL">Tất cả chi nhánh</option>
            {WAREHOUSES.map(function(w) { return <option key={w} value={w}>{WAREHOUSE_LABELS[w]}</option>; })}
          </select>
          {listTab === 'all' && (
            <select value={statusFilter} onChange={function(e) { setStatusFilter(e.target.value as StatusFilter); setPage(1); }} className={inputCls}>
              <option value="all">Mọi trạng thái</option>
              <option value="ok">Còn hàng</option>
              <option value="low">Sắp hết</option>
              <option value="out">Hết hàng</option>
              <option value="unset">Chưa theo dõi</option>
            </select>
          )}
        </div>

        {listTab !== 'combo' ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800/70 text-xs text-gray-400 border-y border-slate-700/60">
                    <th className="px-4 py-3 text-left w-14">Ảnh</th>
                    <th className="px-4 py-3 text-left cursor-pointer select-none" onClick={function() { toggleSort('name'); }}>Tên sản phẩm{sortMark('name')}</th>
                    {selectedWh === 'ALL' ? (
                      <>
                        <th className="px-4 py-3 text-right text-blue-300">Tồn HCM</th>
                        <th className="px-4 py-3 text-right text-violet-300">Tồn Hà Nội</th>
                        <th className="px-4 py-3 text-right cursor-pointer select-none" onClick={function() { toggleSort('total'); }}>Tổng tồn{sortMark('total')}</th>
                      </>
                    ) : (
                      <th className="px-4 py-3 text-right cursor-pointer select-none" onClick={function() { toggleSort('total'); }}>Tồn kho ({WAREHOUSE_LABELS[selectedWh]}){sortMark('total')}</th>
                    )}
                    <th className="px-4 py-3 text-right">Ngưỡng cảnh báo</th>
                    <th className="px-4 py-3 text-center">Trạng thái</th>
                    <th className="px-4 py-3 text-right cursor-pointer select-none" onClick={function() { toggleSort('updated'); }}>Cập nhật{sortMark('updated')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {pageRows.map(function(r) {
                    return (
                      <tr key={r.product} onClick={function() { setDrawerProduct(r.product); }} className="hover:bg-slate-800/50 cursor-pointer">
                        <td className="px-4 py-2.5">
                          <div className="w-10 h-10 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center text-gray-600 text-lg">📦</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="text-blue-300 font-medium">{r.product}</div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {r.skuCodes.slice(0, 4).map(function(c) { return <code key={c} className="px-1.5 py-0.5 bg-slate-800 rounded text-xs text-gray-400 font-mono">{c}</code>; })}
                            {r.skuCodes.length > 4 && <span className="text-xs text-gray-500">+{r.skuCodes.length - 4}</span>}
                          </div>
                        </td>
                        {selectedWh === 'ALL' ? (
                          <>
                            <td className="px-4 py-2.5 text-right">{stockCell(r.hcm, 'HCM', r.product)}</td>
                            <td className="px-4 py-2.5 text-right">{stockCell(r.hn, 'HN', r.product)}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-gray-100">{(r.hcm !== null || r.hn !== null) ? formatNum(r.total) : <span className="text-gray-600">—</span>}</td>
                          </>
                        ) : (
                          <td className="px-4 py-2.5 text-right font-semibold">{stockCell(selectedWh === 'HCM' ? r.hcm : r.hn, selectedWh, r.product)}</td>
                        )}
                        <td className="px-4 py-2.5 text-right text-gray-400">{r.threshold > 0 ? formatNum(r.threshold) : <span className="text-gray-600">—</span>}</td>
                        <td className="px-4 py-2.5 text-center">{statusBadge(r.status)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-400">{r.updated ? fmtDate(r.updated) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="text-center py-10 text-gray-500 text-sm">Không có sản phẩm phù hợp</div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-700/60 text-sm text-gray-400">
              <div>Hiển thị {filtered.length === 0 ? 0 : (curPage - 1) * pageSize + 1}–{Math.min(curPage * pageSize, filtered.length)} / {filtered.length} sản phẩm</div>
              <div className="flex items-center gap-3">
                <select value={pageSize} onChange={function(e) { setPageSize(Number(e.target.value)); setPage(1); }} className={inputCls + ' py-1'}>
                  {PAGE_SIZES.map(function(n) { return <option key={n} value={n}>{n} dòng/trang</option>; })}
                </select>
                <button disabled={curPage <= 1} onClick={function() { setPage(curPage - 1); }} className="px-3 py-1 border border-slate-600 rounded-md disabled:opacity-40 hover:bg-slate-800">‹</button>
                <span>{curPage}/{pageCount}</span>
                <button disabled={curPage >= pageCount} onClick={function() { setPage(curPage + 1); }} className="px-3 py-1 border border-slate-600 rounded-md disabled:opacity-40 hover:bg-slate-800">›</button>
              </div>
            </div>
          </>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800/70 text-xs text-gray-400 border-y border-slate-700/60">
                  <th className="px-4 py-3 text-left">Mã combo</th>
                  <th className="px-4 py-3 text-left">Thành phần (tồn từng sản phẩm)</th>
                  <th className="px-4 py-3 text-right">Có thể bán</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {comboStocks.map(function(combo) {
                  var status = combo.canMake <= 0 ? 'out' : combo.canMake <= 10 ? 'low' : 'ok';
                  return (
                    <tr key={combo.code} className="hover:bg-slate-800/50">
                      <td className="px-4 py-3"><code className="px-2 py-0.5 bg-slate-800 rounded text-xs text-blue-300 font-mono">{combo.code}</code></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {combo.items.map(function(c, i) {
                            var isMin = c.available === combo.canMake;
                            return <span key={c.product + i} className={'text-xs ' + (isMin ? 'text-amber-400 font-medium' : 'text-gray-400')}>{c.product}: {formatNum(c.stock)}{c.quantity > 1 ? ' (x' + c.quantity + ')' : ''}</span>;
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right"><span className={'font-bold ' + (status === 'out' ? 'text-red-400' : status === 'low' ? 'text-amber-400' : 'text-emerald-400')}>{formatNum(combo.canMake)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {comboStocks.length === 0 && <div className="text-center py-10 text-gray-500 text-sm">Không có combo phù hợp</div>}
          </div>
        )}
      </div>

      {/* Ngăn chi tiết sản phẩm (bên phải) */}
      {drawerProduct && (function() {
        var codes = productSkuMap[drawerProduct] || [];
        return (
          <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={function() { setDrawerProduct(null); }}>
            <div className="w-full max-w-xl h-full bg-slate-900 border-l border-slate-700 overflow-y-auto" onClick={function(e) { e.stopPropagation(); }}>
              <div className="px-5 py-4 border-b border-slate-700 flex items-start justify-between gap-3 sticky top-0 bg-slate-900 z-10">
                <div>
                  <h2 className="text-lg font-semibold text-gray-100">{drawerProduct}</h2>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {codes.map(function(c) { return <code key={c} className="px-1.5 py-0.5 bg-slate-800 rounded text-xs text-gray-400 font-mono">{c}</code>; })}
                  </div>
                </div>
                <button onClick={function() { setDrawerProduct(null); }} className="text-gray-500 hover:text-gray-200 text-xl">✕</button>
              </div>
              <div className="p-5 space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  {WAREHOUSES.map(function(w) {
                    var cfg = getWarehouseConfig(inv, drawerProduct as string, w);
                    var cur = getCurrentStock(inv, drawerProduct as string, w);
                    var tracked = !!(cfg && cfg.initialStock > 0);
                    var st = tracked ? getStockStatus(cur, cfg ? cfg.alertThreshold : 0) : 'unset';
                    return (
                      <div key={w} className={'rounded-xl border p-4 ' + (w === 'HCM' ? 'border-blue-500/30 bg-blue-500/5' : 'border-violet-500/30 bg-violet-500/5')}>
                        <div className="text-xs text-gray-400">{WAREHOUSE_LABELS[w]}</div>
                        <div className={'text-2xl font-bold mt-1 ' + (st === 'out' ? 'text-red-400' : st === 'low' ? 'text-amber-400' : 'text-gray-100')}>{tracked || cur !== 0 ? formatNum(cur) : '—'}</div>
                        <div className="text-xs text-gray-500 mt-1">{tracked ? 'Ngưỡng cảnh báo: ' + formatNum(cfg ? cfg.alertThreshold : 0) : 'Chưa theo dõi tồn'}</div>
                        <div className="flex flex-wrap gap-2 mt-3">
                          <button onClick={function() { setDrawerProduct(null); openOp('import', drawerProduct as string, w); }} className="px-2.5 py-1 text-xs rounded-md bg-emerald-600/80 hover:bg-emerald-500 text-white">Nhập</button>
                          <button onClick={function() { setDrawerProduct(null); openOp('audit', drawerProduct as string, w); }} className="px-2.5 py-1 text-xs rounded-md bg-purple-600/80 hover:bg-purple-500 text-white">Kiểm kho</button>
                          <button onClick={function() { setDrawerProduct(null); openOp('config', drawerProduct as string, w); }} className="px-2.5 py-1 text-xs rounded-md border border-slate-600 text-gray-300 hover:bg-slate-800">Cài đặt</button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-200 mb-2">Lịch sử giao dịch {selectedWh !== 'ALL' ? '(' + WAREHOUSE_LABELS[selectedWh] + ')' : ''}</h3>
                  {drawerTxs.length === 0 ? (
                    <div className="text-sm text-gray-500 py-4 text-center">Chưa có giao dịch</div>
                  ) : (
                    <div className="border border-slate-700 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-800/80 text-xs text-gray-400">
                            <th className="text-left px-3 py-2">Ngày</th><th className="text-center px-3 py-2">Kho</th><th className="text-center px-3 py-2">Loại</th>
                            <th className="text-right px-3 py-2">SL</th><th className="text-left px-3 py-2">Ghi chú</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {drawerTxs.slice(0, 100).map(function(tx) {
                            var isIn = tx.quantity > 0;
                            return (
                              <tr key={tx.id}>
                                <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{fmtDate(tx.date)}</td>
                                <td className="px-3 py-2 text-center"><span className={'inline-flex px-1.5 py-0.5 rounded text-xs font-medium ' + (tx.warehouse === 'HN' ? 'bg-violet-500/15 text-violet-400' : 'bg-blue-500/15 text-blue-400')}>{tx.warehouse === 'HN' ? 'HN' : 'HCM'}</span></td>
                                <td className="px-3 py-2 text-center"><span className={'inline-flex px-2 py-0.5 rounded text-xs font-medium ' + (tx.type === 'import' ? 'bg-emerald-500/15 text-emerald-400' : tx.type === 'sale' ? 'bg-orange-500/15 text-orange-400' : 'bg-purple-500/15 text-purple-400')}>{tx.type === 'import' ? 'Nhập' : tx.type === 'sale' ? 'Bán' : tx.type === 'initial' ? 'Mốc tồn' : 'Đ.chỉnh'}</span></td>
                                <td className={'px-3 py-2 text-right font-semibold ' + (isIn ? 'text-emerald-400' : tx.quantity < 0 ? 'text-red-400' : 'text-gray-500')}>{isIn ? '+' : ''}{formatNum(tx.quantity)}</td>
                                <td className="px-3 py-2 text-gray-400 text-xs">{tx.note}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Cửa sổ thao tác kho */}
      {opOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto" onClick={function() { setOpOpen(false); }}>
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-xl mt-10 mb-10" onClick={function(e) { e.stopPropagation(); }}>
            <div className="flex border-b border-slate-700/60">
              {(['import', 'export', 'audit', 'config'] as ActionTab[]).map(function(tab) {
                var isActive = activeTab === tab;
                return (
                  <button key={tab} onClick={function() { setActiveTab(tab); setBatchItems([]); setOpSearch(''); setOpNote(''); }}
                    className={'flex-1 px-4 py-3 text-sm font-medium transition-colors ' + (isActive ? 'text-blue-400 bg-blue-500/10 border-b-2 border-blue-400' : 'text-gray-500 hover:text-gray-300 hover:bg-slate-800/50')}>
                    {tabConfig[tab].label}
                  </button>
                );
              })}
              <button onClick={function() { setOpOpen(false); }} className="px-4 text-gray-500 hover:text-gray-200 text-xl">✕</button>
            </div>

            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs text-gray-400">Chi nhánh:</span>
                <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5">
                  {WAREHOUSES.map(function(wh) {
                    return (
                      <button key={wh} onClick={function() { setOpWh(wh); setBatchItems([]); }}
                        className={'px-3 py-1.5 rounded-md text-sm font-medium transition-colors ' + (opWh === wh ? (wh === 'HCM' ? 'bg-blue-600 text-white' : 'bg-violet-600 text-white') : 'text-gray-400 hover:text-gray-200')}>
                        {WAREHOUSE_LABELS[wh]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mb-4" ref={searchRef}>
                <label className="block text-xs text-gray-400 mb-1.5">Tìm sản phẩm hoặc mã SKU</label>
                <div className="relative">
                  <input type="text" value={opSearch}
                    onChange={function(e) { setOpSearch(e.target.value); setOpShowDropdown(true); }}
                    onFocus={function() { if (opSearch.trim()) setOpShowDropdown(true); }}
                    placeholder="Gõ tên sản phẩm hoặc mã SKU để thêm..."
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none" />
                  {opShowDropdown && opResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                      {opResults.map(function(product) {
                        var codes = productSkuMap[product] || [];
                        var current = getCurrentStock(inv, product, opWh);
                        var cfg = getWarehouseConfig(inv, product, opWh);
                        return (
                          <button key={product} onClick={function() { handleAddToBatch(product); }}
                            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-700 transition-colors text-left border-b border-slate-700/50 last:border-0">
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-gray-200">{product}</span>
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {codes.slice(0, 3).map(function(c) { return <code key={c} className="px-1 py-0.5 bg-slate-900 rounded text-xs text-blue-300 font-mono">{c}</code>; })}
                                {codes.length > 3 && <span className="text-xs text-gray-500">+{codes.length - 3}</span>}
                              </div>
                            </div>
                            <div className="text-right ml-3 shrink-0">
                              {cfg && cfg.initialStock > 0 ? <span className="text-xs text-gray-400">{WAREHOUSE_LABELS[opWh]}: {formatNum(current)}</span> : <span className="text-xs text-gray-600">Chưa cài đặt</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {batchItems.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs text-gray-400 mb-2">Đã chọn ({batchItems.length} SP) — {WAREHOUSE_LABELS[opWh]}</div>
                  <div className="space-y-2">
                    {batchItems.map(function(item) {
                      var current = getCurrentStock(inv, item.product, opWh);
                      var codes = productSkuMap[item.product] || [];
                      return (
                        <div key={item.product} className="flex items-center gap-3 bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-gray-200">{item.product}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {codes.slice(0, 2).map(function(c) { return <code key={c} className="px-1 py-0.5 bg-slate-900 rounded text-xs text-blue-300 font-mono">{c}</code>; })}
                              {codes.length > 2 && <span className="text-xs text-gray-500">+{codes.length - 2}</span>}
                              <span className="text-xs text-gray-500">· Tồn {WAREHOUSE_LABELS[opWh]}: {formatNum(current)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <label className="text-xs text-gray-500">{tc.qtyLabel}:</label>
                            <input type="number" min={0} value={item.quantity || ''}
                              onChange={function(e) { handleBatchQtyChange(item.product, parseInt(e.target.value) || 0); }}
                              className="w-24 px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-gray-200 text-center focus:border-blue-500 outline-none" />
                            {activeTab === 'import' && item.quantity > 0 && <span className="text-xs text-emerald-400">→ {formatNum(current + item.quantity)}</span>}
                            {activeTab === 'export' && item.quantity > 0 && <span className="text-xs text-red-400">→ {formatNum(current - item.quantity)}</span>}
                            {activeTab === 'audit' && (function() {
                              var diff = item.quantity - current;
                              if (diff === 0) return <span className="text-xs text-gray-500">khớp</span>;
                              return <span className={'text-xs ' + (diff > 0 ? 'text-emerald-400' : 'text-red-400')}>{diff > 0 ? '+' : ''}{formatNum(diff)}</span>;
                            })()}
                          </div>
                          <button onClick={function() { handleRemoveFromBatch(item.product); }} className="p-1 text-gray-500 hover:text-red-400" title="Xóa">✕</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {batchItems.length > 0 && (
                <div className="flex flex-wrap items-end gap-3">
                  {activeTab !== 'config' ? (
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-xs text-gray-400 mb-1">Ghi chú</label>
                      <input type="text" value={opNote} onChange={function(e) { setOpNote(e.target.value); }} className={inputCls + ' w-full'} placeholder={tc.notePlaceholder} />
                    </div>
                  ) : (
                    <>
                      <div className="w-40">
                        <label className="block text-xs text-gray-400 mb-1">Ngưỡng cảnh báo</label>
                        <input type="number" min={0} value={configThreshold} onChange={function(e) { setConfigThreshold(parseInt(e.target.value) || 0); }} className={inputCls + ' w-full'} />
                      </div>
                      <div className="w-40">
                        <label className="block text-xs text-gray-400 mb-1">Lead time (ngày)</label>
                        <input type="number" min={1} value={configLeadTime} onChange={function(e) { setConfigLeadTime(parseInt(e.target.value) || 10); }} className={inputCls + ' w-full'} />
                      </div>
                    </>
                  )}
                  <button onClick={handleSubmitBatch} className={'px-6 py-2 text-white rounded-lg text-sm font-medium transition-colors ' + tc.btnClass}>{tc.btnLabel} ({batchItems.length})</button>
                  <button onClick={function() { setOpOpen(false); }} className="px-4 py-2 text-gray-400 border border-slate-600 rounded-lg text-sm hover:bg-slate-800">Hủy</button>
                </div>
              )}

              {batchItems.length === 0 && !opSearch.trim() && (
                <p className="text-sm text-gray-600 text-center py-2">Gõ tên sản phẩm hoặc mã SKU ở ô tìm kiếm phía trên để bắt đầu</p>
              )}
            </div>
          </div>
        </div>
      )}

      {excelPreview && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-100">Xác nhận nhập kho từ Excel</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Nhập vào: <span className="text-blue-400 font-medium">{excelDualMode ? 'Kho HCM + Kho HN' : WAREHOUSE_LABELS[opWh]}</span> — {excelPreview.filter(function(i) { return i.matched; }).length}/{excelPreview.length} sản phẩm khớp
                </p>
              </div>
              <button onClick={function() { setExcelPreview(null); }} className="text-gray-500 hover:text-gray-300 text-xl">✕</button>
            </div>
            <div className="overflow-auto flex-1 px-6 py-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-slate-700">
                    <th className="pb-2 font-medium">Sản phẩm</th>
                    {excelDualMode ? (<><th className="pb-2 font-medium text-right">HCM</th><th className="pb-2 font-medium text-right">HN</th></>) : (<th className="pb-2 font-medium text-right">Số lượng</th>)}
                    <th className="pb-2 font-medium text-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {excelPreview.map(function(item, idx) {
                    return (
                      <tr key={idx} className={item.matched ? '' : 'opacity-50'}>
                        <td className="py-2 text-gray-200">{item.product}</td>
                        {excelDualMode ? (
                          <>
                            <td className="py-2 text-right text-blue-300">{item.qtyHCM > 0 ? item.qtyHCM.toLocaleString('vi-VN') : '—'}</td>
                            <td className="py-2 text-right text-violet-300">{item.qtyHN > 0 ? item.qtyHN.toLocaleString('vi-VN') : '—'}</td>
                          </>
                        ) : (<td className="py-2 text-right text-gray-300">{item.qtyHCM.toLocaleString('vi-VN')}</td>)}
                        <td className="py-2 text-center">
                          {item.matched
                            ? <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/15 text-emerald-400">Khớp</span>
                            : <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-red-500/15 text-red-400">Không tìm thấy</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-between">
              <p className="text-xs text-gray-500">Chỉ nhập các sản phẩm có trạng thái &quot;Khớp&quot;</p>
              <div className="flex gap-3">
                <button onClick={function() { setExcelPreview(null); }} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">Hủy</button>
                <button onClick={confirmExcelImport} disabled={excelPreview.filter(function(i) { return i.matched; }).length === 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg">
                  Nhập kho ({excelPreview.filter(function(i) { return i.matched; }).length} SP)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
