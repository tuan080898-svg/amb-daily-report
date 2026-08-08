'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAppState } from '@/lib/store';
import { getSkuMap, saveSkuMap, invalidateCache, type SkuItem, type SkuMap } from '@/lib/sku';
import { loadInventory, saveInventory } from '@/lib/inventory';

interface EditingEntry {
  skuCode: string;
  items: SkuItem[];
  isNew: boolean;
  originalCode?: string;
}

export default function AdminSkuPage() {
  const { currentUser } = useAppState();
  const searchParams = useSearchParams();
  const [skuMap, setSkuMap] = useState<SkuMap>({});
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<EditingEntry | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(function() {
    setSkuMap(getSkuMap());
    var addCode = searchParams.get('add');
    if (addCode) {
      setEditing({
        skuCode: addCode,
        items: [{ product: '', quantity: 1 }],
        isNew: true,
      });
      setSearch(addCode);
    }
  }, [searchParams]);

  const entries = useMemo(function() {
    var all = Object.entries(skuMap).map(function(e) {
      return { code: e[0], items: e[1] };
    });
    if (!search.trim()) return all.sort(function(a, b) { return a.code.localeCompare(b.code); });
    var q = search.trim().toLowerCase();
    return all.filter(function(e) {
      if (e.code.toLowerCase().includes(q)) return true;
      return e.items.some(function(it) { return it.product.toLowerCase().includes(q); });
    }).sort(function(a, b) { return a.code.localeCompare(b.code); });
  }, [skuMap, search]);

  if (!currentUser || currentUser.role !== 'admin') {
    return <div className="p-6 text-red-400">Bạn không có quyền truy cập trang này.</div>;
  }

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(function() { setSuccessMsg(''); }, 3000);
  }

  function handleNew() {
    setEditing({ skuCode: '', items: [{ product: '', quantity: 1 }], isNew: true });
  }

  function handleEdit(code: string) {
    var items = skuMap[code] || [];
    setEditing({
      skuCode: code,
      items: items.map(function(it) { return { product: it.product, quantity: it.quantity }; }),
      isNew: false,
      originalCode: code,
    });
  }

  function handleDelete(code: string) {
    if (!confirm('Xóa SKU "' + code + '"?')) return;
    var updated = Object.assign({}, skuMap);
    delete updated[code];
    saveSkuMap(updated);
    invalidateCache();
    setSkuMap(getSkuMap());
    showSuccess('Đã xóa SKU ' + code);
  }

  function handleSave() {
    if (!editing) return;
    var code = editing.skuCode.trim();
    if (!code) { alert('Vui lòng nhập mã SKU'); return; }
    var validItems = editing.items.filter(function(it) { return it.product.trim() !== ''; });
    if (validItems.length === 0) { alert('Vui lòng nhập ít nhất 1 sản phẩm'); return; }

    var updated = Object.assign({}, skuMap);
    if (editing.isNew && updated[code]) {
      if (!confirm('SKU "' + code + '" đã tồn tại. Ghi đè?')) return;
    }
    if (!editing.isNew && editing.originalCode && editing.originalCode !== code) {
      delete updated[editing.originalCode];
    }
    updated[code] = validItems.map(function(it) { return { product: it.product.trim(), quantity: it.quantity || 1 }; });
    saveSkuMap(updated);
    invalidateCache();
    setSkuMap(getSkuMap());

    var newProducts: string[] = [];
    var inv = loadInventory();
    validItems.forEach(function(it) {
      var name = it.product.trim();
      if (name && !inv.products[name]) {
        inv.products[name] = { HCM: { initialStock: 0, alertThreshold: 10 }, HN: { initialStock: 0, alertThreshold: 10 } };
        newProducts.push(name);
      }
    });
    if (newProducts.length > 0) {
      saveInventory(inv);
    }

    setEditing(null);
    var msg = editing.isNew ? 'Đã thêm SKU ' + code : 'Đã cập nhật SKU ' + code;
    if (newProducts.length > 0) msg += ' (+ ' + newProducts.length + ' SP mới vào kho)';
    showSuccess(msg);
  }

  function handleAddItem() {
    if (!editing) return;
    setEditing(Object.assign({}, editing, { items: editing.items.concat([{ product: '', quantity: 1 }]) }));
  }

  function handleRemoveItem(idx: number) {
    if (!editing || editing.items.length <= 1) return;
    setEditing(Object.assign({}, editing, {
      items: editing.items.filter(function(_, i) { return i !== idx; }),
    }));
  }

  function handleItemChange(idx: number, field: 'product' | 'quantity', value: string | number) {
    if (!editing) return;
    var newItems = editing.items.map(function(it, i) {
      if (i !== idx) return it;
      if (field === 'product') return { product: value as string, quantity: it.quantity };
      return { product: it.product, quantity: value as number };
    });
    setEditing(Object.assign({}, editing, { items: newItems }));
  }

  function handleResetToDefault() {
    if (!confirm('Reset toàn bộ mapping về mặc định? Các thay đổi sẽ bị mất.')) return;
    localStorage.removeItem('amb_sku_mappings');
    invalidateCache();
    setSkuMap(getSkuMap());
    showSuccess('Đã reset về mapping mặc định');
  }

  var totalCodes = Object.keys(skuMap).length;
  var products = new Set<string>();
  Object.values(skuMap).forEach(function(items) {
    items.forEach(function(it) { products.add(it.product); });
  });
  var comboCodes = Object.entries(skuMap).filter(function(e) { return e[1].length > 1; }).length;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Quản lý SKU Mapping</h1>
          <p className="text-sm text-gray-500 mt-1">
            {totalCodes} mã SKU &middot; {products.size} sản phẩm &middot; {comboCodes} combo
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleResetToDefault}
            className="px-3 py-2 text-sm text-gray-400 hover:text-gray-200 border border-slate-600 rounded-lg hover:bg-slate-800 transition-colors"
          >
            Reset mặc định
          </button>
          <button
            onClick={handleNew}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors"
          >
            + Thêm SKU
          </button>
        </div>
      </div>

      {/* Success message */}
      {successMsg && (
        <div className="mb-4 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-sm text-emerald-400">
          {successMsg}
        </div>
      )}

      {/* Edit/Add form */}
      {editing && (
        <div className="mb-6 bg-slate-900 border border-blue-500/30 rounded-xl p-5">
          <h2 className="font-semibold text-gray-100 mb-4">
            {editing.isNew ? 'Thêm SKU mới' : 'Sửa SKU: ' + editing.originalCode}
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Mã SKU</label>
              <input
                type="text"
                value={editing.skuCode}
                onChange={function(e) { setEditing(Object.assign({}, editing, { skuCode: e.target.value.toUpperCase() })); }}
                className="w-full max-w-xs px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 font-mono focus:border-blue-500 outline-none"
                placeholder="VD: GH040-1"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-2">Sản phẩm (combo = nhiều dòng)</label>
              <div className="space-y-2">
                {editing.items.map(function(item, idx) {
                  return (
                    <div key={idx} className="flex items-center gap-3">
                      <input
                        type="text"
                        value={item.product}
                        onChange={function(e) { handleItemChange(idx, 'product', e.target.value); }}
                        className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none"
                        placeholder="Tên sản phẩm"
                      />
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-500">x</span>
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={function(e) { handleItemChange(idx, 'quantity', parseInt(e.target.value) || 1); }}
                          className="w-16 px-2 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 text-center focus:border-blue-500 outline-none"
                        />
                      </div>
                      {editing.items.length > 1 && (
                        <button
                          onClick={function() { handleRemoveItem(idx); }}
                          className="p-1.5 text-gray-500 hover:text-red-400 rounded transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                onClick={handleAddItem}
                className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                + Thêm sản phẩm (combo)
              </button>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors"
              >
                Lưu
              </button>
              <button
                onClick={function() { setEditing(null); }}
                className="px-4 py-2 text-gray-400 hover:text-gray-200 border border-slate-600 rounded-lg text-sm hover:bg-slate-800 transition-colors"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={function(e) { setSearch(e.target.value); }}
          placeholder="Tìm mã SKU hoặc tên sản phẩm..."
          className="w-full max-w-md px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Tổng mã SKU</p>
          <p className="text-2xl font-bold text-gray-100">{totalCodes}</p>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Sản phẩm</p>
          <p className="text-2xl font-bold text-blue-400">{products.size}</p>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Combo SKU</p>
          <p className="text-2xl font-bold text-emerald-400">{comboCodes}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50">
          <h2 className="font-semibold text-gray-100 text-sm">
            Bảng mapping {search.trim() ? '(' + entries.length + ' kết quả)' : ''}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/80 border-b border-slate-700/50">
                <th className="text-left px-4 py-2.5 font-medium text-gray-400 w-40">Mã SKU</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-400">Sản phẩm</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-400 w-20">SL</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-400 w-24">Loại</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-400 w-24">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {entries.map(function(entry) {
                var isCombo = entry.items.length > 1;
                return (
                  <tr key={entry.code} className="hover:bg-slate-800/50">
                    <td className="px-4 py-3">
                      <code className="px-2 py-0.5 bg-slate-800 rounded text-blue-300 text-xs font-mono">{entry.code}</code>
                    </td>
                    <td className="px-4 py-3">
                      {entry.items.map(function(it, i) {
                        return (
                          <div key={i} className={i > 0 ? 'mt-1' : ''}>
                            <span className="text-gray-200">{it.product}</span>
                            {it.quantity > 1 && (
                              <span className="ml-1.5 text-xs text-gray-500">x{it.quantity}</span>
                            )}
                          </div>
                        );
                      })}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-300">
                      {entry.items.reduce(function(s, it) { return s + it.quantity; }, 0)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isCombo ? (
                        <span className="inline-flex px-2 py-0.5 rounded text-xs bg-purple-500/15 text-purple-400 font-medium">Combo</span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded text-xs bg-slate-700 text-gray-400">Đơn</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={function() { handleEdit(entry.code); }}
                          className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                          title="Sửa"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button
                          onClick={function() { handleDelete(entry.code); }}
                          className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          title="Xóa"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {entries.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-sm">
            {search.trim() ? 'Không tìm thấy SKU phù hợp' : 'Chưa có dữ liệu mapping'}
          </div>
        )}
      </div>
    </div>
  );
}
