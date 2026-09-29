'use client';

import { useState, useMemo, useEffect, Fragment } from 'react';
import { useAppState } from '@/lib/store';
import { calculateMetrics, formatCurrency, formatPercent, getAlertBg, getAlertDot, toDateString, exportToCSV } from '@/lib/utils';
import { Channel, Region, AlertColor } from '@/lib/types';
import { loadInventory, getReorderAlerts, WAREHOUSE_LABELS, type InventoryData } from '@/lib/inventory';
import dynamic from 'next/dynamic';

const MonthlyCharts = dynamic(() => import('@/components/MonthlyCharts'), { ssr: false });
const AiInsights = dynamic(() => import('@/components/AiInsights'), { ssr: false });

function TrendArrow({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null;
  var pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return null;
  var isUp = pct > 0;
  return (
    <span className={'inline-flex items-center gap-0.5 text-[10px] font-medium ' + (isUp ? 'text-emerald-400' : 'text-red-400')}>
      <span>{isUp ? '▲' : '▼'}</span>
      <span>{Math.abs(pct).toFixed(0)}%</span>
    </span>
  );
}

export default function DashboardPage() {
  const { currentUser, shops, users, reports, config, getUserShops, monthlyKPIs } = useAppState();
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 1); return toDateString(d); });
  const [dateTo, setDateTo] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 1); return toDateString(d); });
  const [channelFilter, setChannelFilter] = useState<Channel | 'all'>('all');
  const [regionFilter, setRegionFilter] = useState<Region | 'all'>('all');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);

  const [inv, setInv] = useState<InventoryData>({ products: {}, transactions: [] });
  useEffect(function() { setInv(loadInventory()); }, []);

  var reorderAlerts = useMemo(function() {
    return getReorderAlerts(inv);
  }, [inv]);

  var alertsByWh = useMemo(function() {
    var hcm = reorderAlerts.filter(function(a) { return a.warehouse === 'HCM'; });
    var hn = reorderAlerts.filter(function(a) { return a.warehouse === 'HN'; });
    return { HCM: hcm, HN: hn };
  }, [reorderAlerts]);

  var criticalCount = reorderAlerts.filter(function(a) { return a.urgency === 'critical'; }).length;
  var warningCount = reorderAlerts.filter(function(a) { return a.urgency === 'warning'; }).length;

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

  // Previous period for trend comparison
  const prevPeriodSummary = useMemo(() => {
    var from = new Date(dateFrom + 'T00:00:00');
    var to = new Date(dateTo + 'T00:00:00');
    var days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
    var prevTo = new Date(from);
    prevTo.setDate(prevTo.getDate() - 1);
    var prevFrom = new Date(prevTo);
    prevFrom.setDate(prevFrom.getDate() - days + 1);
    var pf = toDateString(prevFrom);
    var pt = toDateString(prevTo);
    var shopIds = new Set(filteredShops.map(s => s.id));
    var prevReports = reports.filter(r => shopIds.has(r.shopId) && r.date >= pf && r.date <= pt);
    return {
      totalActual: prevReports.reduce((s, r) => s + r.actualRevenue, 0),
      totalAds: prevReports.reduce((s, r) => s + r.adSpend, 0),
      totalOrders: prevReports.reduce((s, r) => s + r.totalOrders, 0),
      totalCancelled: prevReports.reduce((s, r) => s + r.cancelledOrders + r.returnedOrders, 0),
    };
  }, [filteredShops, reports, dateFrom, dateTo]);

  // Previous period per shop for trend comparison
  const prevByShop = useMemo(() => {
    var from = new Date(dateFrom + 'T00:00:00');
    var to = new Date(dateTo + 'T00:00:00');
    var days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
    var prevTo = new Date(from);
    prevTo.setDate(prevTo.getDate() - 1);
    var prevFrom = new Date(prevTo);
    prevFrom.setDate(prevFrom.getDate() - days + 1);
    var pf = toDateString(prevFrom);
    var pt = toDateString(prevTo);
    var map = new Map<string, { revenue: number; ads: number; orders: number; cancelled: number }>();
    for (var r of reports) {
      if (r.date >= pf && r.date <= pt) {
        var cur = map.get(r.shopId) || { revenue: 0, ads: 0, orders: 0, cancelled: 0 };
        cur.revenue += r.actualRevenue;
        cur.ads += r.adSpend;
        cur.orders += r.totalOrders;
        cur.cancelled += r.cancelledOrders + r.returnedOrders;
        map.set(r.shopId, cur);
      }
    }
    return map;
  }, [reports, dateFrom, dateTo]);

  const summary = useMemo(() => {
    const withReports = dailyData.filter(d => d.report);
    const totalTarget = withReports.reduce((s, d) => s + (d.report?.targetRevenue || 0), 0);
    const totalActual = withReports.reduce((s, d) => s + (d.report?.actualRevenue || 0), 0);
    const totalAds = withReports.reduce((s, d) => s + (d.report?.adSpend || 0), 0);
    const totalOrders = withReports.reduce((s, d) => s + (d.report?.totalOrders || 0), 0);
    const totalCancelled = withReports.reduce((s, d) => s + (d.report?.cancelledOrders || 0) + (d.report?.returnedOrders || 0), 0);
    const redCount = withReports.filter(d => d.metrics?.revenueAlert === 'red').length;
    const yellowCount = withReports.filter(d => d.metrics?.revenueAlert === 'yellow').length;
    const greenCount = withReports.filter(d => d.metrics?.revenueAlert === 'green').length;
    const cancelRate = totalOrders > 0 ? totalCancelled / totalOrders : 0;
    const aov = totalOrders > 0 ? Math.round(totalActual / totalOrders) : 0;
    return { totalTarget, totalActual, totalAds, totalOrders, totalCancelled, cancelRate, aov, redCount, yellowCount, greenCount, reported: withReports.length, total: dailyData.length };
  }, [dailyData]);

  // KPI monthly progress
  const kpiProgress = useMemo(() => {
    var now = new Date();
    var month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    var shopIds = new Set(filteredShops.map(s => s.id));
    var kpis = monthlyKPIs.filter(k => k.month === month && shopIds.has(k.shopId));
    var totalKPI = kpis.reduce((s, k) => s + k.kpiAmount, 0);
    if (totalKPI === 0) return null;
    var monthReports = reports.filter(r => shopIds.has(r.shopId) && r.date.startsWith(month));
    var totalActual = monthReports.reduce((s, r) => s + r.actualRevenue, 0);
    var pct = totalActual / totalKPI;
    var daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var dayOfMonth = now.getDate();
    var daysRemaining = daysInMonth - dayOfMonth;
    var gap = totalKPI - totalActual;
    var reportDays = new Set(monthReports.map(r => r.date)).size;
    var avgPerDay = reportDays > 0 ? totalActual / reportDays : 0;
    var needPerDay = daysRemaining > 0 ? gap / daysRemaining : 0;
    var expectedPct = dayOfMonth / daysInMonth;
    return { month, totalKPI, totalActual, pct, daysRemaining, dayOfMonth, daysInMonth, gap: Math.max(0, gap), avgPerDay, needPerDay, expectedPct, onTrack: pct >= expectedPct };
  }, [filteredShops, monthlyKPIs, reports]);

  // Top 3 shops needing attention
  const topAlertShops = useMemo(() => {
    return dailyData
      .filter(d => d.report && d.metrics)
      .map(d => {
        var score = 0;
        var reasons: string[] = [];
        if (d.metrics!.revenueAlert === 'red') { score += 3; reasons.push('DT ' + formatPercent(d.metrics!.targetAchievement) + ' target'); }
        else if (d.metrics!.revenueAlert === 'yellow') { score += 1; }
        if (d.metrics!.adsAlert === 'red') { score += 2; reasons.push('QC ' + formatPercent(d.metrics!.adsToRevenueRatio) + ' DT'); }
        if (d.metrics!.cancelReturnAlert === 'red') { score += 2; reasons.push('Huy/hoan ' + formatPercent(d.metrics!.cancelReturnRate)); }
        else if (d.metrics!.cancelReturnAlert === 'yellow') { score += 1; }
        var roas = d.report!.adSpend > 0 ? d.report!.actualRevenue / d.report!.adSpend : 0;
        if (roas > 0 && roas < 3) { score += 1; if (!reasons.some(r => r.includes('QC'))) reasons.push('ROAS ' + roas.toFixed(1)); }
        return { ...d, score, reasons };
      })
      .filter(d => d.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
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
      const roas = totalAds > 0 ? totalRevenue / totalAds : 0;
      // Previous period for this employee
      var prevRevenue = 0; var prevAds = 0; var prevOrders = 0; var prevCancelled = 0;
      empShops.forEach(s => {
        var p = prevByShop.get(s.id);
        if (p) { prevRevenue += p.revenue; prevAds += p.ads; prevOrders += p.orders; prevCancelled += p.cancelled; }
      });
      var dtTrend = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;
      var mktTrend = prevAds > 0 ? ((totalAds - prevAds) / prevAds) * 100 : 0;
      // Action note based on specific issues
      var actions: string[] = [];
      if (pctTarget < 0.5 && totalTarget > 0) actions.push('DT chi dat ' + (pctTarget * 100).toFixed(0) + '% target');
      else if (dtTrend < -20 && prevRevenue > 0) actions.push('DT giam ' + Math.abs(dtTrend).toFixed(0) + '% vs truoc');
      if (roas > 0 && roas < 3) actions.push('ROAS ' + roas.toFixed(1) + ' - toi uu QC');
      if (pctCancelReturn > 0.12) actions.push('Huy/hoan ' + (pctCancelReturn * 100).toFixed(0) + '% - kiem tra');
      if (mktTrend > 30 && prevAds > 0) actions.push('QC tang ' + mktTrend.toFixed(0) + '% vs truoc');
      var actionText = actions.length > 0 ? actions[0] : (pctTarget >= 1 ? 'Dat target' : (dtTrend > 10 && prevRevenue > 0 ? 'DT tang ' + dtTrend.toFixed(0) + '%' : 'On dinh'));
      var actionColor = actions.length > 0 ? (pctTarget < 0.5 || (roas > 0 && roas < 2) || pctCancelReturn > 0.15 ? 'text-red-400' : 'text-amber-400') : (pctTarget >= 1 || dtTrend > 10 ? 'text-emerald-400' : 'text-gray-400');
      return { emp, shopCount: empShops.length, reportedCount: withData.length, totalTarget, totalRevenue, totalAds, totalOrders, totalCancelled, totalReturned, pctTarget, pctMkt, pctCancelReturn, roas, prevRevenue, prevAds, prevOrders, prevCancelled, dtTrend, actionText, actionColor };
    }).filter(e => e.shopCount > 0).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [employees, filteredShops, reports, dateFrom, dateTo, prevByShop]);

  function handleExportCSV() {
    const headers = ['Shop', 'Kênh', 'Target', 'Doanh thu', '%Đạt', 'CP QC', '%MKT', 'ROAS', 'CPO', 'Tổng đơn', 'Huỷ', 'Hoàn', '%Hoàn/Huỷ', 'Cảnh báo'];
    const rows = dailyData.map(({ shop, report, metrics }) => {
      var roas = report && report.adSpend > 0 ? (report.actualRevenue / report.adSpend).toFixed(1) : '-';
      var cpo = report && report.totalOrders > 0 ? formatCurrency(Math.round(report.adSpend / report.totalOrders)) : '-';
      return [
        shop.name, shop.channel,
        report ? formatCurrency(report.targetRevenue) : '',
        report ? formatCurrency(report.actualRevenue) : '',
        metrics ? formatPercent(metrics.targetAchievement) : '',
        report ? formatCurrency(report.adSpend) : '',
        metrics ? formatPercent(metrics.adsToRevenueRatio) : '',
        roas, cpo,
        report ? String(report.totalOrders) : '',
        report ? String(report.cancelledOrders) : '',
        report ? String(report.returnedOrders) : '',
        metrics ? formatPercent(metrics.cancelReturnRate) : '',
        metrics?.revenueAlert || '',
      ];
    });
    const csv = exportToCSV(headers, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bao-cao-${dateFrom}_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const missingReports = useMemo(() => {
    if (!dateFrom || !dateTo || dateFrom > dateTo) return [];
    const dates: string[] = [];
    const d = new Date(dateFrom + 'T00:00:00');
    const end = new Date(dateTo + 'T00:00:00');
    while (d <= end) {
      dates.push(toDateString(d));
      d.setDate(d.getDate() + 1);
    }
    const today = toDateString(new Date());
    const validDates = dates.filter(dt => dt < today);
    if (validDates.length === 0) return [];

    return filteredShops.map(shop => {
      const shopReportDates = new Set(
        reports.filter(r => r.shopId === shop.id).map(r => r.date)
      );
      const missing = validDates.filter(dt => !shopReportDates.has(dt));
      return { shop, missing };
    }).filter(item => item.missing.length > 0)
      .sort((a, b) => b.missing.length - a.missing.length);
  }, [filteredShops, reports, dateFrom, dateTo]);

  function handleCopyMissingReport() {
    var lines = missingReports.map(({ shop, missing }) =>
      shop.name + ' (' + shop.channel + '): thieu ' + missing.map(d => d.slice(5)).join(', ')
    );
    var text = 'Nhac bao cao thieu:\n' + lines.join('\n');
    navigator.clipboard.writeText(text);
  }

  if (!currentUser) return null;

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 md:mb-6 gap-3">
        <div className="hidden md:block">
          <h1 className="text-2xl font-bold text-gray-100">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Tổng hợp doanh số {filteredShops.length} shop {dateFrom === dateTo ? `ngày ${dateFrom}` : `từ ${dateFrom} đến ${dateTo}`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={regionFilter}
            onChange={e => setRegionFilter(e.target.value as Region | 'all')}
            className="px-2 md:px-3 py-1.5 md:py-2 border border-slate-600 rounded-lg text-xs md:text-sm bg-slate-800 text-gray-200 flex-1 min-w-0 md:flex-none"
          >
            <option value="all">Khu vực</option>
            <option value="HCM">HCM</option>
            <option value="HN">Hà Nội</option>
          </select>
          <select
            value={channelFilter}
            onChange={e => setChannelFilter(e.target.value as Channel | 'all')}
            className="px-2 md:px-3 py-1.5 md:py-2 border border-slate-600 rounded-lg text-xs md:text-sm bg-slate-800 text-gray-200 flex-1 min-w-0 md:flex-none"
          >
            <option value="all">Kênh</option>
            <option value="Shopee">Shopee</option>
            <option value="TikTok">TikTok</option>
          </select>
          <select
            value={employeeFilter}
            onChange={e => setEmployeeFilter(e.target.value)}
            className="px-2 md:px-3 py-1.5 md:py-2 border border-slate-600 rounded-lg text-xs md:text-sm bg-slate-800 text-gray-200 flex-1 min-w-0 md:flex-none"
          >
            <option value="all">NV</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 border border-slate-600 rounded-lg px-2 md:px-3 py-1.5 md:py-2 bg-slate-800 flex-1 min-w-0">
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); if (e.target.value > dateTo) setDateTo(e.target.value); }}
              className="text-xs md:text-sm outline-none bg-transparent text-gray-200 w-full min-w-0"
            />
            <span className="text-gray-500 text-xs">&rarr;</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); if (e.target.value < dateFrom) setDateFrom(e.target.value); }}
              className="text-xs md:text-sm outline-none bg-transparent text-gray-200 w-full min-w-0"
            />
          </div>
          <button
            onClick={handleExportCSV}
            className="px-3 md:px-4 py-1.5 md:py-2 bg-green-600 text-white rounded-lg text-xs md:text-sm font-medium hover:bg-green-500 transition-colors whitespace-nowrap"
          >
            CSV
          </button>
        </div>
      </div>

      {/* Quick date buttons */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs text-gray-500">Nhanh:</span>
        {[
          { label: 'Hôm qua', fn: () => { const d = new Date(); d.setDate(d.getDate() - 1); const s = toDateString(d); setDateFrom(s); setDateTo(s); } },
          { label: '7 ngày', fn: () => { const end = new Date(); end.setDate(end.getDate() - 1); const start = new Date(); start.setDate(end.getDate() - 6); setDateFrom(toDateString(start)); setDateTo(toDateString(end)); } },
          { label: '30 ngày', fn: () => { const end = new Date(); end.setDate(end.getDate() - 1); const start = new Date(); start.setDate(end.getDate() - 29); setDateFrom(toDateString(start)); setDateTo(toDateString(end)); } },
          { label: 'Tháng này', fn: () => { const d = new Date(); d.setDate(d.getDate() - 1); setDateFrom(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01'); setDateTo(toDateString(d)); } },
          { label: 'Tháng trước', fn: () => { const d = new Date(); const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1); const last = new Date(d.getFullYear(), d.getMonth(), 0); setDateFrom(toDateString(prev)); setDateTo(toDateString(last)); } },
        ].map(btn => (
          <button key={btn.label} onClick={btn.fn} className="px-3 py-1 text-xs rounded-lg bg-slate-800 text-gray-300 hover:bg-slate-700 border border-slate-700 transition-colors">{btn.label}</button>
        ))}
      </div>

      {/* #1 KPI Progress Bar */}
      {kpiProgress && currentUser.role === 'admin' && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 md:p-5 mb-4 md:mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-100 text-sm md:text-base">KPI Tháng {kpiProgress.month.slice(5)}</h2>
              <span className={'px-2 py-0.5 rounded text-xs font-bold ' + (kpiProgress.onTrack ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400')}>
                {kpiProgress.onTrack ? 'Đúng tiến độ' : 'Chậm tiến độ'}
              </span>
            </div>
            <span className="text-xs text-gray-500">Ngày {kpiProgress.dayOfMonth}/{kpiProgress.daysInMonth}, còn {kpiProgress.daysRemaining} ngày</span>
          </div>
          {/* Progress bar */}
          <div className="relative w-full h-6 bg-slate-800 rounded-full overflow-hidden mb-3">
            <div
              className={'h-full rounded-full transition-all ' + (kpiProgress.pct >= 1 ? 'bg-emerald-500' : kpiProgress.onTrack ? 'bg-blue-500' : 'bg-amber-500')}
              style={{ width: Math.min(100, kpiProgress.pct * 100) + '%' }}
            ></div>
            {/* Expected position marker */}
            <div className="absolute top-0 h-full w-0.5 bg-gray-400/50" style={{ left: (kpiProgress.expectedPct * 100) + '%' }}>
              <span className="absolute -top-5 -translate-x-1/2 text-[9px] text-gray-500 whitespace-nowrap">Kỳ vọng</span>
            </div>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow">
              {(kpiProgress.pct * 100).toFixed(0)}%
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-gray-500">KPI:</span>
              <span className="text-gray-200 font-medium ml-1">{formatCurrency(kpiProgress.totalKPI)}</span>
            </div>
            <div>
              <span className="text-gray-500">Đạt:</span>
              <span className="text-gray-200 font-medium ml-1">{formatCurrency(kpiProgress.totalActual)}</span>
            </div>
            <div>
              <span className="text-gray-500">Còn thiếu:</span>
              <span className="text-red-400 font-medium ml-1">{formatCurrency(kpiProgress.gap)}</span>
            </div>
            <div>
              <span className="text-gray-500">Cần/ngày:</span>
              <span className={'font-medium ml-1 ' + (kpiProgress.needPerDay > kpiProgress.avgPerDay * 1.3 ? 'text-red-400' : 'text-emerald-400')}>
                {formatCurrency(Math.round(kpiProgress.needPerDay))}
              </span>
              <span className="text-gray-600 ml-1">(TB {formatCurrency(Math.round(kpiProgress.avgPerDay))})</span>
            </div>
          </div>
        </div>
      )}

      {/* #2 + #4 Enhanced Summary cards with trend */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3 mb-4 md:mb-6">
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-3 md:p-4">
          <p className="text-[10px] md:text-xs text-gray-500 mb-1">Doanh thu</p>
          <p className="text-sm md:text-lg font-bold text-gray-100">{formatCurrency(summary.totalActual)}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] md:text-xs text-gray-500">{summary.totalTarget > 0 ? formatPercent(summary.totalActual / summary.totalTarget) : '—'}</span>
            <TrendArrow current={summary.totalActual} previous={prevPeriodSummary.totalActual} />
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-3 md:p-4">
          <p className="text-[10px] md:text-xs text-gray-500 mb-1">CP Quảng cáo</p>
          <p className="text-sm md:text-lg font-bold text-gray-100">{formatCurrency(summary.totalAds)}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] md:text-xs text-gray-500">{summary.totalActual > 0 ? formatPercent(summary.totalAds / summary.totalActual) : '—'} DT</span>
            <TrendArrow current={summary.totalAds} previous={prevPeriodSummary.totalAds} />
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-3 md:p-4">
          <p className="text-[10px] md:text-xs text-gray-500 mb-1">Tổng đơn</p>
          <p className="text-sm md:text-lg font-bold text-gray-100">{summary.totalOrders.toLocaleString('vi-VN')}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] md:text-xs text-gray-500">AOV {formatCurrency(summary.aov)}</span>
            <TrendArrow current={summary.totalOrders} previous={prevPeriodSummary.totalOrders} />
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-3 md:p-4">
          <p className="text-[10px] md:text-xs text-gray-500 mb-1">Hủy/Hoàn</p>
          <p className={'text-sm md:text-lg font-bold ' + (summary.cancelRate > 0.1 ? 'text-red-400' : summary.cancelRate > 0.05 ? 'text-amber-400' : 'text-gray-100')}>
            {formatPercent(summary.cancelRate)}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] md:text-xs text-gray-500">{summary.totalCancelled} đơn</span>
            <TrendArrow current={summary.totalCancelled} previous={prevPeriodSummary.totalCancelled} />
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-3 md:p-4">
          <p className="text-[10px] md:text-xs text-gray-500 mb-1">ROAS</p>
          <p className={'text-sm md:text-lg font-bold ' + (summary.totalAds > 0 && summary.totalActual / summary.totalAds < 3 ? 'text-amber-400' : 'text-gray-100')}>
            {summary.totalAds > 0 ? (summary.totalActual / summary.totalAds).toFixed(1) : '—'}
          </p>
          <p className="text-[10px] md:text-xs text-gray-500 mt-0.5">CPO {summary.totalOrders > 0 ? formatCurrency(Math.round(summary.totalAds / summary.totalOrders)) : '—'}</p>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-3 md:p-4">
          <p className="text-[10px] md:text-xs text-gray-500 mb-1">Cảnh báo</p>
          <div className="flex items-center gap-2.5 mt-1">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
              <span className="text-sm font-bold text-gray-100">{summary.redCount}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span className="text-sm font-bold text-gray-100">{summary.yellowCount}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span className="text-sm font-bold text-gray-100">{summary.greenCount}</span>
            </span>
          </div>
          <p className="text-[10px] md:text-xs text-gray-500 mt-0.5">{summary.reported}/{summary.total} báo cáo</p>
        </div>
      </div>

      {/* #6 Top shops needing attention */}
      {topAlertShops.length > 0 && (
        <div className="bg-slate-900 border border-red-500/20 rounded-xl overflow-hidden mb-4 md:mb-6">
          <div className="px-3 md:px-5 py-3 md:py-4 border-b border-slate-700/50">
            <h2 className="font-semibold text-gray-100 text-sm md:text-base">Shop cần chú ý</h2>
          </div>
          <div className="divide-y divide-slate-800">
            {topAlertShops.map(({ shop, report, metrics, reasons }) => {
              var roas = report!.adSpend > 0 ? (report!.actualRevenue / report!.adSpend).toFixed(1) : '-';
              return (
                <div key={shop.id} className="px-3 md:px-5 py-3 flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0"></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-200">{shop.name}</span>
                      <span className={'inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ' + (shop.channel === 'Shopee' ? 'bg-orange-500/15 text-orange-400' : 'bg-pink-500/15 text-pink-400')}>{shop.channel}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {reasons.map((r, i) => (
                        <span key={i} className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 rounded text-red-300">{r}</span>
                      ))}
                      <span className="text-gray-500">DT {formatCurrency(report!.actualRevenue)} | ROAS {roas}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Missing reports with #7 copy button */}
      {missingReports.length > 0 && (
        <div className="bg-slate-900 border border-amber-500/30 rounded-xl overflow-hidden mb-4 md:mb-6">
          <div className="px-3 md:px-5 py-3 md:py-4 border-b border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-gray-100 text-sm md:text-base">Báo cáo thiếu</h2>
              <span className="px-2 py-0.5 bg-amber-900/40 text-amber-300 rounded text-xs font-medium">
                {missingReports.length} shop
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyMissingReport}
                className="px-2.5 py-1 text-[10px] md:text-xs bg-amber-600/20 text-amber-400 rounded-lg hover:bg-amber-600/30 border border-amber-600/30 transition-colors"
              >
                Copy nhắc
              </button>
              <span className="text-xs text-gray-500 hidden md:inline">
                {dateFrom === dateTo ? dateFrom : dateFrom + ' → ' + dateTo}
              </span>
            </div>
          </div>
          <div className="divide-y divide-slate-800">
            {missingReports.map(({ shop, missing }) => (
              <div key={shop.id} className="px-3 md:px-5 py-2.5 md:py-3 flex items-start gap-3 md:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm font-medium text-gray-200">{shop.name}</span>
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      shop.channel === 'Shopee' ? 'bg-orange-500/15 text-orange-400' : 'bg-pink-500/15 text-pink-400'
                    }`}>{shop.channel}</span>
                    <span className="text-xs text-red-400 font-medium">thiếu {missing.length} ngày</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {missing.slice(0, 14).map(dt => (
                      <span key={dt} className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-300">
                        {dt.slice(5)}
                      </span>
                    ))}
                    {missing.length > 14 && (
                      <span className="px-2 py-0.5 text-xs text-gray-500">+{missing.length - 14} ngày</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inventory reorder alerts */}
      {reorderAlerts.length > 0 && currentUser.role === 'admin' && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden mb-4 md:mb-6">
          <div className="px-3 md:px-5 py-3 md:py-4 border-b border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3 flex-wrap">
              <h2 className="font-semibold text-gray-100 text-sm md:text-base">Cảnh báo tồn kho</h2>
              {criticalCount > 0 && (
                <span className="px-2 py-0.5 bg-red-900/40 text-red-300 rounded text-xs font-medium">{criticalCount} khẩn cấp</span>
              )}
              {warningCount > 0 && (
                <span className="px-2 py-0.5 bg-amber-900/40 text-amber-300 rounded text-xs font-medium">{warningCount} cần đặt</span>
              )}
            </div>
            <a href="/admin/inventory" className="text-xs text-blue-400 hover:text-blue-300">Chi tiết &rarr;</a>
          </div>
          {(['HCM', 'HN'] as const).map(function(wh) {
            var alerts = alertsByWh[wh];
            if (alerts.length === 0) return null;
            var critical = alerts.filter(function(a) { return a.urgency === 'critical'; });
            var warning = alerts.filter(function(a) { return a.urgency === 'warning'; });
            return (
              <div key={wh} className="px-3 md:px-5 py-3 border-b border-slate-800 last:border-b-0">
                <p className="text-xs font-semibold text-gray-400 mb-2">{WAREHOUSE_LABELS[wh]}</p>
                <div className="space-y-2">
                  {critical.concat(warning).slice(0, 8).map(function(alert) {
                    return (
                      <div key={alert.product + wh} className={'px-2.5 md:px-3 py-2 md:py-2.5 rounded-lg text-xs md:text-sm ' + (alert.urgency === 'critical' ? 'bg-red-950/30 border border-red-800/30' : 'bg-amber-950/30 border border-amber-800/30')}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-gray-200 font-medium truncate mr-2">{alert.product}</span>
                          <span className={'font-bold text-xs md:text-sm whitespace-nowrap ' + (alert.urgency === 'critical' ? 'text-red-400' : 'text-amber-400')}>
                            {alert.urgency === 'critical' ? 'SẮP HẾT' : 'CẦN ĐẶT'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 md:gap-4 text-[10px] md:text-xs text-gray-400">
                          <span>Tồn: <span className="text-gray-200">{alert.currentStock.toLocaleString('vi-VN')}</span></span>
                          <span>Bán/ngày: <span className="text-gray-200">{Math.round(alert.dailySales)}</span></span>
                          <span>Còn: <span className={alert.daysRemaining <= 7 ? 'text-red-400 font-medium' : 'text-gray-200'}>
                            {alert.daysRemaining >= 9999 ? '—' : alert.daysRemaining + ' ngày'}
                          </span></span>
                          <span>ROP: <span className="text-gray-200">{alert.reorderPoint.toLocaleString('vi-VN')}</span></span>
                        </div>
                        {alert.suggestedOrder > 0 && (
                          <div className="mt-1.5 text-[10px] md:text-xs">
                            <span className="text-blue-400">&#8594; Đặt thêm: <span className="font-semibold">{alert.suggestedOrder.toLocaleString('vi-VN')}</span> (lead {alert.leadTimeDays} ngày)</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {alerts.length > 8 && (
                  <p className="text-xs text-gray-500 mt-2">+ {alerts.length - 8} sản phẩm khác</p>
                )}
              </div>
            );
          })}
          <div className="px-5 py-2 border-t border-slate-700/50 text-xs text-gray-500">
            ROP = (bán/ngày × lead time) + buffer 3 ngày. Dữ liệu bán 30 ngày gần nhất.
          </div>
        </div>
      )}

      {/* AI Insights */}
      <AiInsights />

      {/* #5 Charts with target line */}
      <div className="mb-6">
        <MonthlyCharts
          reports={reports.filter(r => {
            const shop = filteredShops.find(s => s.id === r.shopId);
            return !!shop && r.date >= dateFrom && r.date <= dateTo;
          })}
          shops={filteredShops}
          dailyTarget={summary.totalTarget > 0 ? Math.round(summary.totalTarget / Math.max(1, dailyData.filter(d => d.report).length > 0 ? (() => { var from = new Date(dateFrom + 'T00:00:00'); var to = new Date(dateTo + 'T00:00:00'); return Math.round((to.getTime() - from.getTime()) / 86400000) + 1; })() : 1)) : undefined}
        />
      </div>

      {/* Employee summary */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden mb-4 md:mb-6">
        <div className="px-3 md:px-5 py-3 md:py-4 border-b border-slate-700/50">
          <h2 className="font-semibold text-gray-100 text-sm md:text-base">Tổng hợp theo nhân viên</h2>
        </div>
        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-slate-800">
          {employeeSummary.map(({ emp, shopCount, reportedCount, totalRevenue, totalAds, pctTarget, pctMkt, pctCancelReturn, roas, prevRevenue, dtTrend, actionText, actionColor }) => {
            const revenueAlert: AlertColor = pctTarget >= 1 ? 'green' : pctTarget >= 0.7 ? 'yellow' : 'red';
            const adsAlert: AlertColor = pctMkt <= config.adsThresholdGreen ? 'green' : pctMkt <= config.adsThresholdYellow ? 'yellow' : 'red';
            const cancelAlert: AlertColor = pctCancelReturn <= config.cancelReturnThresholdYellow ? 'green' : pctCancelReturn <= config.cancelReturnThresholdRed ? 'yellow' : 'red';
            return (
              <div key={emp.id}
                className={`px-3 py-3 active:bg-slate-800 cursor-pointer ${employeeFilter === emp.id ? 'bg-blue-500/10' : ''}`}
                onClick={() => setEmployeeFilter(employeeFilter === emp.id ? 'all' : emp.id)}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-200">{emp.name}</span>
                    <span className="text-[10px] text-gray-500">({reportedCount}/{shopCount} shop)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <TrendArrow current={totalRevenue} previous={prevRevenue} />
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getAlertBg(revenueAlert)}`}>
                      {formatPercent(pctTarget)}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-1.5">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Doanh thu</span>
                    <span className="text-gray-200 font-medium">{formatCurrency(totalRevenue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">ROAS</span>
                    <span className={'font-medium ' + (roas > 0 && roas < 3 ? 'text-red-400' : 'text-gray-200')}>{roas > 0 ? roas.toFixed(1) : '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">%MKT</span>
                    <span className={`font-medium ${getAlertBg(adsAlert)} px-1.5 rounded`}>{formatPercent(pctMkt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Hoàn/Huỷ</span>
                    <span className={`font-medium ${getAlertBg(cancelAlert)} px-1.5 rounded`}>{formatPercent(pctCancelReturn)}</span>
                  </div>
                </div>
                <div className={`text-[10px] font-medium ${actionColor}`}>{actionText}</div>
              </div>
            );
          })}
        </div>
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 border-b border-slate-700/50">
                <th className="text-left px-4 py-3 font-medium text-gray-400">Nhân viên</th>
                <th className="text-center px-3 py-3 font-medium text-gray-400">Shop</th>
                <th className="text-right px-3 py-3 font-medium text-gray-400">Doanh thu</th>
                <th className="text-center px-3 py-3 font-medium text-gray-400">vs Trước</th>
                <th className="text-center px-3 py-3 font-medium text-gray-400">%Đạt</th>
                <th className="text-center px-3 py-3 font-medium text-gray-400">%MKT</th>
                <th className="text-center px-3 py-3 font-medium text-gray-400">ROAS</th>
                <th className="text-center px-3 py-3 font-medium text-gray-400">%Hoàn/Huỷ</th>
                <th className="text-left px-3 py-3 font-medium text-gray-400">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {employeeSummary.map(({ emp, shopCount, reportedCount, totalRevenue, pctTarget, pctMkt, pctCancelReturn, roas, prevRevenue, dtTrend, actionText, actionColor }) => {
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
                    <td className="px-3 py-3 text-center text-gray-400">{shopCount}</td>
                    <td className="px-3 py-3 text-right">
                      <span className="font-medium text-gray-200">{formatCurrency(totalRevenue)}</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {prevRevenue > 0 ? (
                        <span className={'inline-flex items-center gap-0.5 text-xs font-medium ' + (dtTrend >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                          {dtTrend >= 0 ? '▲' : '▼'} {Math.abs(dtTrend).toFixed(0)}%
                        </span>
                      ) : <span className="text-xs text-gray-600">—</span>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getAlertBg(revenueAlert)}`}>
                        {formatPercent(pctTarget)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getAlertBg(adsAlert)}`}>
                        {formatPercent(pctMkt)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={'text-xs font-medium ' + (roas > 0 && roas < 3 ? 'text-red-400' : roas > 0 && roas < 5 ? 'text-amber-400' : 'text-emerald-400')}>
                        {roas > 0 ? roas.toFixed(1) : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getAlertBg(cancelAlert)}`}>
                        {formatPercent(pctCancelReturn)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-left max-w-[200px]">
                      <span className={`text-xs font-medium ${actionColor}`}>{actionText}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* #3 Detail table with ROAS + CPO */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="px-3 md:px-5 py-3 md:py-4 border-b border-slate-700/50">
          <h2 className="font-semibold text-gray-100 text-sm md:text-base">Chi tiết theo shop</h2>
          <p className="text-xs text-gray-500 mt-1">Bấm vào shop để xem chi tiết từng ngày</p>
        </div>
        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-slate-800">
          {dailyData.map(({ shop, report, metrics }) => {
            const isSelected = selectedShopId === shop.id;
            const detail = isSelected ? reports
              .filter(r => r.shopId === shop.id && r.date >= dateFrom && r.date <= dateTo)
              .sort((a, b) => a.date.localeCompare(b.date)) : [];
            var roas = report && report.adSpend > 0 ? (report.actualRevenue / report.adSpend).toFixed(1) : '-';
            var prev = prevByShop.get(shop.id);
            var shopDtTrend = report && prev && prev.revenue > 0 ? ((report.actualRevenue - prev.revenue) / prev.revenue) * 100 : null;
            var mobileActions: string[] = [];
            if (report && metrics) {
              if (metrics.targetAchievement < 0.5) mobileActions.push('DT qua thap');
              if (roas !== '-' && parseFloat(roas) < 3) mobileActions.push('ROAS thap');
              if (metrics.cancelReturnRate > 0.12) mobileActions.push('Huy cao');
              else if (shopDtTrend !== null && shopDtTrend < -20) mobileActions.push('DT giam ' + Math.abs(shopDtTrend).toFixed(0) + '%');
            }
            var mAction = mobileActions.length > 0 ? mobileActions[0] : '';
            return (
              <div key={shop.id}>
                <div
                  className={`px-3 py-3 active:bg-slate-800 cursor-pointer ${isSelected ? 'bg-blue-500/10' : ''}`}
                  onClick={() => setSelectedShopId(isSelected ? null : shop.id)}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[10px] transition-transform ${isSelected ? 'rotate-90' : ''}`}>&#9654;</span>
                      <span className="text-sm font-medium text-gray-200 truncate">{shop.name}</span>
                      <span className={`shrink-0 inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        shop.channel === 'Shopee' ? 'bg-orange-500/15 text-orange-400' : 'bg-pink-500/15 text-pink-400'
                      }`}>{shop.channel}</span>
                    </div>
                    {metrics ? (
                      <span className={`shrink-0 w-2.5 h-2.5 rounded-full ${getAlertDot(metrics.revenueAlert)}`}></span>
                    ) : null}
                  </div>
                  {report && metrics ? (
                    <div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500">Doanh thu</span>
                          <span className="flex items-center gap-1">
                            <span className="text-gray-200 font-medium">{formatCurrency(report.actualRevenue)}</span>
                            {prev && prev.revenue > 0 && <TrendArrow current={report.actualRevenue} previous={prev.revenue} />}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">%Đạt</span>
                          <span className={`font-medium ${getAlertBg(metrics.revenueAlert)} px-1.5 rounded`}>{formatPercent(metrics.targetAchievement)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">ROAS</span>
                          <span className={'font-medium ' + (roas !== '-' && parseFloat(roas) < 3 ? 'text-amber-400' : 'text-gray-200')}>{roas}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">%MKT</span>
                          <span className={`font-medium ${getAlertBg(metrics.adsAlert)} px-1.5 rounded`}>{formatPercent(metrics.adsToRevenueRatio)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Đơn</span>
                          <span className="text-gray-400">{report.totalOrders}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Hoàn/Huỷ</span>
                          <span className={`font-medium ${getAlertBg(metrics.cancelReturnAlert)} px-1.5 rounded`}>{formatPercent(metrics.cancelReturnRate)}</span>
                        </div>
                      </div>
                      {mAction && <div className="text-[10px] font-medium text-red-400 mt-1">{mAction}</div>}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 italic">Chưa có báo cáo</p>
                  )}
                </div>
                {isSelected && detail.length > 0 && (
                  <div className="bg-slate-800/40 border-l-2 border-l-blue-500">
                    {detail.map(r => {
                      const m = calculateMetrics(r, config);
                      var dRoas = r.adSpend > 0 ? (r.actualRevenue / r.adSpend).toFixed(1) : '-';
                      return (
                        <div key={`${shop.id}-${r.date}`} className="px-3 py-2 border-b border-slate-700/30 last:border-b-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-blue-300 font-medium">{r.date}</span>
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${getAlertBg(m.revenueAlert)}`}>{formatPercent(m.targetAchievement)}</span>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-gray-400">
                            <span>DT: <span className="text-gray-200">{formatCurrency(r.actualRevenue)}</span></span>
                            <span>QC: {formatCurrency(r.adSpend)}</span>
                            <span>ROAS: {dRoas}</span>
                            <span>Đơn: {r.totalOrders}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {isSelected && detail.length === 0 && (
                  <div className="bg-slate-800/40 border-l-2 border-l-blue-500 px-3 py-2">
                    <p className="text-xs text-gray-500 italic">Chưa có dữ liệu từng ngày</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Desktop table with #3 ROAS + CPO columns */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 border-b border-slate-700/50">
                <th className="text-left px-4 py-3 font-medium text-gray-400">Shop</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">NV</th>
                <th className="text-left px-3 py-3 font-medium text-gray-400">KV</th>
                <th className="text-left px-3 py-3 font-medium text-gray-400">Kênh</th>
                <th className="text-right px-3 py-3 font-medium text-gray-400">Target</th>
                <th className="text-right px-3 py-3 font-medium text-gray-400">Doanh thu</th>
                <th className="text-center px-2 py-3 font-medium text-gray-400">vs Trước</th>
                <th className="text-center px-3 py-3 font-medium text-gray-400">%Đạt</th>
                <th className="text-center px-3 py-3 font-medium text-gray-400">%MKT</th>
                <th className="text-center px-3 py-3 font-medium text-gray-400">ROAS</th>
                <th className="text-right px-3 py-3 font-medium text-gray-400">Đơn</th>
                <th className="text-center px-3 py-3 font-medium text-gray-400">%Hoàn/Huỷ</th>
                <th className="text-left px-3 py-3 font-medium text-gray-400">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {dailyData.map(({ shop, report, metrics }) => {
                const isSelected = selectedShopId === shop.id;
                const detail = isSelected ? reports
                  .filter(r => r.shopId === shop.id && r.date >= dateFrom && r.date <= dateTo)
                  .sort((a, b) => a.date.localeCompare(b.date)) : [];
                var roas = report && report.adSpend > 0 ? (report.actualRevenue / report.adSpend).toFixed(1) : '-';
                var prevShop = prevByShop.get(shop.id);
                var shopDtTrend = report && prevShop && prevShop.revenue > 0 ? ((report.actualRevenue - prevShop.revenue) / prevShop.revenue) * 100 : null;
                var shopActions: string[] = [];
                if (report && metrics) {
                  if (metrics.targetAchievement < 0.5) shopActions.push('DT qua thap');
                  else if (shopDtTrend !== null && shopDtTrend < -20) shopActions.push('DT giam ' + Math.abs(shopDtTrend).toFixed(0) + '%');
                  if (roas !== '-' && parseFloat(roas) < 3) shopActions.push('ROAS thap');
                  if (metrics.cancelReturnRate > 0.12) shopActions.push('Huy cao');
                }
                var shopAction = shopActions.length > 0 ? shopActions.join(', ') : (metrics && metrics.targetAchievement >= 1 ? 'Dat target' : (shopDtTrend !== null && shopDtTrend > 10 ? 'DT tang ' + shopDtTrend.toFixed(0) + '%' : ''));
                var shopActionColor = shopActions.length > 0 ? 'text-red-400' : (metrics && metrics.targetAchievement >= 1 || (shopDtTrend !== null && shopDtTrend > 10) ? 'text-emerald-400' : 'text-gray-500');
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
                      <td className="px-3 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          shop.region === 'HCM' ? 'bg-blue-500/15 text-blue-400' : 'bg-violet-500/15 text-violet-400'
                        }`}>{shop.region}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          shop.channel === 'Shopee' ? 'bg-orange-500/15 text-orange-400' : 'bg-pink-500/15 text-pink-400'
                        }`}>{shop.channel}</span>
                      </td>
                      {report && metrics ? (
                        <>
                          <td className="px-3 py-3 text-right font-medium text-gray-200">{formatCurrency(report.actualRevenue)}</td>
                          <td className="px-2 py-3 text-center">
                            {shopDtTrend !== null ? (
                              <span className={'inline-flex items-center gap-0.5 text-[10px] font-medium ' + (shopDtTrend >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                                {shopDtTrend >= 0 ? '▲' : '▼'}{Math.abs(shopDtTrend).toFixed(0)}%
                              </span>
                            ) : <span className="text-[10px] text-gray-600">{'—'}</span>}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getAlertBg(metrics.revenueAlert)}`}>
                              {formatPercent(metrics.targetAchievement)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getAlertBg(metrics.adsAlert)}`}>
                              {formatPercent(metrics.adsToRevenueRatio)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={'text-xs font-medium ' + (roas !== '-' && parseFloat(roas) < 3 ? 'text-red-400' : roas !== '-' && parseFloat(roas) < 5 ? 'text-amber-400' : 'text-emerald-400')}>
                              {roas}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right text-gray-400">{report.totalOrders}</td>
                          <td className="px-3 py-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getAlertBg(metrics.cancelReturnAlert)}`}>
                              {formatPercent(metrics.cancelReturnRate)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-left max-w-[160px]">
                            {shopAction && <span className={`text-[10px] font-medium ${shopActionColor}`}>{shopAction}</span>}
                          </td>
                        </>
                      ) : (
                        <td colSpan={8} className="px-3 py-3 text-center text-gray-500 italic">Chưa có báo cáo</td>
                      )}
                    </tr>
                    {isSelected && detail.length > 0 && detail.map(r => {
                      const m = calculateMetrics(r, config);
                      var dRoas = r.adSpend > 0 ? (r.actualRevenue / r.adSpend).toFixed(1) : '-';
                      return (
                        <tr key={`${shop.id}-${r.date}`} className="bg-slate-800/40 border-l-2 border-l-blue-500">
                          <td colSpan={4} className="px-4 py-2 pl-10 text-sm text-blue-300">{r.date}</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-200 text-sm">{formatCurrency(r.actualRevenue)}</td>
                          <td className="px-2 py-2"></td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getAlertBg(m.revenueAlert)}`}>
                              {formatPercent(m.targetAchievement)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getAlertBg(m.adsAlert)}`}>
                              {formatPercent(m.adsToRevenueRatio)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center text-xs text-gray-400">{dRoas}</td>
                          <td className="px-3 py-2 text-right text-gray-400 text-sm">{r.totalOrders}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getAlertBg(m.cancelReturnAlert)}`}>
                              {formatPercent(m.cancelReturnRate)}
                            </span>
                          </td>
                          <td className="px-3 py-2"></td>
                        </tr>
                      );
                    })}
                    {isSelected && detail.length === 0 && (
                      <tr className="bg-slate-800/40 border-l-2 border-l-blue-500">
                        <td colSpan={12} className="px-4 py-3 pl-10 text-center text-gray-500 italic text-sm">Chưa có dữ liệu từng ngày</td>
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
