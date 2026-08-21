'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useAppState } from '@/lib/store';
import { getProductSkuCodes, getAllComboSkus } from '@/lib/sku';
import {
  loadInventory, saveInventory, getCurrentStock, getStockStatus,
  getProductTransactions, getLowStockProducts, getTrackedProducts,
  isProductTracked, getWarehouseConfig, getReorderAlerts,
  WAREHOUSES, WAREHOUSE_LABELS,
  type InventoryData, type InventoryTransaction, type Warehouse, type InventoryConfig, type ReorderAlert,
} from '@/lib/inventory';
import * as XLSX from 'xlsx';

type ActionTab = 'import' | 'export' | 'audit' | 'config';
interface BatchItem { product: string; quantity: number; }

export default function AdminInventoryPage() {
  const { currentUser } = useAppState();
  const [inv, setInv] = useState<InventoryData>({ products: {}, transactions: [] });
  const [tableSearch, setTableSearch] = useState('');
  const [showOnlyTracked, setShowOnlyTracked] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [historyProduct, setHistoryProduct] = useState<string | null>(null);

  const [selectedWh, setSelectedWh] = useState<Warehouse | 'ALL'>('ALL');
  const [activeTab, setActiveTab] = useState<ActionTab>('import');
  const [opWh, setOpWh] = useState<Warehouse>('HCM');
  const [opSearch, setOpSearch] = useState('');
  const [opShowDropdown, setOpShowDropdown] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [opNote, setOpNote] = useState('');
  const [configThreshold, setConfigThreshold] = useState(10);
  const searchRef = useRef<HTMLDivElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [excelPreview, setExcelPreview] = useState<Array<{ product: string; qtyHCM: number; qtyHN: number; matched: boolean }> | null>(null);
  const [excelDualMode, setExcelDualMode] = useState(false);

  useEffect(function() { setInv(loadInventory()); }, []);

  useEffect(function() {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setOpShowDropdown(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return function() { document.removeEventListener('mousedown', handleClickOutside); };
  }, []);

  var allProducts = useMemo(function() { return getTrackedProducts(); }, []);
  var productSkuMap = useMemo(function() { return getProductSkuCodes(); }, []);

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

  var productRows = useMemo(function() {
    var rows = allProducts.map(function(product) {
      var tracked = isProductTracked(inv, product);
      var skuCodes = productSkuMap[product] || [];

      if (selectedWh === 'ALL') {
        var totalInitial = 0; var totalCurrent = 0; var worstStatus = 'unset' as string;
        var totalThreshold = 0;
        WAREHOUSES.forEach(function(wh) {
          var cfg = getWarehouseConfig(inv, product, wh);
          var cur = getCurrentStock(inv, product, wh);
          if (cfg && cfg.initialStock > 0) {
            totalInitial += cfg.initialStock;
            totalThreshold += cfg.alertThreshold;
          }
          totalCurrent += cur;
          if (cur !== 0 || (cfg && cfg.initialStock > 0)) {
            var st = getStockStatus(cur, cfg ? cfg.alertThreshold : 0);
            if (st === 'out') worstStatus = 'out';
            else if (st === 'low' && worstStatus !== 'out') worstStatus = 'low';
            else if (worstStatus === 'unset') worstStatus = 'ok';
          }
        });
        return { product: product, initial: totalInitial, threshold: totalThreshold, current: totalCurrent, status: tracked ? worstStatus : 'unset', skuCodes: skuCodes, tracked: tracked };
      } else {
        var cfg = getWarehouseConfig(inv, product, selectedWh);
        var initial = cfg ? cfg.initialStock : 0;
        var threshold = cfg ? cfg.alertThreshold : 0;
        var current = getCurrentStock(inv, product, selectedWh);
        var status = (initial > 0 || current !== 0) ? getStockStatus(current, threshold) : 'unset';
        return { product: product, initial: initial, threshold: threshold, current: current, status: status, skuCodes: skuCodes, tracked: tracked };
      }
    });
    if (showOnlyTracked) rows = rows.filter(function(r) { return r.tracked; });
    if (tableSearch.trim()) {
      var q = tableSearch.trim().toLowerCase();
      rows = rows.filter(function(r) {
        if (r.product.toLowerCase().includes(q)) return true;
        return r.skuCodes.some(function(c) { return c.toLowerCase().includes(q); });
      });
    }
    return rows;
  }, [allProducts, inv, tableSearch, showOnlyTracked, productSkuMap, selectedWh]);

  var lowStockAlerts = useMemo(function() {
    return getLowStockProducts(inv, selectedWh === 'ALL' ? undefined : selectedWh);
  }, [inv, selectedWh]);

  var trackedCount = useMemo(function() {
    return allProducts.filter(function(p) { return isProductTracked(inv, p); }).length;
  }, [inv, allProducts]);

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
    });
  }, [inv, selectedWh]);

  var reorderAlerts = useMemo(function() {
    return getReorderAlerts(inv, selectedWh === 'ALL' ? undefined : selectedWh);
  }, [inv, selectedWh]);

  if (!currentUser || currentUser.role !== 'admin') {
    return <div className="p-6 text-red-400">Bạn không có quyền truy cập trang này.</div>;
  }

  function showSuccess(msg: string) { setSuccessMsg(msg); setTimeout(function() { setSuccessMsg(''); }, 3000); }
  function formatNum(n: number): string { return n.toLocaleString('vi-VN'); }

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
      saveInventory(updated); setInv(updated);
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
      saveInventory(updated); setInv(updated);
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
      saveInventory(updated); setInv(updated);
      showSuccess(count > 0 ? 'Đã cân đối ' + whLabel + ': ' + count + ' SP' : 'Tồn kho khớp');
    } else if (activeTab === 'config') {
      batchItems.forEach(function(item) {
        if (!updated.products[item.product]) updated.products[item.product] = {};
        updated.products[item.product][opWh] = { initialStock: item.quantity, alertThreshold: configThreshold };
        count++;
      });
      saveInventory(updated); setInv(updated);
      showSuccess('Đã cài đặt ' + whLabel + ': ' + count + ' sản phẩm');
    }
    setBatchItems([]); setOpNote('');
  }

  function handleSwitchTab(tab: ActionTab) { setActiveTab(tab); setBatchItems([]); setOpSearch(''); setOpNote(''); }

  var historyTxs = historyProduct ? getProductTransactions(inv, historyProduct, selectedWh === 'ALL' ? undefined : selectedWh) : [];
  var historyStock = historyProduct ? getCurrentStock(inv, historyProduct, selectedWh === 'ALL' ? undefined : selectedWh) : 0;

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
    var count = 0;
    matched.forEach(function(item) {
      if (item.qtyHCM > 0) {
        updated.transactions = updated.transactions.concat([{
          id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
          date: new Date().toISOString().slice(0, 10),
          product: item.product, quantity: item.qtyHCM, type: 'import',
          note: 'Nhập từ Excel', warehouse: excelDualMode ? 'HCM' as Warehouse : opWh,
        }]);
        count++;
      }
      if (excelDualMode && item.qtyHN > 0) {
        updated.transactions = updated.transactions.concat([{
          id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
          date: new Date().toISOString().slice(0, 10),
          product: item.product, quantity: item.qtyHN, type: 'import',
          note: 'Nhập từ Excel', warehouse: 'HN' as Warehouse,
        }]);
        count++;
      }
    });
    saveInventory(updated);
    setInv(updated);
    setExcelPreview(null);
    var whInfo = excelDualMode ? 'Kho HCM + Kho HN' : WAREHOUSE_LABELS[opWh];
    showSuccess('Đã nhập ' + whInfo + ': ' + matched.length + ' sản phẩm từ Excel');
  }

  function exportExcel() {
    var rows = productRows.map(function(row) {
      if (selectedWh === 'ALL') {
        var hcm = getCurrentStock(inv, row.product, 'HCM');
        var hn = getCurrentStock(inv, row.product, 'HN');
        return {
          'Sản phẩm': row.product,
          'Mã SKU': row.skuCodes.join(', '),
          'Tồn HCM': hcm,
          'Tồn HN': hn,
          'Tổng': hcm + hn,
          'Trạng thái': row.status === 'ok' ? 'OK' : row.status === 'low' ? 'Thấp' : row.status === 'out' ? 'Hết' : '—',
        };
      }
      return {
        'Sản phẩm': row.product,
        'Mã SKU': row.skuCodes.join(', '),
        'Tồn đầu': row.initial,
        'Tồn hiện tại': row.current,
        'Ngưỡng cảnh báo': row.threshold > 0 ? row.threshold : '',
        'Trạng thái': row.status === 'ok' ? 'OK' : row.status === 'low' ? 'Thấp' : row.status === 'out' ? 'Hết' : '—',
      };
    });
    var ws = XLSX.utils.json_to_sheet(rows);
    var colWidths = Object.keys(rows[0] || {}).map(function(key) {
      var maxLen = key.length;
      rows.forEach(function(r) { var v = String((r as Record<string, unknown>)[key] ?? ''); if (v.length > maxLen) maxLen = v.length; });
      return { wch: Math.min(maxLen + 2, 40) };
    });
    ws['!cols'] = colWidths;
    var wb = XLSX.utils.book_new();
    var sheetName = selectedWh === 'ALL' ? 'Tổng hợp' : 'Kho ' + selectedWh;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    var today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, 'Ton_kho_' + (selectedWh === 'ALL' ? 'tong_hop' : selectedWh) + '_' + today + '.xlsx');
  }

  var tabConfig = {
    import: { label: 'Nhập kho', color: 'emerald', qtyLabel: 'SL nhập', notePlaceholder: 'VD: Nhập từ NCC tháng 8', btnLabel: 'Nhập kho', btnClass: 'bg-emerald-600 hover:bg-emerald-500' },
    export: { label: 'Trừ kho', color: 'red', qtyLabel: 'SL trừ', notePlaceholder: 'VD: Hàng lỗi, trả NCC', btnLabel: 'Trừ kho', btnClass: 'bg-red-600 hover:bg-red-500' },
    audit: { label: 'Kiểm kho', color: 'purple', qtyLabel: 'Thực tế', notePlaceholder: 'VD: Kiểm kho tháng 8', btnLabel: 'Cân đối', btnClass: 'bg-purple-600 hover:bg-purple-500' },
    config: { label: 'Cài đặt tồn', color: 'blue', qtyLabel: 'Tồn đầu', notePlaceholder: '', btnLabel: 'Lưu cài đặt', btnClass: 'bg-blue-600 hover:bg-blue-500' },
  };
  var tc = tabConfig[activeTab];
  var borderColor = 'border-' + tc.color + '-500/30';

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Quản lý Kho</h1>
          <p className="text-sm text-gray-500 mt-1">{trackedCount}/{allProducts.length} sản phẩm đang theo dõi</p>
        </div>
        {/* Warehouse filter for table view */}
        <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
          <button onClick={function() { setSelectedWh('ALL'); }}
            className={'px-3 py-1.5 rounded-md text-sm font-medium transition-colors ' + (selectedWh === 'ALL' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200')}>
            Tất cả
          </button>
          {WAREHOUSES.map(function(wh) {
            return (
              <button key={wh} onClick={function() { setSelectedWh(wh); }}
                className={'px-3 py-1.5 rounded-md text-sm font-medium transition-colors ' + (selectedWh === wh
                  ? (wh === 'HCM' ? 'bg-blue-600 text-white' : 'bg-violet-600 text-white')
                  : 'text-gray-400 hover:text-gray-200')}>
                {WAREHOUSE_LABELS[wh]}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <input ref={excelInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelFile} className="hidden" />
          <button onClick={function() { excelInputRef.current?.click(); }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            Nhập từ Excel
          </button>
          <button onClick={exportExcel}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Xuất Excel
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="mb-4 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-sm text-emerald-400">{successMsg}</div>
      )}

      {/* Low stock alerts */}
      {lowStockAlerts.length > 0 && (
        <div className="mb-6 bg-slate-900 border border-red-500/30 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50">
            <h2 className="font-semibold text-red-400 text-sm">Cảnh báo tồn kho ({lowStockAlerts.length})</h2>
          </div>
          <div className="divide-y divide-slate-800">
            {lowStockAlerts.map(function(alert, idx) {
              return (
                <div key={alert.product + '-' + alert.warehouse + '-' + idx} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className={'inline-flex px-2 py-0.5 rounded text-xs font-bold ' + (
                      alert.status === 'out' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'
                    )}>{alert.status === 'out' ? 'HẾT HÀNG' : 'SẮP HẾT'}</span>
                    <span className="text-sm text-gray-200">{alert.product}</span>
                    <span className={'inline-flex px-1.5 py-0.5 rounded text-xs font-medium ' + (
                      alert.warehouse === 'HCM' ? 'bg-blue-500/15 text-blue-400' : 'bg-violet-500/15 text-violet-400'
                    )}>{WAREHOUSE_LABELS[alert.warehouse]}</span>
                  </div>
                  <span className={'text-sm font-semibold ' + (alert.status === 'out' ? 'text-red-400' : 'text-amber-400')}>
                    Còn {formatNum(alert.current)} (ngưỡng: {formatNum(alert.threshold)})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* === UNIFIED OPERATION PANEL === */}
      <div className={'mb-6 bg-slate-900 border rounded-xl overflow-hidden ' + borderColor}>
        <div className="flex border-b border-slate-700/50">
          {(['import', 'export', 'audit', 'config'] as ActionTab[]).map(function(tab) {
            var cfg = tabConfig[tab];
            var isActive = activeTab === tab;
            return (
              <button key={tab} onClick={function() { handleSwitchTab(tab); }}
                className={'flex-1 px-4 py-3 text-sm font-medium transition-colors ' + (
                  isActive ? 'text-' + cfg.color + '-400 bg-' + cfg.color + '-500/10 border-b-2 border-' + cfg.color + '-400' : 'text-gray-500 hover:text-gray-300 hover:bg-slate-800/50'
                )}>
                {cfg.label}
              </button>
            );
          })}
        </div>

        <div className="p-5">
          {/* Warehouse selector for operation */}
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs text-gray-400">Thao tác trên:</span>
            <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5">
              {WAREHOUSES.map(function(wh) {
                return (
                  <button key={wh} onClick={function() { setOpWh(wh); setBatchItems([]); }}
                    className={'px-3 py-1.5 rounded-md text-sm font-medium transition-colors ' + (opWh === wh
                      ? (wh === 'HCM' ? 'bg-blue-600 text-white' : 'bg-violet-600 text-white')
                      : 'text-gray-400 hover:text-gray-200')}>
                    {WAREHOUSE_LABELS[wh]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search */}
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
                          {cfg && cfg.initialStock > 0 ? (
                            <span className="text-xs text-gray-400">{WAREHOUSE_LABELS[opWh]}: {formatNum(current)}</span>
                          ) : (
                            <span className="text-xs text-gray-600">Chưa cài đặt</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Batch list */}
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
                      <button onClick={function() { handleRemoveFromBatch(item.product); }}
                        className="p-1 text-gray-500 hover:text-red-400 rounded transition-colors" title="Xóa">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Submit */}
          {batchItems.length > 0 && (
            <div className="flex flex-wrap items-end gap-3">
              {activeTab !== 'config' && (
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-gray-400 mb-1">Ghi chú</label>
                  <input type="text" value={opNote} onChange={function(e) { setOpNote(e.target.value); }}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none"
                    placeholder={tc.notePlaceholder} />
                </div>
              )}
              {activeTab === 'config' && (
                <div className="w-48">
                  <label className="block text-xs text-gray-400 mb-1">Ngưỡng cảnh báo</label>
                  <input type="number" min={0} value={configThreshold} onChange={function(e) { setConfigThreshold(parseInt(e.target.value) || 0); }}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none" />
                </div>
              )}
              <button onClick={handleSubmitBatch}
                className={'px-6 py-2 text-white rounded-lg text-sm font-medium transition-colors ' + tc.btnClass}>
                {tc.btnLabel} ({batchItems.length})
              </button>
              <button onClick={function() { setBatchItems([]); setOpNote(''); }}
                className="px-4 py-2 text-gray-400 border border-slate-600 rounded-lg text-sm hover:bg-slate-800 transition-colors">
                Hủy
              </button>
            </div>
          )}

          {batchItems.length === 0 && !opSearch.trim() && (
            <p className="text-sm text-gray-600 text-center py-2">Gõ tên sản phẩm hoặc mã SKU ở ô tìm kiếm phía trên để bắt đầu</p>
          )}
        </div>
      </div>

      {/* History */}
      {historyProduct && (
        <div className="mb-6 bg-slate-900 border border-slate-600 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-100 text-sm">Lịch sử: {historyProduct} {selectedWh !== 'ALL' ? '(' + WAREHOUSE_LABELS[selectedWh] + ')' : ''}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{historyTxs.length} giao dịch · Tồn: {formatNum(historyStock)}</p>
            </div>
            <button onClick={function() { setHistoryProduct(null); }} className="p-1.5 text-gray-500 hover:text-gray-300 rounded transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          {historyTxs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800/80 border-b border-slate-700/50">
                    <th className="text-left px-4 py-2.5 font-medium text-gray-400">Ngày</th>
                    <th className="text-center px-4 py-2.5 font-medium text-gray-400">Kho</th>
                    <th className="text-center px-4 py-2.5 font-medium text-gray-400">Loại</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-400">Số lượng</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-400">Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {historyTxs.map(function(tx) {
                    var isIn = tx.quantity > 0;
                    return (
                      <tr key={tx.id} className="hover:bg-slate-800/50">
                        <td className="px-4 py-2.5 text-gray-300">{tx.date}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={'inline-flex px-1.5 py-0.5 rounded text-xs font-medium ' + (
                            tx.warehouse === 'HN' ? 'bg-violet-500/15 text-violet-400' : 'bg-blue-500/15 text-blue-400'
                          )}>{tx.warehouse === 'HN' ? 'HN' : 'HCM'}</span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={'inline-flex px-2 py-0.5 rounded text-xs font-medium ' + (
                            tx.type === 'import' ? 'bg-emerald-500/15 text-emerald-400' :
                            tx.type === 'sale' ? 'bg-orange-500/15 text-orange-400' :
                            'bg-purple-500/15 text-purple-400'
                          )}>{tx.type === 'import' ? 'Nhập' : tx.type === 'sale' ? 'Bán' : 'Đ.chỉnh'}</span>
                        </td>
                        <td className={'px-4 py-2.5 text-right font-semibold ' + (isIn ? 'text-emerald-400' : 'text-red-400')}>
                          {isIn ? '+' : ''}{formatNum(tx.quantity)}
                        </td>
                        <td className="px-4 py-2.5 text-gray-400">{tx.note}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500 text-sm">Chưa có giao dịch</div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Đang theo dõi</p>
          <p className="text-2xl font-bold text-gray-100">{trackedCount}</p>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Tổng sản phẩm</p>
          <p className="text-2xl font-bold text-blue-400">{allProducts.length}</p>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Sắp hết hàng</p>
          <p className={'text-2xl font-bold ' + (lowStockAlerts.filter(function(a) { return a.status === 'low'; }).length > 0 ? 'text-amber-400' : 'text-gray-100')}>
            {lowStockAlerts.filter(function(a) { return a.status === 'low'; }).length}
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Hết hàng</p>
          <p className={'text-2xl font-bold ' + (lowStockAlerts.filter(function(a) { return a.status === 'out'; }).length > 0 ? 'text-red-400' : 'text-gray-100')}>
            {lowStockAlerts.filter(function(a) { return a.status === 'out'; }).length}
          </p>
        </div>
      </div>

      {/* Combo stock */}
      {comboStocks.length > 0 && (
        <div className="mb-6 bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50">
            <h2 className="font-semibold text-gray-100 text-sm">Tồn kho Combo ({comboStocks.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-slate-700/50">
                  <th className="px-5 py-3 font-medium">Mã combo</th>
                  <th className="px-4 py-3 font-medium">Thành phần</th>
                  <th className="px-4 py-3 font-medium text-right">Có thể bán</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {comboStocks.map(function(combo) {
                  var status = combo.canMake <= 0 ? 'out' : combo.canMake <= 10 ? 'low' : 'ok';
                  return (
                    <tr key={combo.code} className="hover:bg-slate-800/50">
                      <td className="px-5 py-3">
                        <code className="px-2 py-0.5 bg-slate-800 rounded text-xs text-blue-300 font-mono">{combo.code}</code>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {combo.items.map(function(c) {
                            var isMin = c.available === combo.canMake;
                            return (
                              <span key={c.product} className={'text-xs ' + (isMin ? 'text-amber-400 font-medium' : 'text-gray-400')}>
                                {c.product}: {c.stock.toLocaleString('vi-VN')}{c.quantity > 1 ? ' (x' + c.quantity + ')' : ''}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={'font-bold ' + (status === 'out' ? 'text-red-400' : status === 'low' ? 'text-amber-400' : 'text-emerald-400')}>
                          {combo.canMake.toLocaleString('vi-VN')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reorder alerts */}
      {reorderAlerts.length > 0 && (
        <div className="mb-6 bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex items-center gap-3">
            <span className="text-lg">&#9888;&#65039;</span>
            <h2 className="font-semibold text-gray-100 text-sm">Cảnh báo đặt hàng ({reorderAlerts.filter(function(a) { return a.urgency !== 'ok'; }).length} cần đặt)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-slate-700/50">
                  <th className="px-5 py-3 font-medium">Sản phẩm</th>
                  <th className="px-4 py-3 font-medium">Kho</th>
                  <th className="px-4 py-3 font-medium text-right">Tồn hiện tại</th>
                  <th className="px-4 py-3 font-medium text-right">Bán TB/ngày</th>
                  <th className="px-4 py-3 font-medium text-right">Còn bán được</th>
                  <th className="px-4 py-3 font-medium text-right">Cần đặt thêm</th>
                  <th className="px-4 py-3 font-medium text-center">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {reorderAlerts.map(function(alert) {
                  return (
                    <tr key={alert.product + '|' + alert.warehouse} className={'hover:bg-slate-800/50' + (alert.urgency === 'critical' ? ' bg-red-950/20' : alert.urgency === 'warning' ? ' bg-amber-950/20' : '')}>
                      <td className="px-5 py-3 text-gray-200">{alert.product}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{WAREHOUSE_LABELS[alert.warehouse]}</td>
                      <td className="px-4 py-3 text-right text-gray-200">{formatNum(alert.currentStock)}</td>
                      <td className="px-4 py-3 text-right text-gray-300">{alert.dailySales > 0 ? alert.dailySales.toFixed(1) : '—'}</td>
                      <td className={'px-4 py-3 text-right font-bold ' + (alert.urgency === 'critical' ? 'text-red-400' : alert.urgency === 'warning' ? 'text-amber-400' : 'text-emerald-400')}>
                        {alert.daysRemaining >= 9999 ? '—' : alert.daysRemaining + ' ngày'}
                      </td>
                      <td className="px-4 py-3 text-right text-blue-300 font-medium">{alert.suggestedOrder > 0 ? formatNum(alert.suggestedOrder) : '—'}</td>
                      <td className="px-4 py-3 text-center">
                        {alert.urgency === 'critical' ? (
                          <span className="px-2 py-0.5 bg-red-900/40 text-red-300 rounded text-xs font-medium">Khẩn cấp</span>
                        ) : alert.urgency === 'warning' ? (
                          <span className="px-2 py-0.5 bg-amber-900/40 text-amber-300 rounded text-xs font-medium">Cần đặt</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-emerald-900/40 text-emerald-300 rounded text-xs font-medium">Đủ hàng</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-slate-700/50 text-xs text-gray-500">
            Dựa trên tốc độ bán 30 ngày gần nhất. Lead time: 30 ngày. Đặt đủ cho 30 ngày bán.
          </div>
        </div>
      )}

      {/* Table search */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input type="text" value={tableSearch} onChange={function(e) { setTableSearch(e.target.value); }}
          placeholder="Tìm trong bảng tồn kho..."
          className="flex-1 min-w-[200px] max-w-md px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none" />
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
          <input type="checkbox" checked={showOnlyTracked} onChange={function(e) { setShowOnlyTracked(e.target.checked); }}
            className="rounded border-slate-600 bg-slate-800 text-blue-500" />
          Chỉ SP đang theo dõi
        </label>
      </div>

      {/* Product table */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50">
          <h2 className="font-semibold text-gray-100 text-sm">
            Bảng tồn kho {selectedWh !== 'ALL' ? '— ' + WAREHOUSE_LABELS[selectedWh] : '— Tổng hợp'} {tableSearch.trim() ? ' (' + productRows.length + ' kết quả)' : ''}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/80 border-b border-slate-700/50">
                <th className="text-left px-4 py-2.5 font-medium text-gray-400">Sản phẩm</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-400">Mã SKU</th>
                {selectedWh === 'ALL' ? (
                  <>
                    <th className="text-right px-4 py-2.5 font-medium text-blue-400">HCM</th>
                    <th className="text-right px-4 py-2.5 font-medium text-violet-400">HN</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-400">Tổng</th>
                  </>
                ) : (
                  <>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-400">Tồn đầu</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-400">Hiện tại</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-400">Ngưỡng</th>
                  </>
                )}
                <th className="text-center px-4 py-2.5 font-medium text-gray-400 w-16">TT</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-400 w-16">Xem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {productRows.map(function(row) {
                return (
                  <tr key={row.product} className="hover:bg-slate-800/50">
                    <td className="px-4 py-3"><span className="text-gray-200">{row.product}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {row.skuCodes.slice(0, 3).map(function(c) {
                          return <code key={c} className="px-1.5 py-0.5 bg-slate-800 rounded text-xs text-blue-300 font-mono">{c}</code>;
                        })}
                        {row.skuCodes.length > 3 && <span className="text-xs text-gray-500">+{row.skuCodes.length - 3}</span>}
                      </div>
                    </td>
                    {selectedWh === 'ALL' ? (function() {
                      var hcm = getCurrentStock(inv, row.product, 'HCM');
                      var hn = getCurrentStock(inv, row.product, 'HN');
                      var hcmCfg = getWarehouseConfig(inv, row.product, 'HCM');
                      var hnCfg = getWarehouseConfig(inv, row.product, 'HN');
                      var hcmHasConfig = (hcmCfg && hcmCfg.initialStock > 0) || hcm !== 0;
                      var hnHasConfig = (hnCfg && hnCfg.initialStock > 0) || hn !== 0;
                      return (
                        <>
                          <td className="px-4 py-3 text-right">
                            {hcmHasConfig ? <span className={getStockStatus(hcm, hcmCfg?.alertThreshold ?? 0) === 'out' ? 'text-red-400 font-semibold' : getStockStatus(hcm, hcmCfg?.alertThreshold ?? 0) === 'low' ? 'text-amber-400 font-semibold' : 'text-blue-300'}>{formatNum(hcm)}</span> : <span className="text-gray-600">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {hnHasConfig ? <span className={getStockStatus(hn, hnCfg?.alertThreshold ?? 0) === 'out' ? 'text-red-400 font-semibold' : getStockStatus(hn, hnCfg?.alertThreshold ?? 0) === 'low' ? 'text-amber-400 font-semibold' : 'text-violet-300'}>{formatNum(hn)}</span> : <span className="text-gray-600">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-300">
                            {(hcmHasConfig || hnHasConfig) ? formatNum(hcm + hn) : <span className="text-gray-600">—</span>}
                          </td>
                        </>
                      );
                    })() : (
                      <>
                        <td className="px-4 py-3 text-right text-gray-300">{(row.initial > 0 || row.current !== 0) ? formatNum(row.initial) : <span className="text-gray-600">—</span>}</td>
                        <td className={'px-4 py-3 text-right font-semibold ' + (
                          row.status === 'out' ? 'text-red-400' : row.status === 'low' ? 'text-amber-400' : row.status === 'ok' ? 'text-emerald-400' : 'text-gray-600'
                        )}>{(row.initial > 0 || row.current !== 0) ? formatNum(row.current) : '—'}</td>
                        <td className="px-4 py-3 text-right text-gray-400">{row.threshold > 0 ? formatNum(row.threshold) : <span className="text-gray-600">—</span>}</td>
                      </>
                    )}
                    <td className="px-4 py-3 text-center">
                      {row.status === 'out' && <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-red-500/15 text-red-400">Hết</span>}
                      {row.status === 'low' && <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-amber-500/15 text-amber-400">Thấp</span>}
                      {row.status === 'ok' && <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/15 text-emerald-400">OK</span>}
                      {row.status === 'unset' && <span className="text-xs text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.tracked && (
                        <button onClick={function() { setHistoryProduct(row.product); }}
                          className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-slate-700 rounded transition-colors" title="Lịch sử">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {productRows.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-sm">
            {tableSearch.trim() ? 'Không tìm thấy sản phẩm hoặc SKU phù hợp' : 'Chưa có sản phẩm nào'}
          </div>
        )}
      </div>

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
                    {excelDualMode ? (
                      <>
                        <th className="pb-2 font-medium text-right">HCM</th>
                        <th className="pb-2 font-medium text-right">HN</th>
                      </>
                    ) : (
                      <th className="pb-2 font-medium text-right">Số lượng</th>
                    )}
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
                        ) : (
                          <td className="py-2 text-right text-gray-300">{item.qtyHCM.toLocaleString('vi-VN')}</td>
                        )}
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
                <button onClick={function() { setExcelPreview(null); }}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">Hủy</button>
                <button onClick={confirmExcelImport}
                  disabled={excelPreview.filter(function(i) { return i.matched; }).length === 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors">
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
