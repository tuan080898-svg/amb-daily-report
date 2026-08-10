'use client';

import { useState, useMemo, Fragment } from 'react';
import { useAppState } from '@/lib/store';
import { calculateMetrics, formatCurrency, formatPercent, getAlertBg, getAlertDot, toDateString, exportToCSV } from '@/lib/utils';
import { Channel, Region, AlertColor } from '@/lib/types';
import dynamic from 'next/dynamic';

const MonthlyCharts = dynamic(() => import('@/components/MonthlyCharts'), { ssr: false });

export default function DashboardPage() {
  const { currentUser, shops, users, reports, config, getUserShops } = useAppState();
  const [dateFrom, setDateFrom] = useState(toDateString(new Date()));
  const [dateTo, setDateTo] = useState(toDateString(new Date()));
  const [channelFilter, setChannelFilter] = useState<Channel | 'all'>('all');
  const [regionFilter, setRegionFilter] = useState<Region | 'all'>('all');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);

  const userShops = useMemo(() => {
    if (!currentUser) return [];
    return getUserShops(currentUser.id);
  }, [currentUser, getUserShops]);

  const employees = useMemo(() => {
    return users.filter(u => u.role === 'employee');
  }, [users]);

  const filteredShops = useMemo(() => {
    return userShops
      .filter(s => channelFilter === 'all' || s.channel === channelFilter)
      .filter(s => regionFilter === 'all' || s.region === regionFilter)
      .filter(s => employeeFilter === 'all' || s.assignedTo.includes(employeeFilter));
  }, [userShops, channelFilter, regionFilter, employeeFilter]);

  const dailyData = useMemo(() => {
    return filteredShops.map(shop => {
      const shopReports = reports.filter(r => r.shopId === shop.id && r.date >= dateFrom && r.date <= dateTo);
      if (shopReports.length === 0) {
        return { shop, report: null as typeof shopReports[0] | null, metrics: null };
      }
      const aggregated = {
        ...shopReports[0],
        targetRevenue: shopReports.reduce((s, r) => s + r.targetRevenue, 0),
        actualRevenue: shopReports.reduce((s, r) => s + r.actualRevenue, 0),
        adSpend: shopReports.reduce((s, r) => s + r.adSpend, 0),
        totalOrders: shopReports.reduce((s, r) => s + r.totalOrders, 0),
        cancelledOrders: shopReports.reduce((s, r) => s + r.cancelledOrders, 0),
        returnedOrders: shopReports.reduce((s, r) => s + r.returnedOrders, 0),
      };
      const metrics = calculateMetrics(aggregated, config);
      return { shop, report: aggregated, metrics };
    }).sort((a, b) => {
      const colorOrder: Record<AlertColor, number> = { red: 0, yellow: 1, green: 2 };
      const aColor = a.metrics?.revenueAlert || 'green';
      const bColor = b.metrics?.revenueAlert || 'green';
      return colorOrder[aColor] - colorOrder[bColor];
    });
  }, [filteredShops, reports, dateFrom, dateTo, config]);

  const summary = useMemo(() => {
    const withReports = dailyData.filter(d => d.report);
    const totalTarget = withReports.reduce((s, d) => s + (d.report?.targetRevenue || 0), 0);
    const totalActual = withReports.reduce((s, d) => s + (d.report?.actualRevenue || 0), 0);
    const totalAds = withReports.reduce((s, d) => s + (d.report?.adSpend || 0), 0);
    const redCount = withReports.filter(d => d.metrics?.revenueAlert === 'red').length;
    const yellowCount = withReports.filter(d => d.metrics?.revenueAlert === 'yellow').length;
    const greenCount = withReports.filter(d => d.metrics?.revenueAlert === 'green').length;
    return { totalTarget, totalActual, totalAds, redCount, yellowCount, greenCount, reported: withReports.length, total: dailyData.length };
  }, [dailyData]);

  const employeeSummary = useMemo(() => {
    return employees.map(emp => {
      const empShops = filteredShops.filter(s => s.assignedTo.includes(emp.id));
      const empData = empShops.map(s => {
        const shopReports = reports.filter(r => r.shopId === s.id && r.date >= dateFrom && r.date <= dateTo);
        return { shop: s, reports: shopReports };
      });
      const withData = empData.filter(r => r.reports.length > 0);
      const totalTarget = withData.reduce((s, d) => s + d.reports.reduce((a, r) => a + r.targetRevenue, 0), 0);
      const totalRevenue = withData.reduce((s, d) => s + d.reports.reduce((a, r) => a + r.actualRevenue, 0), 0);
      const totalAds = withData.reduce((s, d) => s + d.reports.reduce((a, r) => a + r.adSpend, 0), 0);
      const totalOrders = withData.reduce((s, d) => s + d.reports.reduce((a, r) => a + r.totalOrders, 0), 0);
      const totalCancelled = withData.reduce((s, d) => s + d.reports.reduce((a, r) => a + r.cancelledOrders, 0), 0);
      const totalReturned = withData.reduce((s, d) => s + d.reports.reduce((a, r) => a + r.returnedOrders, 0), 0);
      const pctTarget = totalTarget > 0 ? totalRevenue / totalTarget : 0;
      const pctMkt = totalRevenue > 0 ? totalAds / totalRevenue : 0;
      const pctCancelReturn = totalOrders > 0 ? (totalCancelled + totalReturned) / totalOrders : 0;
      return { emp, shopCount: empShops.length, reportedCount: withData.length, totalTarget, totalRevenue, totalAds, totalOrders, totalCancelled, totalReturned, pctTarget, pctMkt, pctCancelReturn };
    }).filter(e => e.shopCount > 0).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [employees, filteredShops, reports, dateFrom, dateTo]);

  function handleExportCSV() {
    const headers = ['Shop', 'Kênh', 'Target', 'Doanh thu', '%Đạt', 'CP QC', '%MKT', 'Đánh giá MKT', 'Tổng đơn', 'Huỷ', 'Hoàn', '%Hoàn/Huỷ', 'Cảnh báo'];
    const rows = dailyData.map(({ shop, report, metrics }) => [
      shop.name,
      shop.channel,
      report ? formatCurrency(report.targetRevenue) : '',
      report ? formatCurrency(report.actualRevenue) : '',
      metrics ? formatPercent(metrics.targetAchievement) : '',
      report ? formatCurrency(report.adSpend) : '',
      metrics ? formatPercent(metrics.adsToRevenueRatio) : '',
      metrics ? (metrics.adsToRevenueRatio >= config.adsThresholdYellow ? 'Cảnh báo chi phí cao' : metrics.adsToRevenueRatio >= config.adsThresholdGreen ? 'Trong ngưỡng cho phép' : 'Hiệu quả') : '',
      report ? String(report.totalOrders) : '',
      report ? String(report.cancelledOrders) : '',
      report ? String(report.returnedOrders) : '',
      metrics ? formatPercent(metrics.cancelReturnRate) : '',
      metrics?.revenueAlert || '',
    ]);
    const csv = exportToCSV(headers, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bao-cao-${dateFrom}_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!currentUser) return null;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Tổng hợp doanh số {filteredShops.length} shop {dateFrom === dateTo ? `ngày ${dateFrom}` : `từ ${dateFrom} đến ${dateTo}`}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={regionFilter}
            onChange={e => setRegionFilter(e.target.value as Region | 'all')}
            className="px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-200"
          >
            <option value="all">Tất cả khu vực</option>
            <option value="HCM">HCM</option>
            <option value="HN">Hà Nội</option>
          </select>
          <select
            value={channelFilter}
            onChange={e => setChannelFilter(e.target.value as Channel | 'all')}
            className="px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-200"
          >
            <option value="all">Tất cả kênh</option>
            <option value="Shopee">Shopee</option>
            <option value="TikTok">TikTok</option>
          </select>
          <select
            value={employeeFilter}
            onChange={e => setEmployeeFilter(e.target.value)}
            className="px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-200"
          >
            <option value="all">Tất cả NV</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-1.5 border border-slate-600 rounded-lg px-3 py-2 bg-slate-800">
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); if (e.target.value > dateTo) setDateTo(e.target.value); }}
              className="text-sm outline-none bg-transparent text-gray-200"
            />
            <span className="text-gray-500 text-xs">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); if (e.target.value < dateFrom) setDateFrom(e.target.value); }}
              className="text-sm outline-none bg-transparent text-gray-200"
            />
          </div>
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-500 transition-colors"
          >
            Xuất CSV
          </button>
        </div>
      </div>

      {/* Quick date buttons */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs text-gray-500">Nhanh:</span>
        {[
          { label: 'Hôm nay', fn: () => { const d = toDateString(new Date()); setDateFrom(d); setDateTo(d); } },
          { label: 'Hôm qua', fn: () => { const d = new Date(); d.setDate(d.getDate() - 1); const s = toDateString(d); setDateFrom(s); setDateTo(s); } },
          { label: '7 ngày', fn: () => { const end = new Date(); const start = new Date(); start.setDate(end.getDate() - 6); setDateFrom(toDateString(start)); setDateTo(toDateString(end)); } },
          { label: '30 ngày', fn: () => { const end = new Date(); const start = new Date(); start.setDate(end.getDate() - 29); setDateFrom(toDateString(start)); setDateTo(toDateString(end)); } },
          { label: 'Tháng này', fn: () => { const d = new Date(); setDateFrom(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01'); setDateTo(toDateString(d)); } },
          { label: 'Tháng trước', fn: () => { const d = new Date(); const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1); const last = new Date(d.getFullYear(), d.getMonth(), 0); setDateFrom(toDateString(prev)); setDateTo(toDateString(last)); } },
        ].map(btn => (
          <button key={btn.label} onClick={btn.fn} className="px-3 py-1 text-xs rounded-lg bg-slate-800 text-gray-300 hover:bg-slate-700 border border-slate-700 transition-colors">{btn.label}</button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard label="Tổng target" value={formatCurrency(summary.totalTarget)} sub="đ" />
        <SummaryCard
          label="Tổng doanh thu"
          value={formatCurrency(summary.totalActual)}
          sub={summary.totalTarget > 0 ? formatPercent(summary.totalActual / summary.totalTarget) : '0%'}
          highlight={summary.totalTarget > 0 && summary.totalActual >= summary.totalTarget}
        />
        <SummaryCard label="Tổng CP QC" value={formatCurrency(summary.totalAds)} sub={summary.totalActual > 0 ? formatPercent(summary.totalAds / summary.totalActual) : '0%'} />
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-2">Cảnh báo ({summary.reported}/{summary.total} shop đã báo cáo)</p>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500"></span>
              <span className="text-lg font-bold text-gray-100">{summary.redCount}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-amber-500"></span>
              <span className="text-lg font-bold text-gray-100">{summary.yellowCount}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
              <span className="text-lg font-bold text-gray-100">{summary.greenCount}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="mb-6">
        <MonthlyCharts
          reports={reports.filter(r => {
            const shop = filteredShops.find(s => s.id === r.shopId);
            return !!shop && r.date >= dateFrom && r.date <= dateTo;
          })}
          shops={filteredShops}
        />
      </div>

      {/* Employee summary */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-slate-700/50">
          <h2 className="font-semibold text-gray-100">Tổng hợp theo nhân viên</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 border-b border-slate-700/50">
                <th className="text-left px-4 py-3 font-medium text-gray-400">Nhân viên</th>
                <th className="text-center px-4 py-3 font-medium text-gray-400">Shop</th>
                <th className="text-right px-4 py-3 font-medium text-gray-400">Target</th>
                <th className="text-right px-4 py-3 font-medium text-gray-400">Doanh thu</th>
                <th className="text-center px-4 py-3 font-medium text-gray-400">%Đạt</th>
                <th className="text-right px-4 py-3 font-medium text-gray-400">CP QC</th>
                <th className="text-center px-4 py-3 font-medium text-gray-400">%MKT</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">Đánh giá</th>
                <th className="text-right px-4 py-3 font-medium text-gray-400">Đơn</th>
                <th className="text-center px-4 py-3 font-medium text-gray-400">%Hoàn/Huỷ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {employeeSummary.map(({ emp, shopCount, reportedCount, totalTarget, totalRevenue, totalAds, totalOrders, pctTarget, pctMkt, pctCancelReturn }) => {
                const revenueAlert: AlertColor = pctTarget >= 1 ? 'green' : pctTarget >= 0.7 ? 'yellow' : 'red';
                const adsAlert: AlertColor = pctMkt <= config.adsThresholdGreen ? 'green' : pctMkt <= config.adsThresholdYellow ? 'yellow' : 'red';
                const cancelAlert: AlertColor = pctCancelReturn <= config.cancelReturnThresholdYellow ? 'green' : pctCancelReturn <= config.cancelReturnThresholdRed ? 'yellow' : 'red';
                return (
                  <tr
                    key={emp.id}
                    className={`hover:bg-slate-800 cursor-pointer ${employeeFilter === emp.id ? 'bg-blue-500/10' : ''}`}
                    onClick={() => setEmployeeFilter(employeeFilter === emp.id ? 'all' : emp.id)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-200">
                      {emp.name}
                      <span className="text-xs text-gray-500 ml-1">({reportedCount}/{shopCount})</span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-400">{shopCount}</td>
                    <td className="px-4 py-3 text-right text-gray-400">{formatCurrency(totalTarget)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-200">{formatCurrency(totalRevenue)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getAlertBg(revenueAlert)}`}>
                        {formatPercent(pctTarget)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">{formatCurrency(totalAds)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getAlertBg(adsAlert)}`}>
                        {formatPercent(pctMkt)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-left">
                      <span className={`text-xs font-medium ${
                        pctMkt >= config.adsThresholdYellow ? 'text-red-400'
                        : pctMkt >= config.adsThresholdGreen ? 'text-amber-400'
                        : 'text-emerald-400'
                      }`}>
                        {pctMkt >= config.adsThresholdYellow ? 'Cảnh báo chi phí cao'
                        : pctMkt >= config.adsThresholdGreen ? 'Trong ngưỡng cho phép'
                        : 'Hiệu quả'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">{totalOrders}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getAlertBg(cancelAlert)}`}>
                        {formatPercent(pctCancelReturn)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail table */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50">
          <h2 className="font-semibold text-gray-100">Chi tiết theo shop</h2>
          <p className="text-xs text-gray-500 mt-1">Click vào shop để xem chi tiết từng ngày</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 border-b border-slate-700/50">
                <th className="text-left px-4 py-3 font-medium text-gray-400">Shop</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">NV</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">KV</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">Kênh</th>
                <th className="text-right px-4 py-3 font-medium text-gray-400">Target</th>
                <th className="text-right px-4 py-3 font-medium text-gray-400">Doanh thu</th>
                <th className="text-center px-4 py-3 font-medium text-gray-400">%Đạt</th>
                <th className="text-right px-4 py-3 font-medium text-gray-400">CP QC</th>
                <th className="text-center px-4 py-3 font-medium text-gray-400">%MKT</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">Đánh giá</th>
                <th className="text-right px-4 py-3 font-medium text-gray-400">Đơn</th>
                <th className="text-center px-4 py-3 font-medium text-gray-400">%Hoàn/Huỷ</th>
                <th className="text-center px-4 py-3 font-medium text-gray-400">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {dailyData.map(({ shop, report, metrics }) => {
                const isSelected = selectedShopId === shop.id;
                const detail = isSelected ? reports
                  .filter(r => r.shopId === shop.id && r.date >= dateFrom && r.date <= dateTo)
                  .sort((a, b) => a.date.localeCompare(b.date)) : [];
                return (
                  <Fragment key={shop.id}>
                    <tr
                      className={`hover:bg-slate-800 cursor-pointer transition-colors ${isSelected ? 'bg-blue-500/10' : ''}`}
                      onClick={() => setSelectedShopId(isSelected ? null : shop.id)}
                    >
                      <td className="px-4 py-3 font-medium text-gray-200">
                        <span className="flex items-center gap-1.5">
                          <span className={`text-xs transition-transform ${isSelected ? 'rotate-90' : ''}`}>&#9654;</span>
                          {shop.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{users.find(u => shop.assignedTo.includes(u.id))?.name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          shop.region === 'HCM' ? 'bg-blue-500/15 text-blue-400' : 'bg-violet-500/15 text-violet-400'
                        }`}>{shop.region}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          shop.channel === 'Shopee' ? 'bg-orange-500/15 text-orange-400' : 'bg-pink-500/15 text-pink-400'
                        }`}>
                          {shop.channel}
                        </span>
                      </td>
                      {report && metrics ? (
                        <>
                          <td className="px-4 py-3 text-right text-gray-400">{formatCurrency(report.targetRevenue)}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-200">{formatCurrency(report.actualRevenue)}</td>
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
                          <td className="px-4 py-3 text-left">
                            <span className={`text-xs font-medium ${
                              metrics.adsToRevenueRatio >= config.adsThresholdYellow ? 'text-red-400'
                              : metrics.adsToRevenueRatio >= config.adsThresholdGreen ? 'text-amber-400'
                              : 'text-emerald-400'
                            }`}>
                              {metrics.adsToRevenueRatio >= config.adsThresholdYellow ? 'Cảnh báo chi phí cao'
                              : metrics.adsToRevenueRatio >= config.adsThresholdGreen ? 'Trong ngưỡng cho phép'
                              : 'Hiệu quả'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-400">{report.totalOrders}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getAlertBg(metrics.cancelReturnAlert)}`}>
                              {formatPercent(metrics.cancelReturnRate)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`w-3 h-3 rounded-full inline-block ${getAlertDot(metrics.revenueAlert)}`}></span>
                          </td>
                        </>
                      ) : (
                        <td colSpan={11} className="px-4 py-3 text-center text-gray-500 italic">Chưa có báo cáo</td>
                      )}
                    </tr>
                    {isSelected && detail.length > 0 && detail.map(r => {
                      const m = calculateMetrics(r, config);
                      return (
                        <tr key={`${shop.id}-${r.date}`} className="bg-slate-800/40 border-l-2 border-l-blue-500">
                          <td colSpan={4} className="px-4 py-2 pl-10 text-sm text-blue-300">{r.date}</td>
                          <td className="px-4 py-2 text-right text-gray-400 text-sm">{formatCurrency(r.targetRevenue)}</td>
                          <td className="px-4 py-2 text-right font-medium text-gray-200 text-sm">{formatCurrency(r.actualRevenue)}</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getAlertBg(m.revenueAlert)}`}>
                              {formatPercent(m.targetAchievement)}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-gray-400 text-sm">{formatCurrency(r.adSpend)}</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getAlertBg(m.adsAlert)}`}>
                              {formatPercent(m.adsToRevenueRatio)}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-left">
                            <span className={`text-xs font-medium ${
                              m.adsToRevenueRatio >= config.adsThresholdYellow ? 'text-red-400'
                              : m.adsToRevenueRatio >= config.adsThresholdGreen ? 'text-amber-400'
                              : 'text-emerald-400'
                            }`}>
                              {m.adsToRevenueRatio >= config.adsThresholdYellow ? 'CP cao'
                              : m.adsToRevenueRatio >= config.adsThresholdGreen ? 'Trong ngưỡng'
                              : 'Hiệu quả'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-gray-400 text-sm">{r.totalOrders}</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getAlertBg(m.cancelReturnAlert)}`}>
                              {formatPercent(m.cancelReturnRate)}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <span className={`w-3 h-3 rounded-full inline-block ${getAlertDot(m.revenueAlert)}`}></span>
                          </td>
                        </tr>
                      );
                    })}
                    {isSelected && detail.length === 0 && (
                      <tr className="bg-slate-800/40 border-l-2 border-l-blue-500">
                        <td colSpan={13} className="px-4 py-3 pl-10 text-center text-gray-500 italic text-sm">Chưa có dữ liệu từng ngày</td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

function SummaryCard({ label, value, sub, highlight }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div className={`border rounded-xl p-4 ${highlight ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-900 border-slate-700/50'}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-bold ${highlight ? 'text-emerald-400' : 'text-gray-100'}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
    </div>
  );
}
