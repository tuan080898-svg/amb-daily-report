'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAppState } from '@/lib/store';
import { getProductSkuCodes } from '@/lib/sku';
import {
  loadInventory, saveInventory, getCurrentStock, getStockStatus,
  addStockImport, getProductTransactions, getLowStockProducts,
  getTrackedProducts,
  type InventoryData, type InventoryTransaction,
} from '@/lib/inventory';

type EditMode = null | { product: string; type: 'config' | 'import' | 'export' | 'audit' | 'history' };

export default function AdminInventoryPage() {
  const { currentUser } = useAppState();
  const [inv, setInv] = useState<InventoryData>({ products: {}, transactions: [] });
  const [search, setSearch] = useState('');
  const [editMode, setEditMode] = useState<EditMode>(null);
  const [editStock, setEditStock] = useState(0);
  const [editThreshold, setEditThreshold] = useState(0);
  const [actionQty, setActionQty] = useState(0);
  const [actionNote, setActionNote] = useState('');
  const [auditQty, setAuditQty] = useState(0);
  const [successMsg, setSuccessMsg] = useState('');
  const [showOnlyTracked, setShowOnlyTracked] = useState(false);

  useEffect(function() {
    setInv(loadInventory());
  }, []);

  var allProducts = useMemo(function() {
    return getTrackedProducts();
  }, []);

  var productSkuMap = useMemo(function() {
    return getProductSkuCodes();
  }, []);

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
    if (search.trim()) {
      var q = search.trim().toLowerCase();
      rows = rows.filter(function(r) {
        if (r.product.toLowerCase().includes(q)) return true;
        return r.skuCodes.some(function(c) { return c.toLowerCase().includes(q); });
      });
    }
    return rows;
  }, [allProducts, inv, search, showOnlyTracked, productSkuMap]);

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

  function handleSetConfig(product: string) {
    var config = inv.products[product];
    setEditStock(config ? config.initialStock : 0);
    setEditThreshold(config ? config.alertThreshold : 10);
    setEditMode({ product: product, type: 'config' });
  }

  function handleSaveConfig() {
    if (!editMode) return;
    var updated = { products: Object.assign({}, inv.products), transactions: inv.transactions.slice() };
    updated.products[editMode.product] = { initialStock: editStock, alertThreshold: editThreshold };
    saveInventory(updated);
    setInv(updated);
    setEditMode(null);
    showSuccess('Đã cập nhật tồn kho: ' + editMode.product);
  }

  function handleOpenImport(product: string) {
    setActionQty(0);
    setActionNote('Nhập kho');
    setEditMode({ product: product, type: 'import' });
  }

  function handleSaveImport() {
    if (!editMode || actionQty <= 0) return;
    var updated = addStockImport(inv, editMode.product, actionQty, actionNote || 'Nhập kho');
    setInv(updated);
    setEditMode(null);
    showSuccess('Đã nhập +' + actionQty + ' ' + editMode.product);
  }

  function handleOpenExport(product: string) {
    setActionQty(0);
    setActionNote('Trừ kho thủ công');
    setEditMode({ product: product, type: 'export' });
  }

  function handleSaveExport() {
    if (!editMode || actionQty <= 0) return;
    var tx: InventoryTransaction = {
      id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      date: new Date().toISOString().slice(0, 10),
      product: editMode.product,
      quantity: -actionQty,
      type: 'adjust',
      note: actionNote || 'Trừ kho thủ công',
    };
    var updated = { products: Object.assign({}, inv.products), transactions: inv.transactions.concat([tx]) };
    saveInventory(updated);
    setInv(updated);
    setEditMode(null);
    showSuccess('Đã trừ -' + actionQty + ' ' + editMode.product);
  }

  function handleOpenAudit(product: string) {
    var current = getCurrentStock(inv, product);
    setAuditQty(current);
    setActionNote('Kiểm kho');
    setEditMode({ product: product, type: 'audit' });
  }

  function handleSaveAudit() {
    if (!editMode) return;
    var current = getCurrentStock(inv, editMode.product);
    var diff = auditQty - current;
    if (diff === 0) { setEditMode(null); showSuccess('Tồn kho khớp, không cần điều chỉnh'); return; }
    var tx: InventoryTransaction = {
      id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      date: new Date().toISOString().slice(0, 10),
      product: editMode.product,
      quantity: diff,
      type: 'adjust',
      note: (actionNote || 'Kiểm kho') + ' (trước: ' + current + ' → sau: ' + auditQty + ')',
    };
    var updated = { products: Object.assign({}, inv.products), transactions: inv.transactions.concat([tx]) };
    saveInventory(updated);
    setInv(updated);
    setEditMode(null);
    showSuccess('Kiểm kho ' + editMode.product + ': ' + (diff > 0 ? '+' : '') + diff + ' (thực tế: ' + auditQty + ')');
  }

  function handleShowHistory(product: string) {
    setEditMode({ product: product, type: 'history' });
  }

  var editTxs = editMode?.type === 'history' ? getProductTransactions(inv, editMode.product) : [];
  var editCurrentStock = editMode ? getCurrentStock(inv, editMode.product) : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Quản lý Kho</h1>
          <p className="text-sm text-gray-500 mt-1">{trackedCount}/{allProducts.length} sản phẩm đang theo dõi</p>
        </div>
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
                  <div className="flex items-center gap-4">
                    <span className={'text-sm font-semibold ' + (alert.status === 'out' ? 'text-red-400' : 'text-amber-400')}>
                      Còn {formatNum(alert.current)} (ngưỡng: {formatNum(alert.threshold)})
                    </span>
                    <button onClick={function() { handleOpenImport(alert.product); }} className="px-3 py-1 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors">+ Nhập kho</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Config form */}
      {editMode && editMode.type === 'config' && (
        <div className="mb-6 bg-slate-900 border border-blue-500/30 rounded-xl p-5">
          <h2 className="font-semibold text-gray-100 mb-4">Cài đặt tồn kho: {editMode.product}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Tồn kho ban đầu</label>
              <input type="number" min={0} value={editStock} onChange={function(e) { setEditStock(parseInt(e.target.value) || 0); }}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none" autoFocus />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Ngưỡng cảnh báo (sắp hết)</label>
              <input type="number" min={0} value={editThreshold} onChange={function(e) { setEditThreshold(parseInt(e.target.value) || 0); }}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none" />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={handleSaveConfig} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors">Lưu</button>
            <button onClick={function() { setEditMode(null); }} className="px-4 py-2 text-gray-400 border border-slate-600 rounded-lg text-sm hover:bg-slate-800 transition-colors">Hủy</button>
          </div>
        </div>
      )}

      {/* Import form */}
      {editMode && editMode.type === 'import' && (
        <div className="mb-6 bg-slate-900 border border-emerald-500/30 rounded-xl p-5">
          <h2 className="font-semibold text-emerald-400 mb-1">Nhập kho: {editMode.product}</h2>
          <p className="text-xs text-gray-500 mb-4">Tồn hiện tại: {formatNum(editCurrentStock)}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Số lượng nhập thêm</label>
              <input type="number" min={1} value={actionQty || ''} onChange={function(e) { setActionQty(parseInt(e.target.value) || 0); }}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none" autoFocus />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Ghi chú</label>
              <input type="text" value={actionNote} onChange={function(e) { setActionNote(e.target.value); }}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none" placeholder="VD: Nhập từ NCC" />
            </div>
          </div>
          {actionQty > 0 && <p className="text-xs text-emerald-400 mt-2">Sau nhập: {formatNum(editCurrentStock)} → {formatNum(editCurrentStock + actionQty)}</p>}
          <div className="flex items-center gap-3 mt-4">
            <button onClick={handleSaveImport} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 transition-colors">Nhập kho</button>
            <button onClick={function() { setEditMode(null); }} className="px-4 py-2 text-gray-400 border border-slate-600 rounded-lg text-sm hover:bg-slate-800 transition-colors">Hủy</button>
          </div>
        </div>
      )}

      {/* Export/deduct form */}
      {editMode && editMode.type === 'export' && (
        <div className="mb-6 bg-slate-900 border border-red-500/30 rounded-xl p-5">
          <h2 className="font-semibold text-red-400 mb-1">Trừ kho: {editMode.product}</h2>
          <p className="text-xs text-gray-500 mb-4">Tồn hiện tại: {formatNum(editCurrentStock)}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Số lượng trừ</label>
              <input type="number" min={1} value={actionQty || ''} onChange={function(e) { setActionQty(parseInt(e.target.value) || 0); }}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 focus:border-red-500 outline-none" autoFocus />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Lý do</label>
              <input type="text" value={actionNote} onChange={function(e) { setActionNote(e.target.value); }}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 focus:border-red-500 outline-none" placeholder="VD: Hàng lỗi, trả NCC" />
            </div>
          </div>
          {actionQty > 0 && <p className="text-xs text-red-400 mt-2">Sau trừ: {formatNum(editCurrentStock)} → {formatNum(editCurrentStock - actionQty)}</p>}
          <div className="flex items-center gap-3 mt-4">
            <button onClick={handleSaveExport} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-500 transition-colors">Trừ kho</button>
            <button onClick={function() { setEditMode(null); }} className="px-4 py-2 text-gray-400 border border-slate-600 rounded-lg text-sm hover:bg-slate-800 transition-colors">Hủy</button>
          </div>
        </div>
      )}

      {/* Audit/stock check form */}
      {editMode && editMode.type === 'audit' && (
        <div className="mb-6 bg-slate-900 border border-purple-500/30 rounded-xl p-5">
          <h2 className="font-semibold text-purple-400 mb-1">Kiểm kho: {editMode.product}</h2>
          <p className="text-xs text-gray-500 mb-4">Tồn trên hệ thống: {formatNum(editCurrentStock)}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Tồn kho thực tế (đếm được)</label>
              <input type="number" min={0} value={auditQty} onChange={function(e) { setAuditQty(parseInt(e.target.value) || 0); }}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 focus:border-purple-500 outline-none" autoFocus />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Ghi chú</label>
              <input type="text" value={actionNote} onChange={function(e) { setActionNote(e.target.value); }}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 focus:border-purple-500 outline-none" placeholder="VD: Kiểm kho tháng 8" />
            </div>
          </div>
          {(function() {
            var diff = auditQty - editCurrentStock;
            if (diff === 0) return <p className="text-xs text-gray-400 mt-2">Tồn kho khớp</p>;
            return <p className={'text-xs mt-2 ' + (diff > 0 ? 'text-emerald-400' : 'text-red-400')}>
              Chênh lệch: {diff > 0 ? '+' : ''}{formatNum(diff)} (hệ thống: {formatNum(editCurrentStock)} → thực tế: {formatNum(auditQty)})
            </p>;
          })()}
          <div className="flex items-center gap-3 mt-4">
            <button onClick={handleSaveAudit} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-500 transition-colors">Cân đối kho</button>
            <button onClick={function() { setEditMode(null); }} className="px-4 py-2 text-gray-400 border border-slate-600 rounded-lg text-sm hover:bg-slate-800 transition-colors">Hủy</button>
          </div>
        </div>
      )}

      {/* History */}
      {editMode && editMode.type === 'history' && (
        <div className="mb-6 bg-slate-900 border border-slate-600 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-100 text-sm">Lịch sử: {editMode.product}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{editTxs.length} giao dịch · Tồn hiện tại: {formatNum(editCurrentStock)}</p>
            </div>
            <button onClick={function() { setEditMode(null); }} className="p-1.5 text-gray-500 hover:text-gray-300 rounded transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          {editTxs.length > 0 ? (
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
                  {editTxs.map(function(tx) {
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

      {/* Search */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input type="text" value={search} onChange={function(e) { setSearch(e.target.value); }}
          placeholder="Tìm sản phẩm hoặc mã SKU..."
          className="flex-1 min-w-[200px] max-w-md px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none" />
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
          <input type="checkbox" checked={showOnlyTracked} onChange={function(e) { setShowOnlyTracked(e.target.checked); }}
            className="rounded border-slate-600 bg-slate-800 text-blue-500" />
          Chỉ SP đang theo dõi
        </label>
      </div>

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

      {/* Product table */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50">
          <h2 className="font-semibold text-gray-100 text-sm">
            Danh sách sản phẩm {search.trim() ? '(' + productRows.length + ' kết quả)' : ''}
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
                <th className="text-center px-4 py-2.5 font-medium text-gray-400 w-20">TT</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-400 w-44">Thao tác</th>
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
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={function() { handleSetConfig(row.product); }} className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors" title="Cài đặt">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        </button>
                        {row.initial > 0 && (
                          <>
                            <button onClick={function() { handleOpenImport(row.product); }} className="p-1.5 text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors" title="Nhập kho">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                            </button>
                            <button onClick={function() { handleOpenExport(row.product); }} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors" title="Trừ kho">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" /></svg>
                            </button>
                            <button onClick={function() { handleOpenAudit(row.product); }} className="p-1.5 text-gray-500 hover:text-purple-400 hover:bg-purple-500/10 rounded transition-colors" title="Kiểm kho">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                            </button>
                            <button onClick={function() { handleShowHistory(row.product); }} className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-slate-700 rounded transition-colors" title="Lịch sử">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {productRows.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-sm">
            {search.trim() ? 'Không tìm thấy sản phẩm hoặc SKU phù hợp' : 'Chưa có sản phẩm nào'}
          </div>
        )}
      </div>
    </div>
  );
}
