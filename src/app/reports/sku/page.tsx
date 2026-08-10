'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useAppState } from '@/lib/store';
import { toDateString } from '@/lib/utils';
import { aggregateProducts, getAllSkuCodes } from '@/lib/sku';
import { Channel } from '@/lib/types';

function getMonthStart(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
}

function getMonthEnd(d: Date): string {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const y = last.getFullYear();
  const m = String(last.getMonth() + 1).padStart(2, '0');
  const day = String(last.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

export default function SkuReportPage() {
  const { currentUser, shops, skuImports, deleteSkuImport, getUserShops } = useAppState();
  const userShops = useMemo(() => {
    if (!currentUser) return [];
    return getUserShops(currentUser.id);
  }, [currentUser, getUserShops]);
  const userShopIds = useMemo(() => new Set(userShops.map(s => s.id)), [userShops]);
  const imports = useMemo(() => skuImports.filter(imp => userShopIds.has(imp.shopId)), [skuImports, userShopIds]);
  const [filterShop, setFilterShop] = useState('all');
  const [filterChannel, setFilterChannel] = useState<Channel | 'all'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized || imports.length === 0) return;
    const allFrom = imports.map(i => i.dateFrom).sort();
    const allTo = imports.map(i => i.dateTo).sort();
    setDateFrom(allFrom[0]);
    setDateTo(allTo[allTo.length - 1]);
    setInitialized(true);
  }, [imports, initialized]);

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
        return { id: imp.shopId, name: shop?.name || imp.shopName, channel: shop?.channel || '' };
      });
  }, [imports, shops]);

  const filteredImports = useMemo(function() {
    return imports.filter(function(imp) {
      if (filterShop !== 'all' && imp.shopId !== filterShop) return false;
      if (filterChannel !== 'all') {
        const shop = shops.find(function(s) { return s.id === imp.shopId; });
        if (shop && shop.channel !== filterChannel) return false;
      }
      if (dateFrom && imp.dateTo < dateFrom) return false;
      if (dateTo && imp.dateFrom > dateTo) return false;
      return true;
    });
  }, [imports, filterShop, filterChannel, dateFrom, dateTo, shops]);

  const allSkuCodes = useMemo(function() {
    return filteredImports.flatMap(function(f) {
      return Object.entries(f.dailySku)
        .filter(function(entry) {
          var d = entry[0];
          return (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
        })
        .flatMap(function(entry) { return entry[1]; });
    });
  }, [filteredImports, dateFrom, dateTo]);

  const productSummary = useMemo(function() {
    if (allSkuCodes.length === 0) return [];
    return aggregateProducts(allSkuCodes);
  }, [allSkuCodes]);

  const totalQty = useMemo(function() {
    return productSummary.reduce(function(sum, p) { return sum + p.totalQuantity; }, 0);
  }, [productSummary]);

  const unmatchedDetails = useMemo(function() {
    const knownSkus = new Set(getAllSkuCodes());
    var byCode: Record<string, { count: number; shops: Set<string> }> = {};
    filteredImports.forEach(function(f) {
      var shop = shops.find(function(s) { return s.id === f.shopId; });
      var shopName = shop?.name || f.shopName;
      Object.entries(f.dailySku).forEach(function(entry) {
        var d = entry[0]; var codes = entry[1];
        if (dateFrom && d < dateFrom) return;
        if (dateTo && d > dateTo) return;
        codes.forEach(function(c) {
          if (knownSkus.has(c)) return;
          if (!byCode[c]) byCode[c] = { count: 0, shops: new Set() };
          byCode[c].count++;
          byCode[c].shops.add(shopName);
        });
      });
    });
    return Object.entries(byCode)
      .map(function(e) { return { sku: e[0], count: e[1].count, shops: Array.from(e[1].shops) }; })
      .sort(function(a, b) { return b.count - a.count; });
  }, [filteredImports, dateFrom, dateTo, shops]);

  const unmatchedCount = unmatchedDetails.reduce(function(s, d) { return s + d.count; }, 0);
  const [showUnmapped, setShowUnmapped] = useState(false);

  function setQuickRange(type: 'all' | 'today' | 'thisMonth' | 'lastMonth' | 'last3Months') {
    const now = new Date();
    if (type === 'all') {
      if (imports.length > 0) {
        const allFrom = imports.map(i => i.dateFrom).sort();
        const allTo = imports.map(i => i.dateTo).sort();
        setDateFrom(allFrom[0]);
        setDateTo(allTo[allTo.length - 1]);
      }
    } else if (type === 'today') {
      const d = toDateString(now);
      setDateFrom(d);
      setDateTo(d);
    } else if (type === 'thisMonth') {
      setDateFrom(getMonthStart(now));
      setDateTo(getMonthEnd(now));
    } else if (type === 'lastMonth') {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      setDateFrom(getMonthStart(prev));
      setDateTo(getMonthEnd(prev));
    } else if (type === 'last3Months') {
      const prev3 = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      setDateFrom(getMonthStart(prev3));
      setDateTo(getMonthEnd(now));
    }
  }

  function handleDeleteImport(idx: number) {
    const imp = imports[idx];
    if (imp?.id) deleteSkuImport(imp.id);
  }

  const dateLabel = dateFrom === dateTo
    ? 'ngày ' + dateFrom
    : dateFrom.slice(0, 7) === dateTo.slice(0, 7)
      ? 'tháng ' + dateFrom.slice(0, 7)
      : 'từ ' + dateFrom + ' đến ' + dateTo;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header + Filters — same style as Dashboard */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Sản phẩm bán chạy</h1>
          <p className="text-sm text-gray-500 mt-1">
            {productSummary.length > 0
              ? totalQty.toLocaleString() + ' sản phẩm bán ra ' + dateLabel
              : 'Dữ liệu SKU tổng hợp từ các lần import đơn hàng'}
          </p>
        </div>
        {imports.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={filterShop}
              onChange={function(e) { setFilterShop(e.target.value); }}
              className="px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-200"
            >
              <option value="all">Tất cả shop</option>
              {shopOptions.map(function(s) {
                return <option key={s.id} value={s.id}>{s.name}</option>;
              })}
            </select>
            <select
              value={filterChannel}
              onChange={function(e) { setFilterChannel(e.target.value as Channel | 'all'); }}
              className="px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-200"
            >
              <option value="all">Tất cả kênh</option>
              <option value="Shopee">Shopee</option>
              <option value="TikTok">TikTok</option>
            </select>
            <div className="flex items-center gap-1.5 border border-slate-600 rounded-lg px-3 py-2 bg-slate-800">
              <input
                type="date"
                value={dateFrom}
                onChange={function(e) { setDateFrom(e.target.value); if (e.target.value > dateTo) setDateTo(e.target.value); }}
                className="text-sm outline-none bg-transparent text-gray-200"
              />
              <span className="text-gray-500 text-xs">&rarr;</span>
              <input
                type="date"
                value={dateTo}
                onChange={function(e) { setDateTo(e.target.value); if (e.target.value < dateFrom) setDateFrom(e.target.value); }}
                className="text-sm outline-none bg-transparent text-gray-200"
              />
            </div>
          </div>
        )}
      </div>

      {/* Quick date buttons */}
      {imports.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className="text-xs text-gray-500">Nhanh:</span>
          <button onClick={function() { setQuickRange('all'); }} className="px-3 py-1 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 border border-blue-500 transition-colors font-medium">Tất cả</button>
          <button onClick={function() { setQuickRange('today'); }} className="px-3 py-1 text-xs rounded-lg bg-slate-800 text-gray-300 hover:bg-slate-700 border border-slate-700 transition-colors">Hôm nay</button>
          <button onClick={function() { setQuickRange('thisMonth'); }} className="px-3 py-1 text-xs rounded-lg bg-slate-800 text-gray-300 hover:bg-slate-700 border border-slate-700 transition-colors">Tháng này</button>
          <button onClick={function() { setQuickRange('lastMonth'); }} className="px-3 py-1 text-xs rounded-lg bg-slate-800 text-gray-300 hover:bg-slate-700 border border-slate-700 transition-colors">Tháng trước</button>
          <button onClick={function() { setQuickRange('last3Months'); }} className="px-3 py-1 text-xs rounded-lg bg-slate-800 text-gray-300 hover:bg-slate-700 border border-slate-700 transition-colors">3 tháng</button>
        </div>
      )}

      <div className="space-y-6">
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
                <button
                  onClick={function() { setShowUnmapped(!showUnmapped); }}
                  className="text-xs text-amber-400 mt-1 hover:text-amber-300 underline decoration-dotted cursor-pointer"
                >{unmatchedCount} SKU chưa mapping {showUnmapped ? '▲' : '▼'}</button>
              )}
            </div>
          </div>
        )}

        {/* Unmapped SKU detail */}
        {showUnmapped && unmatchedDetails.length > 0 && (
          <div className="bg-slate-900 border border-amber-500/30 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-amber-400 text-sm">SKU chưa mapping</h2>
                <p className="text-xs text-gray-500 mt-0.5">{unmatchedDetails.length} mã SKU cần bổ sung vào bảng mapping</p>
              </div>
              <button
                onClick={function() { setShowUnmapped(false); }}
                className="p-1.5 text-gray-500 hover:text-gray-300 rounded transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800/80 border-b border-slate-700/50">
                    <th className="text-left px-4 py-2.5 font-medium text-gray-400">Mã SKU</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-400">Số lần xuất hiện</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-400">Shop</th>
                    <th className="text-center px-4 py-2.5 font-medium text-gray-400 w-24"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {unmatchedDetails.map(function(item) {
                    return (
                      <tr key={item.sku} className="hover:bg-slate-800/50">
                        <td className="px-4 py-2.5">
                          <code className="px-2 py-0.5 bg-slate-800 rounded text-amber-300 text-xs font-mono">{item.sku}</code>
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-300">{item.count}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {item.shops.map(function(s) {
                              return <span key={s} className="inline-flex px-2 py-0.5 rounded text-xs bg-slate-800 text-gray-400">{s}</span>;
                            })}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <Link
                            href={'/admin/sku?add=' + encodeURIComponent(item.sku)}
                            className="inline-flex px-2 py-1 rounded text-xs bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors"
                          >+ Mapping</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
                        <p className="text-xs text-gray-500">{imp.dateFrom} &rarr; {imp.dateTo} | {Object.values(imp.dailySku).reduce(function(sum, arr) { return sum + arr.length; }, 0)} SKU</p>
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

        {/* No results for filter */}
        {imports.length > 0 && filteredImports.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-400">Không có dữ liệu SKU trong khoảng thời gian này</p>
            <p className="text-sm text-gray-500 mt-1">Dữ liệu có sẵn: {imports.map(i => i.dateFrom).sort()[0]} → {imports.map(i => i.dateTo).sort().reverse()[0]}</p>
            <button
              onClick={function() { setQuickRange('all'); }}
              className="mt-3 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
            >Xem tất cả dữ liệu</button>
          </div>
        )}
      </div>
    </div>
  );
}
