'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAppState } from '@/lib/store';
import { aggregateProducts, getAllSkuCodes } from '@/lib/sku';

interface SkuImport {
  shopId: string;
  shopName: string;
  dateFrom: string;
  dateTo: string;
  skuCodes: string[];
  importedAt: string;
}

export default function SkuReportPage() {
  const { shops } = useAppState();
  const [imports, setImports] = useState<SkuImport[]>([]);
  const [filterShop, setFilterShop] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  useEffect(function() {
    try {
      const raw = localStorage.getItem('amb_sku_imports');
      if (raw) {
        const data = JSON.parse(raw) as SkuImport[];
        setImports(data);
        if (data.length > 0) {
          const allDates = data.flatMap(function(d) { return [d.dateFrom, d.dateTo]; }).sort();
          setFilterDateFrom(allDates[0]);
          setFilterDateTo(allDates[allDates.length - 1]);
        }
      }
    } catch (_) {}
  }, []);

  const filteredImports = useMemo(function() {
    return imports.filter(function(imp) {
      if (filterShop !== 'all' && imp.shopId !== filterShop) return false;
      if (filterDateFrom && imp.dateTo < filterDateFrom) return false;
      if (filterDateTo && imp.dateFrom > filterDateTo) return false;
      return true;
    });
  }, [imports, filterShop, filterDateFrom, filterDateTo]);

  const allSkuCodes = useMemo(function() {
    return filteredImports.flatMap(function(f) { return f.skuCodes; });
  }, [filteredImports]);

  const productSummary = useMemo(function() {
    if (allSkuCodes.length === 0) return [];
    return aggregateProducts(allSkuCodes);
  }, [allSkuCodes]);

  const totalQty = useMemo(function() {
    return productSummary.reduce(function(sum, p) { return sum + p.totalQuantity; }, 0);
  }, [productSummary]);

  const unmatchedCount = useMemo(function() {
    const knownSkus = new Set(getAllSkuCodes());
    return allSkuCodes.filter(function(c) { return !knownSkus.has(c); }).length;
  }, [allSkuCodes]);

  const shopOptions = useMemo(function() {
    const seen = new Set<string>();
    return imports
      .filter(function(imp) {
        if (seen.has(imp.shopId)) return false;
        seen.add(imp.shopId);
        return true;
      })
      .map(function(imp) {
        const shop = shops.find(function(s) { return s.id === imp.shopId; });
        return { id: imp.shopId, name: shop?.name || imp.shopName };
      });
  }, [imports, shops]);

  function handleDeleteImport(idx: number) {
    const updated = imports.filter(function(_, i) { return i !== idx; });
    setImports(updated);
    try { localStorage.setItem('amb_sku_imports', JSON.stringify(updated)); } catch (_) {}
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Sản phẩm bán chạy</h1>
        <p className="text-sm text-gray-500 mt-1">Dữ liệu SKU tổng hợp từ các lần import đơn hàng</p>
      </div>

      <div className="space-y-6">
        {/* Filters */}
        {imports.length > 0 && (
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
            <h2 className="font-semibold text-gray-200 text-sm mb-4">Bộ lọc</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Shop</label>
                <select
                  value={filterShop}
                  onChange={function(e) { setFilterShop(e.target.value); }}
                  className="w-full px-3 py-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">Tất cả shop</option>
                  {shopOptions.map(function(s) {
                    return <option key={s.id} value={s.id}>{s.name}</option>;
                  })}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Từ ngày</label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={function(e) { setFilterDateFrom(e.target.value); }}
                  className="w-full px-3 py-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Đến ngày</label>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={function(e) { setFilterDateTo(e.target.value); }}
                  className="w-full px-3 py-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )}

        {/* Summary stats */}
        {filteredImports.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Lần import</p>
              <p className="text-2xl font-bold text-gray-100">{filteredImports.length}</p>
            </div>
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Tổng SKU</p>
              <p className="text-2xl font-bold text-gray-100">{allSkuCodes.length.toLocaleString()}</p>
            </div>
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Tổng SP bán</p>
              <p className="text-2xl font-bold text-emerald-400">{totalQty.toLocaleString()}</p>
            </div>
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Loại SP</p>
              <p className="text-2xl font-bold text-blue-400">{productSummary.length}</p>
              {unmatchedCount > 0 && (
                <p className="text-xs text-amber-400 mt-1">{unmatchedCount} SKU chưa mapping</p>
              )}
            </div>
          </div>
        )}

        {/* Product best-seller table */}
        {productSummary.length > 0 && (
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/50">
              <h2 className="font-semibold text-gray-100">Bảng xếp hạng sản phẩm</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Top {productSummary.length} sản phẩm — tổng {totalQty.toLocaleString()} sản phẩm bán ra
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800/80 border-b border-slate-700/50">
                    <th className="text-center px-4 py-2.5 font-medium text-gray-400 w-14">#</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-400">Tên sản phẩm</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-400">Số lượng</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-400">Số đơn chứa SP</th>
                    <th className="text-center px-4 py-2.5 font-medium text-gray-400 w-40">Tỷ trọng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {productSummary.map(function(item, i) {
                    const pct = totalQty > 0 ? item.totalQuantity / totalQty : 0;
                    return (
                      <tr key={i} className="hover:bg-slate-800/50">
                        <td className="px-4 py-3 text-center">
                          {i < 3 ? (
                            <span className={'inline-flex w-7 h-7 rounded-full items-center justify-center text-xs font-bold ' + (
                              i === 0 ? 'bg-yellow-500/15 text-yellow-400' :
                              i === 1 ? 'bg-gray-400/15 text-gray-300' :
                              'bg-amber-700/15 text-amber-600'
                            )}>{i + 1}</span>
                          ) : (
                            <span className="text-gray-500">{i + 1}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={'font-medium ' + (i < 3 ? 'text-gray-100' : 'text-gray-300')}>{item.product}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={'font-semibold ' + (i < 3 ? 'text-emerald-400 text-base' : 'text-gray-200')}>{item.totalQuantity.toLocaleString()}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400">{item.orderCount.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={'h-full rounded-full ' + (i === 0 ? 'bg-yellow-500' : i < 3 ? 'bg-emerald-500' : 'bg-blue-500')}
                                style={{ width: Math.max(pct * 100, 1) + '%' }}
                              />
                            </div>
                            <span className="text-xs text-gray-400 w-12 text-right">{(pct * 100).toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Import history */}
        {imports.length > 0 && (
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/50">
              <h2 className="font-semibold text-gray-100 text-sm">Lịch sử import SKU</h2>
            </div>
            <div className="divide-y divide-slate-800">
              {imports.map(function(imp, i) {
                const shop = shops.find(function(s) { return s.id === imp.shopId; });
                const isFiltered = filteredImports.includes(imp);
                return (
                  <div key={i} className={'flex items-center justify-between px-5 py-3 ' + (isFiltered ? '' : 'opacity-40')}>
                    <div className="flex items-center gap-3">
                      <span className={'inline-flex px-2 py-0.5 rounded text-xs font-medium ' + (
                        shop?.channel === 'TikTok' ? 'bg-pink-500/15 text-pink-400' : 'bg-orange-500/15 text-orange-400'
                      )}>{shop?.channel || 'Shop'}</span>
                      <div>
                        <p className="text-sm text-gray-200">{shop?.name || imp.shopName}</p>
                        <p className="text-xs text-gray-500">{imp.dateFrom} → {imp.dateTo} | {imp.skuCodes.length} SKU</p>
                      </div>
                    </div>
                    <button
                      onClick={function() { handleDeleteImport(i); }}
                      className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                      title="Xoá"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {imports.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-800 flex items-center justify-center">
              <span className="text-3xl">🏆</span>
            </div>
            <p className="text-gray-400 font-medium">Chưa có dữ liệu SKU</p>
            <p className="text-sm text-gray-500 mt-1">Dữ liệu sẽ tự động xuất hiện khi import đơn hàng ở trang Nhập báo cáo</p>
          </div>
        )}
      </div>
    </div>
  );
}
