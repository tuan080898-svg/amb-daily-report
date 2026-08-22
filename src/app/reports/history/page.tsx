'use client';

import { useState, useMemo } from 'react';
import { useAppState } from '@/lib/store';
import { calculateMetrics, formatCurrency, formatPercent, getAlertBg } from '@/lib/utils';

const PAGE_SIZE = 30;

export default function ReportHistoryPage() {
  const { currentUser, shops, reports, config, getUserShops } = useAppState();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [selectedShopId, setSelectedShopId] = useState('all');
  const [page, setPage] = useState(0);

  const userShops = useMemo(() => {
    if (!currentUser) return [];
    return getUserShops(currentUser.id);
  }, [currentUser, getUserShops]);

  const filteredReports = useMemo(() => {
    setPage(0);
    return reports
      .filter(r => r.date.startsWith(selectedMonth))
      .filter(r => selectedShopId === 'all' || r.shopId === selectedShopId)
      .filter(r => userShops.some(s => s.id === r.shopId))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [reports, selectedMonth, selectedShopId, userShops]);

  const summary = useMemo(() => {
    if (filteredReports.length === 0) return null;
    const totalTarget = filteredReports.reduce((s, r) => s + r.targetRevenue, 0);
    const totalRevenue = filteredReports.reduce((s, r) => s + r.actualRevenue, 0);
    const totalAdSpend = filteredReports.reduce((s, r) => s + r.adSpend, 0);
    const totalOrders = filteredReports.reduce((s, r) => s + r.totalOrders, 0);
    const totalCancelled = filteredReports.reduce((s, r) => s + r.cancelledOrders + r.returnedOrders, 0);
    return {
      totalTarget,
      totalRevenue,
      totalAdSpend,
      totalOrders,
      achievement: totalTarget > 0 ? totalRevenue / totalTarget : 0,
      adsRatio: totalRevenue > 0 ? totalAdSpend / totalRevenue : 0,
      cancelRate: totalOrders > 0 ? totalCancelled / totalOrders : 0,
    };
  }, [filteredReports]);

  const totalPages = Math.ceil(filteredReports.length / PAGE_SIZE);
  const pagedReports = filteredReports.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (!currentUser) return null;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Lịch sử báo cáo</h1>
          <p className="text-sm text-gray-500 mt-1">{filteredReports.length} báo cáo trong tháng</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedShopId}
            onChange={e => setSelectedShopId(e.target.value)}
            className="px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-100"
          >
            <option value="all">Tất cả shop</option>
            {userShops.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input
            type="month"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-100"
          />
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-1">Tổng target</p>
            <p className="text-lg font-bold text-gray-100">{formatCurrency(summary.totalTarget)}</p>
          </div>
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-1">Tổng doanh thu</p>
            <p className="text-lg font-bold text-emerald-400">{formatCurrency(summary.totalRevenue)}</p>
          </div>
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-1">% Đạt</p>
            <p className={'text-lg font-bold ' + (summary.achievement >= 1 ? 'text-emerald-400' : summary.achievement >= 0.8 ? 'text-yellow-400' : 'text-red-400')}>{formatPercent(summary.achievement)}</p>
          </div>
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-1">Tổng CP QC</p>
            <p className="text-lg font-bold text-gray-100">{formatCurrency(summary.totalAdSpend)}</p>
            <p className="text-xs text-gray-500">{formatPercent(summary.adsRatio)} DT</p>
          </div>
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-1">Tổng đơn</p>
            <p className="text-lg font-bold text-gray-100">{summary.totalOrders.toLocaleString()}</p>
            <p className="text-xs text-gray-500">{formatPercent(summary.cancelRate)} hủy/hoàn</p>
          </div>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 border-b border-slate-700/50">
                <th className="text-left px-4 py-3 font-medium text-gray-400">Ngày</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">Shop</th>
                <th className="text-right px-4 py-3 font-medium text-gray-400">Target</th>
                <th className="text-right px-4 py-3 font-medium text-gray-400">Doanh thu</th>
                <th className="text-center px-4 py-3 font-medium text-gray-400">%Đạt</th>
                <th className="text-right px-4 py-3 font-medium text-gray-400">CP QC</th>
                <th className="text-center px-4 py-3 font-medium text-gray-400">%MKT</th>
                <th className="text-right px-4 py-3 font-medium text-gray-400">Đơn</th>
                <th className="text-center px-4 py-3 font-medium text-gray-400">%H/H</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {pagedReports.map(report => {
                const shop = shops.find(s => s.id === report.shopId);
                const metrics = calculateMetrics(report, config);
                return (
                  <tr key={report.id} className="hover:bg-slate-800">
                    <td className="px-4 py-3 text-gray-100 font-medium">{report.date}</td>
                    <td className="px-4 py-3 text-gray-400">{shop?.name || report.shopId}</td>
                    <td className="px-4 py-3 text-right text-gray-400">{formatCurrency(report.targetRevenue)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-100">{formatCurrency(report.actualRevenue)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getAlertBg(metrics.revenueAlert)}`}>
                        {formatPercent(metrics.targetAchievement)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">{formatCurrency(report.adSpend)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getAlertBg(metrics.adsAlert)}`}>
                        {formatPercent(metrics.adsToRevenueRatio)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">{report.totalOrders}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getAlertBg(metrics.cancelReturnAlert)}`}>
                        {formatPercent(metrics.cancelReturnRate)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{report.note || '—'}</td>
                  </tr>
                );
              })}
              {filteredReports.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                    Chưa có báo cáo nào trong tháng này
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
            <p className="text-xs text-gray-500">Trang {page + 1}/{totalPages} ({filteredReports.length} dòng)</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1 text-xs rounded-lg bg-slate-800 text-gray-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed">Trước</button>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1 text-xs rounded-lg bg-slate-800 text-gray-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed">Sau</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
