'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAppState } from '@/lib/store';
import { toDateString, formatCurrency } from '@/lib/utils';
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

export default function AnalyticsPage() {
  const { currentUser, shops, analyticsImports, deleteAnalytics, getUserShops } = useAppState();
  const userShops = useMemo(function() {
    if (!currentUser) return [];
    return getUserShops(currentUser.id);
  }, [currentUser, getUserShops]);
  const userShopIds = useMemo(function() { return new Set(userShops.map(function(s) { return s.id; })); }, [userShops]);
  const imports = useMemo(function() { return analyticsImports.filter(function(imp) { return userShopIds.has(imp.shopId); }); }, [analyticsImports, userShopIds]);
  const [filterShop, setFilterShop] = useState('all');
  const [filterChannel, setFilterChannel] = useState<Channel | 'all'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [initialized, setInitialized] = useState(false);

  useEffect(function() {
    if (initialized || imports.length === 0) return;
    const allFrom = imports.map(function(i) { return i.dateFrom; }).sort();
    const allTo = imports.map(function(i) { return i.dateTo; }).sort();
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

  // Merge hourly data across filtered imports
  const mergedHourly = useMemo(function() {
    const hourly: { hour: number; revenue: number; orders: number }[] = [];
    for (var h = 0; h < 24; h++) {
      hourly.push({ hour: h, revenue: 0, orders: 0 });
    }
    filteredImports.forEach(function(imp) {
      imp.hourlyData.forEach(function(hd) {
        if (hd.hour >= 0 && hd.hour < 24) {
          hourly[hd.hour].revenue += hd.revenue;
          hourly[hd.hour].orders += hd.orders;
        }
      });
    });
    return hourly;
  }, [filteredImports]);

  // Merge province data across filtered imports
  const mergedProvince = useMemo(function() {
    const provMap: Record<string, { revenue: number; orders: number }> = {};
    filteredImports.forEach(function(imp) {
      imp.provinceData.forEach(function(pd) {
        if (!provMap[pd.province]) provMap[pd.province] = { revenue: 0, orders: 0 };
        provMap[pd.province].revenue += pd.revenue;
        provMap[pd.province].orders += pd.orders;
      });
    });
    return Object.entries(provMap)
      .map(function(entry) {
        return { province: entry[0], revenue: entry[1].revenue, orders: entry[1].orders };
      })
      .sort(function(a, b) { return b.revenue - a.revenue; });
  }, [filteredImports]);

  const totalRevenue = useMemo(function() {
    return mergedHourly.reduce(function(sum, h) { return sum + h.revenue; }, 0);
  }, [mergedHourly]);

  const totalOrders = useMemo(function() {
    return mergedHourly.reduce(function(sum, h) { return sum + h.orders; }, 0);
  }, [mergedHourly]);

  const maxHourlyRevenue = useMemo(function() {
    return Math.max.apply(null, mergedHourly.map(function(h) { return h.revenue; }));
  }, [mergedHourly]);

  // Find peak hours (top 3)
  const peakHours = useMemo(function() {
    return mergedHourly
      .filter(function(h) { return h.revenue > 0; })
      .sort(function(a, b) { return b.revenue - a.revenue; })
      .slice(0, 3)
      .map(function(h) { return h.hour; })
      .sort(function(a, b) { return a - b; });
  }, [mergedHourly]);

  const totalProvinceRevenue = useMemo(function() {
    return mergedProvince.reduce(function(sum, p) { return sum + p.revenue; }, 0);
  }, [mergedProvince]);

  function setQuickRange(type: 'all' | 'yesterday' | 'thisMonth' | 'lastMonth' | 'last3Months') {
    const now = new Date();
    if (type === 'all') {
      if (imports.length > 0) {
        const allFrom = imports.map(function(i) { return i.dateFrom; }).sort();
        const allTo = imports.map(function(i) { return i.dateTo; }).sort();
        setDateFrom(allFrom[0]);
        setDateTo(allTo[allTo.length - 1]);
      }
    } else if (type === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const d = toDateString(y);
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
    if (imp?.id) deleteAnalytics(imp.id);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header + Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Phân tích chi tiết</h1>
          <p className="text-sm text-gray-500 mt-1">
            {filteredImports.length > 0
              ? formatCurrency(totalRevenue) + ' doanh thu | ' + totalOrders.toLocaleString() + ' đơn hàng'
              : 'Dữ liệu phân tích từ các lần import đơn hàng'}
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
          <button onClick={function() { setQuickRange('yesterday'); }} className="px-3 py-1 text-xs rounded-lg bg-slate-800 text-gray-300 hover:bg-slate-700 border border-slate-700 transition-colors">Hôm qua</button>
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
              <p className="text-xs text-gray-500 mb-1">Tổng doanh thu</p>
              <p className="text-2xl font-bold text-emerald-400">{formatCurrency(totalRevenue)}</p>
            </div>
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Tổng đơn hàng</p>
              <p className="text-2xl font-bold text-blue-400">{totalOrders.toLocaleString()}</p>
            </div>
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Số tỉnh/thành</p>
              <p className="text-2xl font-bold text-violet-400">{mergedProvince.length}</p>
            </div>
          </div>
        )}

        {/* Section 1: Hourly chart */}
        {filteredImports.length > 0 && maxHourlyRevenue > 0 && (
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/50">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-gray-100">Doanh thu theo giờ</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Phân bổ doanh thu 24 giờ trong ngày
                  </p>
                </div>
                {peakHours.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Khung giờ cao điểm:</span>
                    <span className="inline-flex px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-400">
                      {peakHours.map(function(h) { return h + 'h'; }).join(', ')}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="p-5">
              {/* Bar chart */}
              <div className="flex items-end gap-1 h-48 mb-2">
                {mergedHourly.map(function(h) {
                  const heightPct = maxHourlyRevenue > 0 ? (h.revenue / maxHourlyRevenue) * 100 : 0;
                  const isPeak = peakHours.indexOf(h.hour) >= 0;
                  return (
                    <div key={h.hour} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                        <div className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-xl">
                          <p className="font-semibold text-gray-200">{h.hour}h00</p>
                          <p className="text-emerald-400">{formatCurrency(h.revenue)} VND</p>
                          <p className="text-blue-400">{h.orders} đơn</p>
                        </div>
                      </div>
                      {/* Bar */}
                      <div
                        className={'w-full rounded-t transition-all ' + (isPeak ? 'bg-emerald-500' : h.revenue > 0 ? 'bg-blue-500/70' : 'bg-slate-700/30')}
                        style={{ height: Math.max(heightPct, h.revenue > 0 ? 2 : 0) + '%' }}
                      />
                    </div>
                  );
                })}
              </div>
              {/* Hour labels */}
              <div className="flex gap-1">
                {mergedHourly.map(function(h) {
                  return (
                    <div key={h.hour} className="flex-1 text-center">
                      <p className="text-[10px] text-gray-500">{h.hour}</p>
                    </div>
                  );
                })}
              </div>
              {/* Order count row */}
              <div className="flex gap-1 mt-1">
                {mergedHourly.map(function(h) {
                  return (
                    <div key={h.hour} className="flex-1 text-center">
                      <p className={'text-[9px] ' + (h.orders > 0 ? 'text-blue-400' : 'text-transparent')}>{h.orders}</p>
                    </div>
                  );
                })}
              </div>
              {/* Legend */}
              <div className="flex items-center justify-center gap-6 mt-4 pt-3 border-t border-slate-800">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-emerald-500" />
                  <span className="text-xs text-gray-400">Giờ cao điểm</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-blue-500/70" />
                  <span className="text-xs text-gray-400">Doanh thu</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-blue-400">N</span>
                  <span className="text-xs text-gray-400">Số đơn</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section 2: Province table */}
        {mergedProvince.length > 0 && (
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/50">
              <h2 className="font-semibold text-gray-100">Doanh thu theo tỉnh/thành</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Top {mergedProvince.length} tỉnh/thành phố — tổng {formatCurrency(totalProvinceRevenue)} VND
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800/80 border-b border-slate-700/50">
                    <th className="text-center px-4 py-2.5 font-medium text-gray-400 w-14">#</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-400">Tỉnh/Thành</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-400">Doanh thu</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-400">Số đơn</th>
                    <th className="text-center px-4 py-2.5 font-medium text-gray-400 w-40">Tỷ trọng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {mergedProvince.map(function(item, i) {
                    const pct = totalProvinceRevenue > 0 ? item.revenue / totalProvinceRevenue : 0;
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
                          <span className={'font-medium ' + (i < 3 ? 'text-gray-100' : 'text-gray-300')}>{item.province}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={'font-semibold ' + (i < 3 ? 'text-emerald-400 text-base' : 'text-gray-200')}>{formatCurrency(item.revenue)}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400">{item.orders.toLocaleString()}</td>
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

        {/* Section 3: Import history */}
        {imports.length > 0 && (
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/50">
              <h2 className="font-semibold text-gray-100 text-sm">Lịch sử import phân tích</h2>
            </div>
            <div className="divide-y divide-slate-800">
              {imports.map(function(imp, i) {
                const shop = shops.find(function(s) { return s.id === imp.shopId; });
                const isFiltered = filteredImports.includes(imp);
                const totalRev = imp.hourlyData.reduce(function(s, h) { return s + h.revenue; }, 0);
                const totalOrd = imp.hourlyData.reduce(function(s, h) { return s + h.orders; }, 0);
                return (
                  <div key={i} className={'flex items-center justify-between px-5 py-3 ' + (isFiltered ? '' : 'opacity-40')}>
                    <div className="flex items-center gap-3">
                      <span className={'inline-flex px-2 py-0.5 rounded text-xs font-medium ' + (
                        shop?.channel === 'TikTok' ? 'bg-pink-500/15 text-pink-400' : 'bg-orange-500/15 text-orange-400'
                      )}>{shop?.channel || 'Shop'}</span>
                      <div>
                        <p className="text-sm text-gray-200">{shop?.name || imp.shopName}</p>
                        <p className="text-xs text-gray-500">
                          {imp.dateFrom} &rarr; {imp.dateTo} | {formatCurrency(totalRev)} | {totalOrd} đơn | {imp.provinceData.length} tỉnh
                        </p>
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
              <span className="text-3xl">📈</span>
            </div>
            <p className="text-gray-400 font-medium">Chưa có dữ liệu phân tích</p>
            <p className="text-sm text-gray-500 mt-1">Dữ liệu sẽ tự động xuất hiện khi import đơn hàng ở trang Nhập báo cáo</p>
          </div>
        )}

        {/* No results for filter */}
        {imports.length > 0 && filteredImports.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-400">Không có dữ liệu phân tích trong khoảng thời gian này</p>
            <p className="text-sm text-gray-500 mt-1">
              Dữ liệu có sẵn: {imports.map(function(i) { return i.dateFrom; }).sort()[0]} &rarr; {imports.map(function(i) { return i.dateTo; }).sort().reverse()[0]}
            </p>
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
