'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useAppState } from '@/lib/store';
import { getProductSkuCodes } from '@/lib/sku';
import {
  loadInventory, saveInventory, getCurrentStock, getStockStatus,
  addStockImport, getProductTransactions, getLowStockProducts,
  getTrackedProducts,
  type InventoryData, type InventoryTransaction,
} from '@/lib/inventory';

type ActionTab = 'import' | 'export' | 'audit' | 'config';
interface BatchItem {
  product: string;
  quantity: number;
}

export default function AdminInventoryPage() {
  const { currentUser } = useAppState();
  const [inv, setInv] = useState<InventoryData>({ products: {}, transactions: [] });
  const [tableSearch, setTableSearch] = useState('');
  const [showOnlyTracked, setShowOnlyTracked] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [historyProduct, setHistoryProduct] = useState<string | null>(null);

  // Unified operation panel
  const [activeTab, setActiveTab] = useState<ActionTab>('import');
  const [opSearch, setOpSearch] = useState('');
  const [opShowDropdown, setOpShowDropdown] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [opNote, setOpNote] = useState('');
  const [configThreshold, setConfigThreshold] = useState(10);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(function() {
    setInv(loadInventory());
  }, []);

  useEffect(function() {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setOpShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return function() { document.removeEventListener('mousedown', handleClickOutside); };
  }, []);

  var allProducts = useMemo(function() {
    return getTrackedProducts();
  }, []);

  var productSkuMap = useMemo(function() {
    return getProductSkuCodes();
  }, []);

  // Search results for operation panel
  var opResults = useMemo(function() {
    if (!opSearch.trim()) return [];
    var q = opSearch.trim().toLowerCase();
    var selectedNames = new Set(batchItems.map(function(b) { return b.product; }));
    return allProducts.filter(function(p) {
      if (selectedNames.has(p)) return false;
      if (p.toLowerCase().includes(q)) return true;
      var codes = productSkuMap[p] || [];
      return codes.some(function(c) { return c.toLowerCase().includes(q); });
    }).slice(0, 8);
  }, [opSearch, allProducts, productSkuMap, batchItems]);

  var productRows = useMemo(function() {
    var rows = allProducts.map(function(product) {
      var config = inv.products[product];
      var initial = config ? config.initialStock : 0;
      var threshold = config ? config.alertThreshold : 0;
      var current = getCurrentStock(inv, product);
      var status = initial > 0 ? getStockStatus(current, threshold) : 'unset';
      var skuCodes = productSkuMap[product] || [];
      return { product: product, initial: initial, threshold: threshold, current: current, status: status, skuCodes: skuCodes };
    });
    if (showOnlyTracked) {
      rows = rows.filter(function(r) { return r.initial > 0; });
    }
    if (tableSearch.trim()) {
      var q = tableSearch.trim().toLowerCase();
      rows = rows.filter(function(r) {
        if (r.product.toLowerCase().includes(q)) return true;
        return r.skuCodes.some(function(c) { return c.toLowerCase().includes(q); });
      });
    }
    return rows;
  }, [allProducts, inv, tableSearch, showOnlyTracked, productSkuMap]);

  var lowStockAlerts = useMemo(function() {
    return getLowStockProducts(inv);
  }, [inv]);

  var trackedCount = useMemo(function() {
    return Object.values(inv.products).filter(function(c) { return c.initialStock > 0; }).length;
  }, [inv]);

  if (!currentUser || currentUser.role !== 'admin') {
    return <div className="p-6 text-red-400">Bạn không có quyền truy cập trang này.</div>;
  }

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(function() { setSuccessMsg(''); }, 3000);
  }

  function formatNum(n: number): string {
    return n.toLocaleString('vi-VN');
  }

  function handleAddToBatch(product: string) {
    var existing = batchItems.find(function(b) { return b.product === product; });
    if (existing) return;
    var defaultQty = 0;
    if (activeTab === 'audit') {
      defaultQty = getCurrentStock(inv, product);
    }
    setBatchItems(batchItems.concat([{ product: product, quantity: defaultQty }]));
    setOpSearch('');
    setOpShowDropdown(false);
  }

  function handleRemoveFromBatch(product: string) {
    setBatchItems(batchItems.filter(function(b) { return b.product !== product; }));
  }

  function handleBatchQtyChange(product: string, qty: number) {
    setBatchItems(batchItems.map(function(b) {
      if (b.product !== product) return b;
      return { product: b.product, quantity: qty };
    }));
  }

  function handleSubmitBatch() {
    if (batchItems.length === 0) return;
    var validItems = batchItems.filter(function(b) { return b.quantity > 0 || activeTab === 'audit'; });
    if (validItems.length === 0 && activeTab !== 'audit') { alert('Vui lòng nhập số lượng > 0'); return; }

    var updated = { products: Object.assign({}, inv.products), transactions: inv.transactions.slice() };
    var count = 0;

    if (activeTab === 'import') {
      validItems.forEach(function(item) {
        var tx: InventoryTransaction = {
          id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
          date: new Date().toISOString().slice(0, 10),
          product: item.product,
          quantity: item.quantity,
          type: 'import',
          note: opNote || 'Nhập kho',
        };
        updated.transactions = updated.transactions.concat([tx]);
        count++;
      });
      saveInventory(updated);
      setInv(updated);
      showSuccess('Đã nhập kho ' + count + ' sản phẩm');
    } else if (activeTab === 'export') {
      validItems.forEach(function(item) {
        var tx: InventoryTransaction = {
          id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
          date: new Date().toISOString().slice(0, 10),
          product: item.product,
          quantity: -item.quantity,
          type: 'adjust',
          note: opNote || 'Trừ kho thủ công',
        };
        updated.transactions = updated.transactions.concat([tx]);
        count++;
      });
      saveInventory(updated);
      setInv(updated);
      showSuccess('Đã trừ kho ' + count + ' sản phẩm');
    } else if (activeTab === 'audit') {
      batchItems.forEach(function(item) {
        var current = getCurrentStock(updated, item.product);
        var diff = item.quantity - current;
        if (diff === 0) return;
        var tx: InventoryTransaction = {
          id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
          date: new Date().toISOString().slice(0, 10),
          product: item.product,
          quantity: diff,
          type: 'adjust',
          note: (opNote || 'Kiểm kho') + ' (trước: ' + current + ' → sau: ' + item.quantity + ')',
        };
        updated.transactions = updated.transactions.concat([tx]);
        count++;
      });
      saveInventory(updated);
      setInv(updated);
      showSuccess(count > 0 ? 'Đã cân đối ' + count + ' sản phẩm' : 'Tồn kho khớp, không cần điều chỉnh');
    } else if (activeTab === 'config') {
      batchItems.forEach(function(item) {
        updated.products[item.product] = { initialStock: item.quantity, alertThreshold: configThreshold };
        count++;
      });
      saveInventory(updated);
      setInv(updated);
      showSuccess('Đã cài đặt tồn kho cho ' + count + ' sản phẩm');
    }

    setBatchItems([]);
    setOpNote('');
  }

  function handleSwitchTab(tab: ActionTab) {
    setActiveTab(tab);
    setBatchItems([]);
    setOpSearch('');
    setOpNote('');
  }

  var historyTxs = historyProduct ? getProductTransactions(inv, historyProduct) : [];
  var historyStock = historyProduct ? getCurrentStock(inv, historyProduct) : 0;

  var tabConfig = {
    import: { label: 'Nhập kho', color: 'emerald', qtyLabel: 'SL nhập', notePlaceholder: 'VD: Nhập từ NCC tháng 8', btnLabel: 'Nhập kho', btnClass: 'bg-emerald-600 hover:bg-emerald-500' },
    export: { label: 'Trừ kho', color: 'red', qtyLabel: 'SL trừ', notePlaceholder: 'VD: Hàng lỗi, trả NCC', btnLabel: 'Trừ kho', btnClass: 'bg-red-600 hover:bg-red-500' },
    audit: { label: 'Kiểm kho', color: 'purple', qtyLabel: 'Thực tế', notePlaceholder: 'VD: Kiểm kho tháng 8', btnLabel: 'Cân đối kho', btnClass: 'bg-purple-600 hover:bg-purple-500' },
    config: { label: 'Cài đặt tồn', color: 'blue', qtyLabel: 'Tồn đầu', notePlaceholder: '', btnLabel: 'Lưu cài đặt', btnClass: 'bg-blue-600 hover:bg-blue-500' },
  };
  var tc = tabConfig[activeTab];
  var borderColor = 'border-' + tc.color + '-500/30';

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Quản lý Kho</h1>
        <p className="text-sm text-gray-500 mt-1">{trackedCount}/{allProducts.length} sản phẩm đang theo dõi</p>
      </div>

      {/* Success */}
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
            {lowStockAlerts.map(function(alert) {
              return (
                <div key={alert.product} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className={'inline-flex px-2 py-0.5 rounded text-xs font-bold ' + (
                      alert.status === 'out' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'
                    )}>{alert.status === 'out' ? 'HẾT HÀNG' : 'SẮP HẾT'}</span>
                    <span className="text-sm text-gray-200">{alert.product}</span>
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
        {/* Tabs */}
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
          {/* Search + Add */}
          <div className="mb-4" ref={searchRef}>
            <label className="block text-xs text-gray-400 mb-1.5">Tìm sản phẩm hoặc mã SKU</label>
            <div className="relative">
              <input type="text" value={opSearch}
                onChange={function(e) { setOpSearch(e.target.value); setOpShowDropdown(true); }}
                onFocus={function() { if (opSearch.trim()) setOpShowDropdown(true); }}
                placeholder="Gõ tên sản phẩm hoặc mã SKU để thêm..."
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none" />
              {/* Dropdown results */}
              {opShowDropdown && opResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                  {opResults.map(function(product) {
                    var codes = productSkuMap[product] || [];
                    var current = getCurrentStock(inv, product);
                    var hasConfig = inv.products[product] && inv.products[product].initialStock > 0;
                    return (
                      <button key={product} onClick={function() { handleAddToBatch(product); }}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-700 transition-colors text-left border-b border-slate-700/50 last:border-0">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-gray-200">{product}</span>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {codes.slice(0, 3).map(function(c) {
                              return <code key={c} className="px-1 py-0.5 bg-slate-900 rounded text-xs text-blue-300 font-mono">{c}</code>;
                            })}
                            {codes.length > 3 && <span className="text-xs text-gray-500">+{codes.length - 3}</span>}
                          </div>
                        </div>
                        <div className="text-right ml-3 shrink-0">
                          {hasConfig ? (
                            <span className="text-xs text-gray-400">Tồn: {formatNum(current)}</span>
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
              <div className="text-xs text-gray-400 mb-2">Đã chọn ({batchItems.length} sản phẩm)</div>
              <div className="space-y-2">
                {batchItems.map(function(item) {
                  var current = getCurrentStock(inv, item.product);
                  var codes = productSkuMap[item.product] || [];
                  return (
                    <div key={item.product} className="flex items-center gap-3 bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-200">{item.product}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {codes.slice(0, 2).map(function(c) {
                            return <code key={c} className="px-1 py-0.5 bg-slate-900 rounded text-xs text-blue-300 font-mono">{c}</code>;
                          })}
                          {codes.length > 2 && <span className="text-xs text-gray-500">+{codes.length - 2}</span>}
                          <span className="text-xs text-gray-500">· Tồn: {formatNum(current)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <label className="text-xs text-gray-500">{tc.qtyLabel}:</label>
                        <input type="number" min={0} value={item.quantity || ''}
                          onChange={function(e) { handleBatchQtyChange(item.product, parseInt(e.target.value) || 0); }}
                          className="w-24 px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-gray-200 text-center focus:border-blue-500 outline-none" />
                        {activeTab === 'import' && item.quantity > 0 && (
                          <span className="text-xs text-emerald-400">→ {formatNum(current + item.quantity)}</span>
                        )}
                        {activeTab === 'export' && item.quantity > 0 && (
                          <span className="text-xs text-red-400">→ {formatNum(current - item.quantity)}</span>
                        )}
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

          {/* Note + threshold + submit */}
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

      {/* History modal */}
      {historyProduct && (
        <div className="mb-6 bg-slate-900 border border-slate-600 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-100 text-sm">Lịch sử: {historyProduct}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{historyTxs.length} giao dịch · Tồn hiện tại: {formatNum(historyStock)}</p>
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
                          <span className={'inline-flex px-2 py-0.5 rounded text-xs font-medium ' + (
                            tx.type === 'import' ? 'bg-emerald-500/15 text-emerald-400' :
                            tx.type === 'sale' ? 'bg-orange-500/15 text-orange-400' :
                            'bg-purple-500/15 text-purple-400'
                          )}>{tx.type === 'import' ? 'Nhập kho' : tx.type === 'sale' ? 'Bán' : 'Điều chỉnh'}</span>
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
            Bảng tồn kho {tableSearch.trim() ? '(' + productRows.length + ' kết quả)' : ''}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/80 border-b border-slate-700/50">
                <th className="text-left px-4 py-2.5 font-medium text-gray-400">Sản phẩm</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-400">Mã SKU</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-400">Tồn đầu</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-400">Tồn hiện tại</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-400">Ngưỡng</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-400 w-16">TT</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-400 w-16">Xem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {productRows.map(function(row) {
                return (
                  <tr key={row.product} className="hover:bg-slate-800/50">
                    <td className="px-4 py-3">
                      <span className="text-gray-200">{row.product}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {row.skuCodes.slice(0, 3).map(function(c) {
                          return <code key={c} className="px-1.5 py-0.5 bg-slate-800 rounded text-xs text-blue-300 font-mono">{c}</code>;
                        })}
                        {row.skuCodes.length > 3 && <span className="text-xs text-gray-500">+{row.skuCodes.length - 3}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">
                      {row.initial > 0 ? formatNum(row.initial) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className={'px-4 py-3 text-right font-semibold ' + (
                      row.status === 'out' ? 'text-red-400' : row.status === 'low' ? 'text-amber-400' : row.status === 'ok' ? 'text-emerald-400' : 'text-gray-600'
                    )}>
                      {row.initial > 0 ? formatNum(row.current) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">
                      {row.threshold > 0 ? formatNum(row.threshold) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.status === 'out' && <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-red-500/15 text-red-400">Hết</span>}
                      {row.status === 'low' && <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-amber-500/15 text-amber-400">Thấp</span>}
                      {row.status === 'ok' && <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/15 text-emerald-400">OK</span>}
                      {row.status === 'unset' && <span className="text-xs text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.initial > 0 && (
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
    </div>
  );
}
