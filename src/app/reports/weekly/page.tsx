'use client';

import { useState, useMemo } from 'react';
import { useAppState } from '@/lib/store';
import { formatCurrency, getDayType, getTargetForDate, getMktForDate, toDateString } from '@/lib/utils';
import { DayType, MonthlyPlan } from '@/lib/types';

interface WeekData {
  weekNum: number;
  label: string;
  days: { date: string; dayType: DayType; isFuture: boolean }[];
  plan: { revenue: number; mkt: number; regularDays: number; saleDays: number };
  actual: { revenue: number; mkt: number; orders: number; cancelled: number; returned: number };
  daysWithReport: number;
}

function getWeeksInMonth(year: number, month: number): { date: string; dayType: DayType }[][] {
  var weeks: { date: string; dayType: DayType }[][] = [];
  var daysInMonth = new Date(year, month, 0).getDate();
  var currentWeek: { date: string; dayType: DayType }[] = [];

  for (var d = 1; d <= daysInMonth; d++) {
    var dateObj = new Date(year, month - 1, d);
    var dayOfWeek = dateObj.getDay();
    var dateStr = year + '-' + String(month).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    currentWeek.push({ date: dateStr, dayType: getDayType(dateStr) });

    if (dayOfWeek === 0 || d === daysInMonth) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  return weeks;
}

function getDayLabel(dt: DayType): string {
  if (dt === 'sale_double') return 'Sale đôi';
  if (dt === 'sale_fixed') return 'Sale cố định';
  return 'Thường';
}

export default function WeeklyPage() {
  var { currentUser, shops, reports, monthlyKPIs, monthlyPlans, getUserShops } = useAppState();

  var userShops = useMemo(function() {
    if (!currentUser) return [];
    return getUserShops(currentUser.id);
  }, [currentUser, getUserShops]);

  var [selectedShopId, setSelectedShopId] = useState('');
  var now = new Date();
  var [selectedMonth, setSelectedMonth] = useState(
    now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
  );

  var selectedShop = useMemo(function() {
    return shops.find(function(s) { return s.id === selectedShopId; });
  }, [shops, selectedShopId]);

  var year = parseInt(selectedMonth.split('-')[0]);
  var month = parseInt(selectedMonth.split('-')[1]);

  var plan = useMemo(function() {
    return monthlyPlans.find(function(p) { return p.shopId === selectedShopId && p.month === selectedMonth; });
  }, [monthlyPlans, selectedShopId, selectedMonth]);

  var kpi = useMemo(function() {
    return monthlyKPIs.find(function(k) { return k.shopId === selectedShopId && k.month === selectedMonth; });
  }, [monthlyKPIs, selectedShopId, selectedMonth]);

  var monthlyTarget = kpi ? kpi.kpiAmount : (selectedShop?.defaultMonthlyTarget || 0);

  var shopReports = useMemo(function() {
    return reports.filter(function(r) {
      return r.shopId === selectedShopId && r.date.startsWith(selectedMonth);
    });
  }, [reports, selectedShopId, selectedMonth]);

  var reportMap = useMemo(function() {
    var map: Record<string, typeof reports[0]> = {};
    shopReports.forEach(function(r) { map[r.date] = r; });
    return map;
  }, [shopReports]);

  var todayStr = toDateString(now);

  var weeks: WeekData[] = useMemo(function() {
    if (!selectedShopId) return [];
    var rawWeeks = getWeeksInMonth(year, month);
    return rawWeeks.map(function(weekDays, i) {
      var planRevenue = 0;
      var planMkt = 0;
      var regularDays = 0;
      var saleDays = 0;
      var actualRevenue = 0;
      var actualMkt = 0;
      var actualOrders = 0;
      var actualCancelled = 0;
      var actualReturned = 0;
      var daysWithReport = 0;

      var days = weekDays.map(function(wd) {
        var isFuture = wd.date > todayStr;
        if (plan) {
          planRevenue += getTargetForDate(wd.date, plan);
          planMkt += getMktForDate(wd.date, plan);
        }
        if (wd.dayType === 'regular') regularDays++;
        else saleDays++;

        var report = reportMap[wd.date];
        if (report) {
          actualRevenue += report.actualRevenue;
          actualMkt += report.adSpend;
          actualOrders += report.totalOrders;
          actualCancelled += report.cancelledOrders;
          actualReturned += report.returnedOrders;
          daysWithReport++;
        }
        return { date: wd.date, dayType: wd.dayType, isFuture: isFuture };
      });

      var firstDate = weekDays[0].date;
      var lastDate = weekDays[weekDays.length - 1].date;
      var d1 = parseInt(firstDate.split('-')[2]);
      var d2 = parseInt(lastDate.split('-')[2]);

      return {
        weekNum: i + 1,
        label: 'Tuần ' + (i + 1) + ' (' + d1 + '/' + month + ' - ' + d2 + '/' + month + ')',
        days: days,
        plan: { revenue: planRevenue, mkt: planMkt, regularDays: regularDays, saleDays: saleDays },
        actual: { revenue: actualRevenue, mkt: actualMkt, orders: actualOrders, cancelled: actualCancelled, returned: actualReturned },
        daysWithReport: daysWithReport,
      };
    });
  }, [selectedShopId, year, month, plan, reportMap, todayStr]);

  var monthSummary = useMemo(function() {
    var totalPlanRevenue = 0;
    var totalPlanMkt = 0;
    var totalActualRevenue = 0;
    var totalActualMkt = 0;
    var totalOrders = 0;
    var totalDaysWithReport = 0;
    var totalDays = 0;
    var futureDays = 0;
    var futureRegular = 0;
    var futureSale = 0;
    var futurePlanRevenue = 0;

    weeks.forEach(function(w) {
      totalPlanRevenue += w.plan.revenue;
      totalPlanMkt += w.plan.mkt;
      totalActualRevenue += w.actual.revenue;
      totalActualMkt += w.actual.mkt;
      totalOrders += w.actual.orders;
      totalDaysWithReport += w.daysWithReport;
      totalDays += w.days.length;
      w.days.forEach(function(d) {
        if (d.isFuture) {
          futureDays++;
          if (d.dayType === 'regular') futureRegular++;
          else futureSale++;
          if (plan) futurePlanRevenue += getTargetForDate(d.date, plan);
        }
      });
    });

    var gap = monthlyTarget - totalActualRevenue;
    var avgNeeded = futureDays > 0 ? gap / futureDays : 0;
    var pctAchieved = monthlyTarget > 0 ? totalActualRevenue / monthlyTarget : 0;
    var mktRatio = totalActualRevenue > 0 ? totalActualMkt / totalActualRevenue : 0;

    return {
      totalPlanRevenue: totalPlanRevenue,
      totalPlanMkt: totalPlanMkt,
      totalActualRevenue: totalActualRevenue,
      totalActualMkt: totalActualMkt,
      totalOrders: totalOrders,
      totalDaysWithReport: totalDaysWithReport,
      totalDays: totalDays,
      futureDays: futureDays,
      futureRegular: futureRegular,
      futureSale: futureSale,
      futurePlanRevenue: futurePlanRevenue,
      gap: gap,
      avgNeeded: avgNeeded,
      pctAchieved: pctAchieved,
      mktRatio: mktRatio,
    };
  }, [weeks, monthlyTarget, plan]);

  var [expandedWeek, setExpandedWeek] = useState<number | null>(null);

  if (!currentUser) return null;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Kế hoạch tuần</h1>
          <p className="text-sm text-gray-500 mt-1">
            Theo dõi tiến độ KPI theo tuần — so sánh kế hoạch và thực tế
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedShopId}
            onChange={function(e) { setSelectedShopId(e.target.value); setExpandedWeek(null); }}
            className="px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-200"
          >
            <option value="">Chọn shop</option>
            {userShops.map(function(s) {
              return <option key={s.id} value={s.id}>{s.name} ({s.channel})</option>;
            })}
          </select>
          <input
            type="month"
            value={selectedMonth}
            onChange={function(e) { setSelectedMonth(e.target.value); setExpandedWeek(null); }}
            className="px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-200"
          />
        </div>
      </div>

      {!selectedShopId && (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-800 flex items-center justify-center">
            <span className="text-3xl">📅</span>
          </div>
          <p className="text-gray-400 font-medium">Chọn shop để xem kế hoạch tuần</p>
        </div>
      )}

      {selectedShopId && !plan && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6">
          <p className="text-amber-400 text-sm font-medium">Chưa có kế hoạch tháng cho shop này</p>
          <p className="text-amber-400/70 text-xs mt-1">
            Vào &quot;Kế hoạch tháng&quot; để thiết lập target ngày thường, ngày sale và budget quảng cáo.
            Hiện chỉ hiển thị dữ liệu thực tế.
          </p>
        </div>
      )}

      {selectedShopId && (
        <div className="space-y-6">
          {/* Monthly overview cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">KPI tháng</p>
              <p className="text-xl font-bold text-gray-100">{formatCurrency(monthlyTarget)}</p>
              {plan && (
                <p className="text-xs text-gray-500 mt-1">KH: {formatCurrency(monthSummary.totalPlanRevenue)}</p>
              )}
            </div>
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Đã đạt</p>
              <p className={'text-xl font-bold ' + (monthSummary.pctAchieved >= 0.8 ? 'text-emerald-400' : monthSummary.pctAchieved >= 0.5 ? 'text-yellow-400' : 'text-red-400')}>
                {formatCurrency(monthSummary.totalActualRevenue)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {(monthSummary.pctAchieved * 100).toFixed(1)}% KPI ({monthSummary.totalDaysWithReport}/{monthSummary.totalDays} ngày)
              </p>
            </div>
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Còn thiếu</p>
              <p className={'text-xl font-bold ' + (monthSummary.gap <= 0 ? 'text-emerald-400' : monthSummary.gap > monthSummary.futurePlanRevenue * 1.2 ? 'text-red-400' : 'text-yellow-400')}>
                {monthSummary.gap <= 0 ? 'Đã đạt!' : formatCurrency(monthSummary.gap)}
              </p>
              {monthSummary.gap > 0 && monthSummary.futureDays > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Cần ~{formatCurrency(Math.round(monthSummary.avgNeeded))}/ngày ({monthSummary.futureDays} ngày còn lại)
                </p>
              )}
            </div>
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">QC / Doanh thu</p>
              <p className={'text-xl font-bold ' + (monthSummary.mktRatio <= 0.15 ? 'text-emerald-400' : monthSummary.mktRatio <= 0.25 ? 'text-yellow-400' : 'text-red-400')}>
                {monthSummary.totalActualRevenue > 0 ? (monthSummary.mktRatio * 100).toFixed(1) + '%' : '—'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Chi QC: {formatCurrency(monthSummary.totalActualMkt)}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          {monthlyTarget > 0 && (
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-300 font-medium">Tiến độ KPI tháng {month}/{year}</span>
                <span className="text-sm font-bold text-gray-100">{(monthSummary.pctAchieved * 100).toFixed(1)}%</span>
              </div>
              <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={'h-full rounded-full transition-all ' + (monthSummary.pctAchieved >= 1 ? 'bg-emerald-500' : monthSummary.pctAchieved >= 0.7 ? 'bg-blue-500' : monthSummary.pctAchieved >= 0.4 ? 'bg-yellow-500' : 'bg-red-500')}
                  style={{ width: Math.min(monthSummary.pctAchieved * 100, 100) + '%' }}
                />
              </div>
              <div className="flex justify-between mt-2 text-xs text-gray-500">
                <span>{formatCurrency(monthSummary.totalActualRevenue)}</span>
                <span>KPI: {formatCurrency(monthlyTarget)}</span>
              </div>
            </div>
          )}

          {/* Gap analysis alert */}
          {monthSummary.gap > 0 && monthSummary.futureDays > 0 && plan && (
            <div className={'border rounded-xl p-4 ' + (
              monthSummary.avgNeeded > plan.saleDoubleDayTarget
                ? 'bg-red-500/10 border-red-500/30'
                : monthSummary.avgNeeded > plan.regularDayTarget * 1.3
                  ? 'bg-amber-500/10 border-amber-500/30'
                  : 'bg-blue-500/10 border-blue-500/30'
            )}>
              <p className={'text-sm font-medium ' + (
                monthSummary.avgNeeded > plan.saleDoubleDayTarget
                  ? 'text-red-400'
                  : monthSummary.avgNeeded > plan.regularDayTarget * 1.3
                    ? 'text-amber-400'
                    : 'text-blue-400'
              )}>
                {monthSummary.avgNeeded > plan.saleDoubleDayTarget
                  ? '⚠️ Rất khó đạt KPI — cần ' + formatCurrency(Math.round(monthSummary.avgNeeded)) + '/ngày, cao hơn cả target ngày sale đôi'
                  : monthSummary.avgNeeded > plan.regularDayTarget * 1.3
                    ? '⚡ Cần tăng tốc — target còn lại ' + formatCurrency(Math.round(monthSummary.avgNeeded)) + '/ngày, cao hơn 30% so với ngày thường'
                    : '✅ Tiến độ tốt — cần duy trì ~' + formatCurrency(Math.round(monthSummary.avgNeeded)) + '/ngày'}
              </p>
              <div className="mt-2 text-xs text-gray-400">
                <span>Còn {monthSummary.futureDays} ngày ({monthSummary.futureRegular} thường + {monthSummary.futureSale} sale)</span>
                {monthSummary.futurePlanRevenue > 0 && (
                  <span> — KH còn lại: {formatCurrency(monthSummary.futurePlanRevenue)}</span>
                )}
              </div>
            </div>
          )}

          {/* Weekly breakdown */}
          <div className="space-y-3">
            {weeks.map(function(w) {
              var isExpanded = expandedWeek === w.weekNum;
              var weekPct = w.plan.revenue > 0 ? w.actual.revenue / w.plan.revenue : 0;
              var allFuture = w.days.every(function(d) { return d.isFuture; });
              var allPast = w.days.every(function(d) { return !d.isFuture; });
              var isCurrentWeek = w.days.some(function(d) { return d.date === todayStr; });

              return (
                <div key={w.weekNum} className={'bg-slate-900 border rounded-xl overflow-hidden ' + (
                  isCurrentWeek ? 'border-blue-500/50' : 'border-slate-700/50'
                )}>
                  <button
                    onClick={function() { setExpandedWeek(isExpanded ? null : w.weekNum); }}
                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-800/50 transition-colors text-left"
                  >
                    <div className="shrink-0">
                      <div className={'w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ' + (
                        isCurrentWeek
                          ? 'bg-blue-500/20 text-blue-400'
                          : allFuture
                            ? 'bg-slate-700/50 text-gray-500'
                            : weekPct >= 0.9
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : weekPct >= 0.7
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : w.daysWithReport > 0
                                  ? 'bg-red-500/20 text-red-400'
                                  : 'bg-slate-700/50 text-gray-500'
                      )}>
                        T{w.weekNum}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-200 text-sm">{w.label}</p>
                        {isCurrentWeek && (
                          <span className="px-2 py-0.5 text-[10px] rounded-full bg-blue-500/20 text-blue-400 font-medium">Tuần này</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {w.plan.regularDays} ngày thường + {w.plan.saleDays} ngày sale
                        {w.daysWithReport > 0 ? ' — ' + w.daysWithReport + '/' + w.days.length + ' ngày có báo cáo' : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {plan && (
                        <p className="text-xs text-gray-500">KH: {formatCurrency(w.plan.revenue)}</p>
                      )}
                      <p className={'font-semibold ' + (
                        w.daysWithReport === 0
                          ? 'text-gray-500'
                          : weekPct >= 0.9
                            ? 'text-emerald-400'
                            : weekPct >= 0.7
                              ? 'text-yellow-400'
                              : 'text-red-400'
                      )}>
                        {w.daysWithReport > 0 ? formatCurrency(w.actual.revenue) : '—'}
                      </p>
                      {w.daysWithReport > 0 && w.plan.revenue > 0 && (
                        <p className="text-xs text-gray-500">{(weekPct * 100).toFixed(0)}% KH</p>
                      )}
                    </div>
                    <svg className={'w-4 h-4 text-gray-500 transition-transform shrink-0 ' + (isExpanded ? 'rotate-180' : '')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-700/50">
                      {/* Week summary row */}
                      {plan && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-5 py-3 bg-slate-800/30">
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">KH Doanh thu</p>
                            <p className="text-sm font-medium text-gray-300">{formatCurrency(w.plan.revenue)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">KH Quảng cáo</p>
                            <p className="text-sm font-medium text-gray-300">{formatCurrency(w.plan.mkt)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">TT Doanh thu</p>
                            <p className={'text-sm font-semibold ' + (w.daysWithReport > 0 ? 'text-emerald-400' : 'text-gray-500')}>
                              {w.daysWithReport > 0 ? formatCurrency(w.actual.revenue) : '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">TT Quảng cáo</p>
                            <p className={'text-sm font-semibold ' + (w.daysWithReport > 0 ? 'text-blue-400' : 'text-gray-500')}>
                              {w.daysWithReport > 0 ? formatCurrency(w.actual.mkt) : '—'}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Daily detail table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-800/50 text-xs text-gray-500">
                              <th className="text-left px-4 py-2 font-medium">Ngày</th>
                              <th className="text-center px-3 py-2 font-medium">Loại</th>
                              {plan && <th className="text-right px-3 py-2 font-medium">KH DT</th>}
                              {plan && <th className="text-right px-3 py-2 font-medium">KH QC</th>}
                              <th className="text-right px-3 py-2 font-medium">TT DT</th>
                              <th className="text-right px-3 py-2 font-medium">TT QC</th>
                              <th className="text-right px-3 py-2 font-medium">Đơn</th>
                              {plan && <th className="text-center px-3 py-2 font-medium">% Đạt</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/50">
                            {w.days.map(function(d) {
                              var report = reportMap[d.date];
                              var dayTarget = plan ? getTargetForDate(d.date, plan) : 0;
                              var dayMkt = plan ? getMktForDate(d.date, plan) : 0;
                              var dayPct = dayTarget > 0 && report ? report.actualRevenue / dayTarget : 0;
                              var dayParts = d.date.split('-');
                              var dateLabel = parseInt(dayParts[2]) + '/' + parseInt(dayParts[1]);
                              var dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
                              var dayOfWeek = new Date(parseInt(dayParts[0]), parseInt(dayParts[1]) - 1, parseInt(dayParts[2])).getDay();
                              var isToday = d.date === todayStr;

                              return (
                                <tr key={d.date} className={
                                  isToday ? 'bg-blue-500/5' : d.isFuture ? 'opacity-50' : 'hover:bg-slate-800/30'
                                }>
                                  <td className="px-4 py-2">
                                    <div className="flex items-center gap-2">
                                      <span className={'text-xs font-medium w-6 ' + (dayOfWeek === 0 ? 'text-red-400' : dayOfWeek === 6 ? 'text-orange-400' : 'text-gray-500')}>
                                        {dayNames[dayOfWeek]}
                                      </span>
                                      <span className={'font-medium ' + (isToday ? 'text-blue-400' : 'text-gray-300')}>{dateLabel}</span>
                                      {isToday && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <span className={'inline-flex px-2 py-0.5 rounded text-[10px] font-medium ' + (
                                      d.dayType === 'sale_double' ? 'bg-red-500/15 text-red-400' :
                                      d.dayType === 'sale_fixed' ? 'bg-orange-500/15 text-orange-400' :
                                      'bg-slate-700/50 text-gray-500'
                                    )}>
                                      {d.dayType === 'regular' ? 'Thường' : d.dayType === 'sale_double' ? 'Sale đôi' : 'Sale'}
                                    </span>
                                  </td>
                                  {plan && <td className="px-3 py-2 text-right text-gray-400">{formatCurrency(dayTarget)}</td>}
                                  {plan && <td className="px-3 py-2 text-right text-gray-500">{formatCurrency(dayMkt)}</td>}
                                  <td className="px-3 py-2 text-right">
                                    <span className={report ? 'font-semibold text-gray-200' : 'text-gray-600'}>
                                      {report ? formatCurrency(report.actualRevenue) : '—'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-right text-gray-400">
                                    {report ? formatCurrency(report.adSpend) : '—'}
                                  </td>
                                  <td className="px-3 py-2 text-right text-gray-400">
                                    {report ? report.totalOrders.toLocaleString() : '—'}
                                  </td>
                                  {plan && (
                                    <td className="px-3 py-2 text-center">
                                      {report && dayTarget > 0 ? (
                                        <span className={'text-xs font-medium px-2 py-0.5 rounded ' + (
                                          dayPct >= 1 ? 'bg-emerald-500/15 text-emerald-400' :
                                          dayPct >= 0.8 ? 'bg-yellow-500/15 text-yellow-400' :
                                          'bg-red-500/15 text-red-400'
                                        )}>
                                          {(dayPct * 100).toFixed(0)}%
                                        </span>
                                      ) : (
                                        <span className="text-gray-600">—</span>
                                      )}
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
