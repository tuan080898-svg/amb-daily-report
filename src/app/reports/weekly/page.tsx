'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useAppState } from '@/lib/store';
import { formatCurrency, getDayType, getTargetForDate, getMktForDate, toDateString } from '@/lib/utils';
import { DayType, WeeklyAction, ActionStatus, MonthlyPlanNote, ProductTarget } from '@/lib/types';
import { aggregateProducts } from '@/lib/sku';

interface WeekData {
  weekNum: number;
  label: string;
  days: { date: string; dayType: DayType; isFuture: boolean }[];
  plan: { revenue: number; mkt: number; regularDays: number; saleDays: number };
  actual: { revenue: number; mkt: number; orders: number; cancelled: number; returned: number };
  daysWithReport: number;
  roas: number;
  cpo: number;
  cancelReturnRate: number;
  avgRegularRevenue: number;
  avgSaleRevenue: number;
  missingReportDays: string[];
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

function TrendArrow({ current, previous, suffix, inverse }: { current: number; previous: number; suffix?: string; inverse?: boolean }) {
  if (!previous || !current) return null;
  var pct = ((current - previous) / previous) * 100;
  var isUp = pct > 0;
  var isGood = inverse ? !isUp : isUp;
  if (Math.abs(pct) < 1) return null;
  return (
    <span className={'text-[10px] font-medium ' + (isGood ? 'text-emerald-400' : 'text-red-400')}>
      {isUp ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}%{suffix || ''}
    </span>
  );
}

export default function WeeklyPage() {
  var { currentUser, shops, reports, monthlyKPIs, monthlyPlans, getUserShops, weeklyActions, addWeeklyAction, updateWeeklyAction, deleteWeeklyAction, monthlyPlanNotes, saveMonthlyPlanNote, updatePlan, updateKPI, skuImports } = useAppState();

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
      var regularRevenue = 0;
      var regularReportDays = 0;
      var saleRevenue = 0;
      var saleReportDays = 0;
      var missingReportDays: string[] = [];

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
          if (wd.dayType === 'regular') { regularRevenue += report.actualRevenue; regularReportDays++; }
          else { saleRevenue += report.actualRevenue; saleReportDays++; }
        } else if (!isFuture) {
          missingReportDays.push(wd.date);
        }
        return { date: wd.date, dayType: wd.dayType, isFuture: isFuture };
      });

      var firstDate = weekDays[0].date;
      var lastDate = weekDays[weekDays.length - 1].date;
      var d1 = parseInt(firstDate.split('-')[2]);
      var d2 = parseInt(lastDate.split('-')[2]);

      var roas = actualMkt > 0 ? actualRevenue / actualMkt : 0;
      var cpo = actualOrders > 0 ? actualMkt / actualOrders : 0;
      var totalProcessed = actualOrders > 0 ? (actualCancelled + actualReturned) / actualOrders : 0;

      return {
        weekNum: i + 1,
        label: 'Tuần ' + (i + 1) + ' (' + d1 + '/' + month + ' - ' + d2 + '/' + month + ')',
        days: days,
        plan: { revenue: planRevenue, mkt: planMkt, regularDays: regularDays, saleDays: saleDays },
        actual: { revenue: actualRevenue, mkt: actualMkt, orders: actualOrders, cancelled: actualCancelled, returned: actualReturned },
        daysWithReport: daysWithReport,
        roas: roas,
        cpo: cpo,
        cancelReturnRate: totalProcessed,
        avgRegularRevenue: regularReportDays > 0 ? regularRevenue / regularReportDays : 0,
        avgSaleRevenue: saleReportDays > 0 ? saleRevenue / saleReportDays : 0,
        missingReportDays: missingReportDays,
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
  var [newTaskTitle, setNewTaskTitle] = useState('');
  var [newTaskDeadline, setNewTaskDeadline] = useState('');

  // Sticky KPI bar
  var kpiSectionRef = useRef<HTMLDivElement>(null);
  var [showStickyKPI, setShowStickyKPI] = useState(false);

  useEffect(function() {
    if (!kpiSectionRef.current) return;
    var observer = new IntersectionObserver(function(entries) {
      setShowStickyKPI(!entries[0].isIntersecting);
    }, { threshold: 0 });
    observer.observe(kpiSectionRef.current);
    return function() { observer.disconnect(); };
  }, [selectedShopId]);

  // Auto-expand current week
  useEffect(function() {
    if (weeks.length > 0 && expandedWeek === null) {
      var currentWeek = weeks.find(function(w) {
        return w.days.some(function(d) { return d.date === todayStr; });
      });
      if (currentWeek) setExpandedWeek(currentWeek.weekNum);
    }
  }, [weeks, todayStr]);

  var weekActionsForWeek = function(weekStart: string) {
    if (!selectedShopId) return [];
    return weeklyActions.filter(function(a) {
      return a.shopId === selectedShopId && a.weekStart === weekStart;
    });
  };

  var allMonthActions = useMemo(function() {
    if (!selectedShopId) return [];
    return weeklyActions.filter(function(a) {
      return a.shopId === selectedShopId && a.month === selectedMonth;
    });
  }, [weeklyActions, selectedShopId, selectedMonth]);

  var taskAlerts = useMemo(function() {
    if (!selectedShopId) return { overdue: [] as WeeklyAction[], upcoming: [] as WeeklyAction[], todayDue: [] as WeeklyAction[] };
    var threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    var threeDaysStr = toDateString(threeDaysLater);
    var overdue: WeeklyAction[] = [];
    var upcoming: WeeklyAction[] = [];
    var todayDue: WeeklyAction[] = [];

    weeklyActions.filter(function(a) {
      return a.shopId === selectedShopId && a.status !== 'done' && a.deadline;
    }).forEach(function(a) {
      if (a.deadline < todayStr) overdue.push(a);
      else if (a.deadline === todayStr) todayDue.push(a);
      else if (a.deadline <= threeDaysStr) upcoming.push(a);
    });

    overdue.sort(function(a, b) { return a.deadline.localeCompare(b.deadline); });
    upcoming.sort(function(a, b) { return a.deadline.localeCompare(b.deadline); });
    return { overdue: overdue, upcoming: upcoming, todayDue: todayDue };
  }, [weeklyActions, selectedShopId, todayStr]);

  // Previous month recap
  var prevMonthStr = useMemo(function() {
    var m = month - 1;
    var y = year;
    if (m < 1) { m = 12; y--; }
    return y + '-' + String(m).padStart(2, '0');
  }, [year, month]);

  var prevMonthRecap = useMemo(function() {
    if (!selectedShopId) return null;
    var prevReports = reports.filter(function(r) { return r.shopId === selectedShopId && r.date.startsWith(prevMonthStr); });
    if (prevReports.length === 0) return null;

    var totalRevenue = 0;
    var totalMkt = 0;
    var totalOrders = 0;
    var totalCancelled = 0;
    var totalReturned = 0;
    prevReports.forEach(function(r) {
      totalRevenue += r.actualRevenue;
      totalMkt += r.adSpend;
      totalOrders += r.totalOrders;
      totalCancelled += r.cancelledOrders;
      totalReturned += r.returnedOrders;
    });

    var roas = totalMkt > 0 ? totalRevenue / totalMkt : 0;
    var cpo = totalOrders > 0 ? totalMkt / totalOrders : 0;
    var cancelReturnRate = totalOrders > 0 ? (totalCancelled + totalReturned) / totalOrders : 0;
    var avgDaily = prevReports.length > 0 ? totalRevenue / prevReports.length : 0;
    var prevM = parseInt(prevMonthStr.split('-')[1]);

    return {
      month: prevM,
      revenue: totalRevenue,
      mkt: totalMkt,
      orders: totalOrders,
      cancelled: totalCancelled,
      returned: totalReturned,
      roas: roas,
      cpo: cpo,
      cancelReturnRate: cancelReturnRate,
      avgDaily: avgDaily,
      daysWithReport: prevReports.length,
    };
  }, [reports, selectedShopId, prevMonthStr]);

  var growthNeeded = useMemo(function() {
    if (!prevMonthRecap || !monthlyTarget) return null;
    var pct = prevMonthRecap.revenue > 0 ? ((monthlyTarget - prevMonthRecap.revenue) / prevMonthRecap.revenue) * 100 : 0;
    var suggestedMkt = prevMonthRecap.roas > 0 ? monthlyTarget / prevMonthRecap.roas : 0;
    return { pct: pct, suggestedMkt: suggestedMkt };
  }, [prevMonthRecap, monthlyTarget]);

  // Planning note
  var currentNote = useMemo(function() {
    if (!selectedShopId) return null;
    return monthlyPlanNotes.find(function(n) { return n.shopId === selectedShopId && n.month === selectedMonth; }) || null;
  }, [monthlyPlanNotes, selectedShopId, selectedMonth]);

  // Product data per week: actual qty/revenue + cumulative vs targets
  var weeklyProductData = useMemo(function() {
    if (!selectedShopId || !currentNote?.productTargets?.length || weeks.length === 0) return [];
    var skuMap: Record<string, string[]> = {};
    skuImports.forEach(function(si) {
      if (si.shopId !== selectedShopId) return;
      if (si.dateTo < selectedMonth + '-01' || si.dateFrom > selectedMonth + '-31') return;
      Object.entries(si.dailySku).forEach(function([date, codes]) {
        if (date.startsWith(selectedMonth)) {
          if (!skuMap[date]) skuMap[date] = [];
          skuMap[date] = skuMap[date].concat(codes);
        }
      });
    });
    var cumMap: Record<string, { qty: number; revenue: number }> = {};
    return weeks.map(function(w) {
      var weekSkus: string[] = [];
      w.days.forEach(function(d) {
        if (skuMap[d.date]) weekSkus = weekSkus.concat(skuMap[d.date]);
      });
      var weekProducts = aggregateProducts(weekSkus);
      var totalWeekQty = weekProducts.reduce(function(s, p) { return s + p.totalQuantity; }, 0);
      return currentNote!.productTargets.map(function(pt) {
        var wp = weekProducts.find(function(p) { return p.product === pt.product; });
        var weekQty = wp ? wp.totalQuantity : 0;
        var weekRevenue = totalWeekQty > 0 && w.actual.revenue > 0
          ? Math.round((weekQty / totalWeekQty) * w.actual.revenue)
          : 0;
        if (!cumMap[pt.product]) cumMap[pt.product] = { qty: 0, revenue: 0 };
        cumMap[pt.product].qty += weekQty;
        cumMap[pt.product].revenue += weekRevenue;
        return {
          product: pt.product,
          weekQty: weekQty,
          weekRevenue: weekRevenue,
          cumQty: cumMap[pt.product].qty,
          cumRevenue: cumMap[pt.product].revenue,
          targetQty: pt.targetQty,
          targetRevenue: pt.targetRevenue,
        };
      });
    });
  }, [selectedShopId, weeks, skuImports, currentNote, selectedMonth]);

  var [showPlanning, setShowPlanning] = useState(false);
  var [noteStrategy, setNoteStrategy] = useState('');
  var [noteProductFocus, setNoteProductFocus] = useState('');
  var [notePromoPlan, setNotePromoPlan] = useState('');

  useEffect(function() {
    if (currentNote) {
      setNoteStrategy(currentNote.strategy);
      setNoteProductFocus(currentNote.productFocus);
      setNotePromoPlan(currentNote.promoPlan);
    } else {
      setNoteStrategy('');
      setNoteProductFocus('');
      setNotePromoPlan('');
    }
  }, [currentNote]);

  function handleSaveNote() {
    if (!currentUser || !selectedShopId) return;
    var note: MonthlyPlanNote = {
      id: currentNote?.id || ('mpn-' + selectedShopId + '-' + selectedMonth),
      shopId: selectedShopId,
      month: selectedMonth,
      strategy: noteStrategy,
      productFocus: noteProductFocus,
      promoPlan: notePromoPlan,
      productTargets: currentNote?.productTargets || [],
      createdBy: currentNote?.createdBy || currentUser.id,
      createdAt: currentNote?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveMonthlyPlanNote(note);
  }

  // Smart plan calculator state
  var [calcTarget, setCalcTarget] = useState('');
  var [calcAds, setCalcAds] = useState('');
  var [calcSaleDouble, setCalcSaleDouble] = useState('');
  var [calcSaleDoubleAds, setCalcSaleDoubleAds] = useState('');
  var [calcSaleFixed, setCalcSaleFixed] = useState('');
  var [calcSaleFixedAds, setCalcSaleFixedAds] = useState('');
  var [calcSaved, setCalcSaved] = useState(false);

  // Count day types in selected month
  var dayTypeCounts = useMemo(function() {
    if (!selectedShopId) return { regular: 0, saleDouble: 0, saleFixed: 0, total: 0 };
    var daysInMonth = new Date(year, month, 0).getDate();
    var regular = 0;
    var saleDouble = 0;
    var saleFixed = 0;
    for (var d = 1; d <= daysInMonth; d++) {
      var dateStr = year + '-' + String(month).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var dt = getDayType(dateStr);
      if (dt === 'sale_double') saleDouble++;
      else if (dt === 'sale_fixed') saleFixed++;
      else regular++;
    }
    return { regular: regular, saleDouble: saleDouble, saleFixed: saleFixed, total: daysInMonth };
  }, [selectedShopId, year, month]);

  // Auto-calculate regular day targets
  var calcResults = useMemo(function() {
    var totalTarget = parseFloat(calcTarget) || 0;
    var totalAds = parseFloat(calcAds) || 0;
    var saleDoublePerDay = parseFloat(calcSaleDouble) || 0;
    var saleDoubleAdsPerDay = parseFloat(calcSaleDoubleAds) || 0;
    var saleFixedPerDay = parseFloat(calcSaleFixed) || 0;
    var saleFixedAdsPerDay = parseFloat(calcSaleFixedAds) || 0;

    var totalSaleRevenue = (saleDoublePerDay * dayTypeCounts.saleDouble) + (saleFixedPerDay * dayTypeCounts.saleFixed);
    var totalSaleAds = (saleDoubleAdsPerDay * dayTypeCounts.saleDouble) + (saleFixedAdsPerDay * dayTypeCounts.saleFixed);

    var remainingRevenue = totalTarget - totalSaleRevenue;
    var remainingAds = totalAds - totalSaleAds;

    var regularDayTarget = dayTypeCounts.regular > 0 ? Math.round(remainingRevenue / dayTypeCounts.regular) : 0;
    var regularDayAds = dayTypeCounts.regular > 0 ? Math.round(remainingAds / dayTypeCounts.regular) : 0;

    var saleDayMkt = dayTypeCounts.saleDouble > 0 || dayTypeCounts.saleFixed > 0
      ? Math.round(totalSaleAds / (dayTypeCounts.saleDouble + dayTypeCounts.saleFixed))
      : 0;

    return {
      totalSaleRevenue: totalSaleRevenue,
      totalSaleAds: totalSaleAds,
      remainingRevenue: remainingRevenue,
      remainingAds: remainingAds,
      regularDayTarget: regularDayTarget,
      regularDayAds: regularDayAds,
      saleDayMkt: saleDayMkt,
      isValid: totalTarget > 0 && regularDayTarget > 0,
    };
  }, [calcTarget, calcAds, calcSaleDouble, calcSaleDoubleAds, calcSaleFixed, calcSaleFixedAds, dayTypeCounts]);

  // Load existing plan into calculator
  useEffect(function() {
    if (plan) {
      var totalRevenue = (plan.regularDayTarget * dayTypeCounts.regular)
        + (plan.saleDoubleDayTarget * dayTypeCounts.saleDouble)
        + (plan.saleFixedDayTarget * dayTypeCounts.saleFixed);
      setCalcTarget(totalRevenue > 0 ? String(totalRevenue) : '');
      setCalcAds(plan.totalMktBudget > 0 ? String(plan.totalMktBudget) : '');
      setCalcSaleDouble(plan.saleDoubleDayTarget > 0 ? String(plan.saleDoubleDayTarget) : '');
      setCalcSaleFixed(plan.saleFixedDayTarget > 0 ? String(plan.saleFixedDayTarget) : '');
      var saleDoubleAds = plan.saleDayMkt || 0;
      setCalcSaleDoubleAds(saleDoubleAds > 0 ? String(saleDoubleAds) : '');
      setCalcSaleFixedAds(saleDoubleAds > 0 ? String(saleDoubleAds) : '');
    } else {
      setCalcTarget(kpi ? String(kpi.kpiAmount) : '');
      setCalcAds('');
      setCalcSaleDouble('');
      setCalcSaleDoubleAds('');
      setCalcSaleFixed('');
      setCalcSaleFixedAds('');
    }
    setCalcSaved(false);
  }, [plan, kpi, selectedShopId, selectedMonth, dayTypeCounts]);

  function handleSavePlan() {
    if (!selectedShopId || !calcResults.isValid) return;
    var totalTarget = parseFloat(calcTarget) || 0;
    var totalAds = parseFloat(calcAds) || 0;
    var saleDoublePerDay = parseFloat(calcSaleDouble) || 0;
    var saleFixedPerDay = parseFloat(calcSaleFixed) || 0;

    var newPlan = {
      shopId: selectedShopId,
      month: selectedMonth,
      regularDayTarget: calcResults.regularDayTarget,
      saleDoubleDayTarget: saleDoublePerDay,
      saleFixedDayTarget: saleFixedPerDay,
      totalMktBudget: totalAds,
      regularDayMkt: calcResults.regularDayAds,
      saleDayMkt: calcResults.saleDayMkt,
      dailyOverrides: plan?.dailyOverrides || {},
    };
    updatePlan(newPlan);

    var newKpi = {
      shopId: selectedShopId,
      month: selectedMonth,
      kpiAmount: totalTarget,
    };
    updateKPI(newKpi);

    setCalcSaved(true);
    setTimeout(function() { setCalcSaved(false); }, 2000);
  }

  // Product breakdown: T9 results + T10 plan
  var prevMonthProducts = useMemo(function() {
    if (!selectedShopId || !prevMonthStr) return [];
    var shopSkuImports = skuImports.filter(function(s) {
      return s.shopId === selectedShopId && s.dateFrom <= prevMonthStr + '-31' && s.dateTo >= prevMonthStr + '-01';
    });
    if (shopSkuImports.length === 0) return [];

    var allCodes: string[] = [];
    var lastDay = new Date(parseInt(prevMonthStr.split('-')[0]), parseInt(prevMonthStr.split('-')[1]), 0).getDate();
    shopSkuImports.forEach(function(imp) {
      for (var d = 1; d <= lastDay; d++) {
        var dateStr = prevMonthStr + '-' + String(d).padStart(2, '0');
        var codes = imp.dailySku[dateStr];
        if (codes) allCodes = allCodes.concat(codes);
      }
    });

    if (allCodes.length === 0) return [];
    var products = aggregateProducts(allCodes);
    var totalQty = products.reduce(function(s, p) { return s + p.totalQuantity; }, 0);
    var prevRevenue = prevMonthRecap ? prevMonthRecap.revenue : 0;

    return products.slice(0, 20).map(function(p) {
      var share = totalQty > 0 ? p.totalQuantity / totalQty : 0;
      return {
        product: p.product,
        qty: p.totalQuantity,
        orders: p.orderCount,
        share: share,
        estRevenue: Math.round(prevRevenue * share),
      };
    });
  }, [skuImports, selectedShopId, prevMonthStr, prevMonthRecap]);

  // Editable product targets for next month
  var [productTargets, setProductTargets] = useState<Record<string, { targetQty: string; targetRevenue: string }>>({});
  var [productTargetsSaved, setProductTargetsSaved] = useState(false);

  // Initialize product targets from saved note or from suggestions
  useEffect(function() {
    var targets: Record<string, { targetQty: string; targetRevenue: string }> = {};
    if (currentNote && currentNote.productTargets && currentNote.productTargets.length > 0) {
      currentNote.productTargets.forEach(function(pt) {
        targets[pt.product] = { targetQty: String(pt.targetQty || ''), targetRevenue: String(pt.targetRevenue || '') };
      });
    } else if (prevMonthProducts.length > 0) {
      var totalTarget = monthlyTarget || 0;
      prevMonthProducts.forEach(function(p) {
        targets[p.product] = {
          targetQty: String(Math.round(p.qty * 1.1)),
          targetRevenue: totalTarget > 0 ? String(Math.round(totalTarget * p.share)) : '',
        };
      });
    }
    setProductTargets(targets);
    setProductTargetsSaved(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNote, prevMonthProducts]);

  function handleSaveProductTargets() {
    if (!currentUser || !selectedShopId) return;
    var ptArr: ProductTarget[] = prevMonthProducts.map(function(p) {
      var t = productTargets[p.product] || { targetQty: '', targetRevenue: '' };
      return {
        product: p.product,
        prevQty: p.qty,
        prevRevenue: p.estRevenue,
        targetQty: parseInt(t.targetQty) || 0,
        targetRevenue: parseInt(t.targetRevenue) || 0,
      };
    });
    var note: MonthlyPlanNote = {
      id: currentNote?.id || ('mpn-' + selectedShopId + '-' + selectedMonth),
      shopId: selectedShopId,
      month: selectedMonth,
      strategy: noteStrategy,
      productFocus: noteProductFocus,
      promoPlan: notePromoPlan,
      productTargets: ptArr,
      createdBy: currentNote?.createdBy || currentUser.id,
      createdAt: currentNote?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveMonthlyPlanNote(note);
    setProductTargetsSaved(true);
    setTimeout(function() { setProductTargetsSaved(false); }, 2000);
  }

  var taskTemplates = [
    'Review hiệu quả quảng cáo',
    'Check tồn kho sản phẩm chủ lực',
    'Chạy flash sale / voucher',
    'Trả lời đánh giá khách hàng',
    'Cập nhật hình ảnh sản phẩm',
    'Phân tích đối thủ cạnh tranh',
    'Lên content mạng xã hội',
    'Kiểm tra đóng gói & vận chuyển',
  ];

  function getWeekSuggestions(w: WeekData, wi: number) {
    if (w.daysWithReport === 0) return [];
    var suggestions: string[] = [];
    var weekPct = w.plan.revenue > 0 ? w.actual.revenue / w.plan.revenue : 0;
    if (weekPct < 0.8 && weekPct > 0) {
      suggestions.push('Tăng ngân sách quảng cáo tuần này (' + (weekPct * 100).toFixed(0) + '% KH)');
    }
    if (weekPct < 0.6 && weekPct > 0) {
      suggestions.push('Chạy flash sale để đẩy doanh thu');
    }
    var mktRatio = w.actual.revenue > 0 ? w.actual.mkt / w.actual.revenue : 0;
    if (mktRatio > 0.15) {
      suggestions.push('Review quảng cáo - chi phí MKT ' + (mktRatio * 100).toFixed(0) + '% DT');
    }
    if (w.cancelReturnRate > 0.08) {
      suggestions.push('Kiểm tra chất lượng đóng gói - huỷ/hoàn ' + (w.cancelReturnRate * 100).toFixed(1) + '%');
    }
    if (weeklyProductData[wi]) {
      weeklyProductData[wi].forEach(function(p) {
        if (p.targetRevenue > 0 && p.cumRevenue > 0) {
          var dailyRate = monthSummary.totalDaysWithReport > 0 ? p.cumRevenue / monthSummary.totalDaysWithReport : 0;
          var projected = p.cumRevenue + dailyRate * monthSummary.futureDays;
          if (projected < p.targetRevenue * 0.7) {
            suggestions.push('Đẩy mạnh SP "' + p.product + '" - dự báo chỉ đạt ' + (p.targetRevenue > 0 ? (projected / p.targetRevenue * 100).toFixed(0) : 0) + '% KH');
          }
        }
      });
    }
    return suggestions.slice(0, 4);
  }

  function handleAddTask(weekStart: string) {
    if (!newTaskTitle.trim() || !currentUser) return;
    var action: WeeklyAction = {
      id: 'wa-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      shopId: selectedShopId,
      weekStart: weekStart,
      month: selectedMonth,
      title: newTaskTitle.trim(),
      deadline: newTaskDeadline,
      status: 'pending',
      createdBy: currentUser.id,
      createdAt: new Date().toISOString(),
    };
    addWeeklyAction(action);
    setNewTaskTitle('');
    setNewTaskDeadline('');
  }

  function handleQuickAddTask(weekStart: string, title: string, weekEnd: string) {
    if (!currentUser) return;
    var action: WeeklyAction = {
      id: 'wa-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      shopId: selectedShopId,
      weekStart: weekStart,
      month: selectedMonth,
      title: title,
      deadline: weekEnd,
      status: 'pending',
      createdBy: currentUser.id,
      createdAt: new Date().toISOString(),
    };
    addWeeklyAction(action);
  }

  function cycleStatus(action: WeeklyAction) {
    var next: ActionStatus = action.status === 'pending' ? 'in_progress' : action.status === 'in_progress' ? 'done' : 'pending';
    updateWeeklyAction({ ...action, status: next });
  }

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
            Mở phần &quot;Lập kế hoạch tháng&quot; bên dưới để nhập mục tiêu và tự động phân bổ.
          </p>
        </div>
      )}

      {/* Monthly planning section */}
      {selectedShopId && (
        <div className="mb-6">
          <button
            onClick={function() { setShowPlanning(!showPlanning); }}
            className="w-full flex items-center justify-between px-5 py-3 bg-slate-900 border border-slate-700/50 rounded-xl hover:bg-slate-800/70 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center">
                <span className="text-sm">📋</span>
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-gray-200">Lập kế hoạch tháng {month}/{year}</p>
                <p className="text-xs text-gray-500">
                  {plan ? 'Đã có kế hoạch · ' + formatCurrency(plan.regularDayTarget) + '/ngày thường' : 'Chưa lập — bấm để bắt đầu'}
                  {prevMonthRecap ? ' · T' + prevMonthRecap.month + ': ' + formatCurrency(prevMonthRecap.revenue) : ''}
                </p>
              </div>
            </div>
            <svg className={'w-4 h-4 text-gray-500 transition-transform ' + (showPlanning ? 'rotate-180' : '')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>

          {showPlanning && (
            <div className="mt-3 space-y-4">
              {/* Previous month recap */}
              {prevMonthRecap && (
                <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
                  <h3 className="text-sm font-medium text-gray-300 mb-3">
                    Kết quả tháng {prevMonthRecap.month} (tháng trước)
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider">Doanh thu</p>
                      <p className="text-lg font-bold text-gray-100">{formatCurrency(prevMonthRecap.revenue)}</p>
                      <p className="text-xs text-gray-500">TB {formatCurrency(Math.round(prevMonthRecap.avgDaily))}/ngày</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider">Đơn hàng</p>
                      <p className="text-lg font-bold text-gray-100">{prevMonthRecap.orders.toLocaleString()}</p>
                      <p className="text-xs text-gray-500">{prevMonthRecap.daysWithReport} ngày báo cáo</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider">ROAS</p>
                      <p className={'text-lg font-bold ' + (prevMonthRecap.roas >= 4 ? 'text-emerald-400' : prevMonthRecap.roas >= 2.5 ? 'text-yellow-400' : 'text-red-400')}>
                        {prevMonthRecap.roas > 0 ? prevMonthRecap.roas.toFixed(1) + 'x' : '—'}
                      </p>
                      <p className="text-xs text-gray-500">Chi QC: {formatCurrency(prevMonthRecap.mkt)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider">Huỷ + Hoàn</p>
                      <p className={'text-lg font-bold ' + (prevMonthRecap.cancelReturnRate > 0.1 ? 'text-red-400' : 'text-emerald-400')}>
                        {(prevMonthRecap.cancelReturnRate * 100).toFixed(1)}%
                      </p>
                      <p className="text-xs text-gray-500">
                        {prevMonthRecap.cancelled} huỷ + {prevMonthRecap.returned} hoàn
                      </p>
                    </div>
                  </div>

                  {/* Growth comparison */}
                  {growthNeeded && monthlyTarget > 0 && (
                    <div className={'px-4 py-3 rounded-lg border ' + (
                      growthNeeded.pct > 30 ? 'bg-red-500/10 border-red-500/20' :
                      growthNeeded.pct > 10 ? 'bg-amber-500/10 border-amber-500/20' :
                      growthNeeded.pct > 0 ? 'bg-blue-500/10 border-blue-500/20' :
                      'bg-emerald-500/10 border-emerald-500/20'
                    )}>
                      <div className="flex flex-wrap items-center gap-4">
                        <div>
                          <p className="text-xs text-gray-500">KPI tháng {month}</p>
                          <p className="text-sm font-bold text-gray-100">{formatCurrency(monthlyTarget)}</p>
                        </div>
                        <div className="text-gray-600">→</div>
                        <div>
                          <p className="text-xs text-gray-500">So với T{prevMonthRecap.month}</p>
                          <p className={'text-sm font-bold ' + (growthNeeded.pct > 0 ? 'text-amber-400' : 'text-emerald-400')}>
                            {growthNeeded.pct > 0 ? '+' : ''}{growthNeeded.pct.toFixed(1)}%
                          </p>
                        </div>
                        {growthNeeded.suggestedMkt > 0 && (
                          <>
                            <div className="text-gray-600">·</div>
                            <div>
                              <p className="text-xs text-gray-500">QC gợi ý (giữ ROAS)</p>
                              <p className="text-sm font-bold text-blue-400">{formatCurrency(Math.round(growthNeeded.suggestedMkt))}</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Smart plan calculator */}
              <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-300">
                    Tính toán kế hoạch tháng {month}/{year}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-gray-400">{dayTypeCounts.total} ngày</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-gray-400">{dayTypeCounts.regular} thường</span>
                    {dayTypeCounts.saleDouble > 0 && (
                      <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400">{dayTypeCounts.saleDouble} sale đôi ({month}/{month})</span>
                    )}
                    <span className="px-2 py-0.5 rounded bg-orange-500/10 text-orange-400">{dayTypeCounts.saleFixed} sale (15, 25)</span>
                  </div>
                </div>

                {/* Input section */}
                <div className="space-y-4">
                  {/* Row 1: Total target + Total ads */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1.5 font-medium">Mục tiêu doanh thu tháng {month}</label>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={calcTarget ? Number(calcTarget).toLocaleString('vi-VN') : ''}
                          onChange={function(e) { setCalcTarget(e.target.value.replace(/[^\d]/g, '')); }}
                          placeholder="VD: 500,000,000"
                          className="w-full px-3 py-2.5 text-sm border border-slate-600 rounded-lg bg-slate-800 text-gray-200 placeholder:text-gray-600 pr-8"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">đ</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1.5 font-medium">Tổng chi phí QC tháng {month}</label>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={calcAds ? Number(calcAds).toLocaleString('vi-VN') : ''}
                          onChange={function(e) { setCalcAds(e.target.value.replace(/[^\d]/g, '')); }}
                          placeholder="VD: 100,000,000"
                          className="w-full px-3 py-2.5 text-sm border border-slate-600 rounded-lg bg-slate-800 text-gray-200 placeholder:text-gray-600 pr-8"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">đ</span>
                      </div>
                    </div>
                  </div>

                  {/* Sale days input */}
                  <div className="border-t border-slate-700/50 pt-4">
                    <p className="text-xs text-gray-500 mb-3 font-medium">Nhập mục tiêu từng loại ngày sale (mỗi ngày):</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Sale double */}
                      {dayTypeCounts.saleDouble > 0 && (
                        <>
                          <div>
                            <label className="block text-xs text-red-400/80 mb-1.5 font-medium">
                              DT ngày sale đôi ({month}/{month}) — {dayTypeCounts.saleDouble} ngày
                            </label>
                            <div className="relative">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={calcSaleDouble ? Number(calcSaleDouble).toLocaleString('vi-VN') : ''}
                                onChange={function(e) { setCalcSaleDouble(e.target.value.replace(/[^\d]/g, '')); }}
                                placeholder="DT mỗi ngày sale đôi"
                                className="w-full px-3 py-2.5 text-sm border border-red-500/30 rounded-lg bg-red-500/5 text-gray-200 placeholder:text-gray-600 pr-8"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">đ/ngày</span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs text-red-400/80 mb-1.5 font-medium">
                              QC ngày sale đôi — {dayTypeCounts.saleDouble} ngày
                            </label>
                            <div className="relative">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={calcSaleDoubleAds ? Number(calcSaleDoubleAds).toLocaleString('vi-VN') : ''}
                                onChange={function(e) { setCalcSaleDoubleAds(e.target.value.replace(/[^\d]/g, '')); }}
                                placeholder="QC mỗi ngày sale đôi"
                                className="w-full px-3 py-2.5 text-sm border border-red-500/30 rounded-lg bg-red-500/5 text-gray-200 placeholder:text-gray-600 pr-8"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">đ/ngày</span>
                            </div>
                          </div>
                        </>
                      )}

                      {/* Sale fixed (15, 25) */}
                      <div>
                        <label className="block text-xs text-orange-400/80 mb-1.5 font-medium">
                          DT ngày sale 15 &amp; 25 — {dayTypeCounts.saleFixed} ngày
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={calcSaleFixed ? Number(calcSaleFixed).toLocaleString('vi-VN') : ''}
                            onChange={function(e) { setCalcSaleFixed(e.target.value.replace(/[^\d]/g, '')); }}
                            placeholder="DT mỗi ngày sale cố định"
                            className="w-full px-3 py-2.5 text-sm border border-orange-500/30 rounded-lg bg-orange-500/5 text-gray-200 placeholder:text-gray-600 pr-8"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">đ/ngày</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-orange-400/80 mb-1.5 font-medium">
                          QC ngày sale 15 &amp; 25 — {dayTypeCounts.saleFixed} ngày
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={calcSaleFixedAds ? Number(calcSaleFixedAds).toLocaleString('vi-VN') : ''}
                            onChange={function(e) { setCalcSaleFixedAds(e.target.value.replace(/[^\d]/g, '')); }}
                            placeholder="QC mỗi ngày sale cố định"
                            className="w-full px-3 py-2.5 text-sm border border-orange-500/30 rounded-lg bg-orange-500/5 text-gray-200 placeholder:text-gray-600 pr-8"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">đ/ngày</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Auto-calculated results */}
                  {(parseFloat(calcTarget) > 0) && (
                    <div className="border-t border-slate-700/50 pt-4">
                      <p className="text-xs text-emerald-400/80 mb-3 font-medium">Tự động tính — Ngày thường ({dayTypeCounts.regular} ngày):</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                          <p className="text-[10px] text-gray-500 uppercase tracking-wider">DT / ngày thường</p>
                          <p className={'text-lg font-bold ' + (calcResults.regularDayTarget > 0 ? 'text-emerald-400' : 'text-red-400')}>
                            {calcResults.regularDayTarget > 0 ? formatCurrency(calcResults.regularDayTarget) : 'Thiếu!'}
                          </p>
                        </div>
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                          <p className="text-[10px] text-gray-500 uppercase tracking-wider">QC / ngày thường</p>
                          <p className={'text-lg font-bold ' + (calcResults.regularDayAds >= 0 ? 'text-blue-400' : 'text-red-400')}>
                            {calcResults.regularDayAds >= 0 ? formatCurrency(calcResults.regularDayAds) : 'Lỗi'}
                          </p>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Tổng DT sale</p>
                          <p className="text-sm font-semibold text-gray-300">{formatCurrency(calcResults.totalSaleRevenue)}</p>
                          <p className="text-[10px] text-gray-500">
                            {dayTypeCounts.saleDouble > 0 && dayTypeCounts.saleDouble + ' đôi'}
                            {dayTypeCounts.saleDouble > 0 && dayTypeCounts.saleFixed > 0 && ' + '}
                            {dayTypeCounts.saleFixed > 0 && dayTypeCounts.saleFixed + ' cố định'}
                          </p>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Còn lại cho ngày thường</p>
                          <p className={'text-sm font-semibold ' + (calcResults.remainingRevenue > 0 ? 'text-gray-300' : 'text-red-400')}>
                            {formatCurrency(calcResults.remainingRevenue)}
                          </p>
                          <p className="text-[10px] text-gray-500">÷ {dayTypeCounts.regular} ngày</p>
                        </div>
                      </div>

                      {calcResults.remainingRevenue < 0 && (
                        <div className="mt-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                          <p className="text-xs text-red-400">Target ngày sale đã vượt tổng mục tiêu tháng — hãy giảm target sale hoặc tăng mục tiêu tháng.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Save button */}
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-[10px] text-gray-600">
                      Bấm &quot;Lưu kế hoạch&quot; để áp dụng vào toàn bộ bảng theo dõi tuần
                    </p>
                    <button
                      onClick={handleSavePlan}
                      disabled={!calcResults.isValid}
                      className={'px-5 py-2.5 text-sm rounded-lg font-medium transition-all ' + (
                        calcSaved
                          ? 'bg-emerald-600 text-white'
                          : calcResults.isValid
                            ? 'bg-violet-600 text-white hover:bg-violet-500'
                            : 'bg-slate-700 text-gray-500 cursor-not-allowed'
                      )}
                    >
                      {calcSaved ? 'Đã lưu!' : 'Lưu kế hoạch'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Product breakdown: T9 results + T10 plan */}
              {prevMonthProducts.length > 0 && (
                <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-gray-300">
                      Phân bổ theo sản phẩm — T{parseInt(prevMonthStr.split('-')[1])} → T{month}
                    </h3>
                    <div className="flex items-center gap-2">
                      {(parseFloat(calcTarget) > 0) && (
                        <span className="text-[10px] text-gray-500">KPI T{month}: {formatCurrency(parseFloat(calcTarget) || 0)}</span>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-800/50 text-[10px] text-gray-500 uppercase tracking-wider">
                          <th className="text-left px-3 py-2 font-medium">Sản phẩm</th>
                          <th className="text-right px-3 py-2 font-medium">SL T{parseInt(prevMonthStr.split('-')[1])}</th>
                          <th className="text-right px-3 py-2 font-medium">DT ước T{parseInt(prevMonthStr.split('-')[1])}</th>
                          <th className="text-center px-3 py-2 font-medium">Tỷ trọng</th>
                          <th className="text-right px-3 py-2 font-medium">SL KH T{month}</th>
                          <th className="text-right px-3 py-2 font-medium">DT KH T{month}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {prevMonthProducts.map(function(p, idx) {
                          var t = productTargets[p.product] || { targetQty: '', targetRevenue: '' };
                          var targetRev = parseInt(t.targetRevenue) || 0;
                          var totalTarget = parseFloat(calcTarget) || 0;
                          var targetShare = totalTarget > 0 ? targetRev / totalTarget : 0;

                          return (
                            <tr key={p.product} className={idx % 2 === 0 ? 'bg-slate-800/10' : ''}>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-gray-500 w-5">{idx + 1}</span>
                                  <span className="text-sm text-gray-200 truncate max-w-[180px]" title={p.product}>{p.product}</span>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-right text-gray-400">{p.qty.toLocaleString()}</td>
                              <td className="px-3 py-2.5 text-right text-gray-400">{formatCurrency(p.estRevenue)}</td>
                              <td className="px-3 py-2.5 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <div className="w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-violet-500 rounded-full" style={{ width: Math.min(p.share * 100, 100) + '%' }} />
                                  </div>
                                  <span className="text-xs text-gray-500">{(p.share * 100).toFixed(1)}%</span>
                                </div>
                              </td>
                              <td className="px-3 py-2.5">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={t.targetQty ? Number(t.targetQty).toLocaleString('vi-VN') : ''}
                                  onChange={function(e) {
                                    var val = e.target.value.replace(/[^\d]/g, '');
                                    setProductTargets(function(prev) {
                                      var next = { ...prev };
                                      next[p.product] = { ...next[p.product], targetQty: val };
                                      return next;
                                    });
                                  }}
                                  className="w-20 px-2 py-1 text-xs text-right border border-slate-600 rounded bg-slate-800 text-gray-200"
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={t.targetRevenue ? Number(t.targetRevenue).toLocaleString('vi-VN') : ''}
                                    onChange={function(e) {
                                      var val = e.target.value.replace(/[^\d]/g, '');
                                      setProductTargets(function(prev) {
                                        var next = { ...prev };
                                        next[p.product] = { ...next[p.product], targetRevenue: val };
                                        return next;
                                      });
                                    }}
                                    className="w-24 px-2 py-1 text-xs text-right border border-slate-600 rounded bg-slate-800 text-gray-200"
                                  />
                                  {targetShare > 0 && (
                                    <span className="text-[10px] text-gray-500 shrink-0">{(targetShare * 100).toFixed(0)}%</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-800/50 font-medium">
                          <td className="px-3 py-2.5 text-sm text-gray-300">Tổng</td>
                          <td className="px-3 py-2.5 text-right text-gray-300 text-sm">
                            {prevMonthProducts.reduce(function(s, p) { return s + p.qty; }, 0).toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-300 text-sm">
                            {formatCurrency(prevMonthProducts.reduce(function(s, p) { return s + p.estRevenue; }, 0))}
                          </td>
                          <td className="px-3 py-2.5 text-center text-gray-300 text-xs">100%</td>
                          <td className="px-3 py-2.5 text-right text-gray-300 text-sm">
                            {Object.values(productTargets).reduce(function(s, t) { return s + (parseInt(t.targetQty) || 0); }, 0).toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {(function() {
                              var sumTarget = Object.values(productTargets).reduce(function(s, t) { return s + (parseInt(t.targetRevenue) || 0); }, 0);
                              var totalT = parseFloat(calcTarget) || 0;
                              var diff = totalT - sumTarget;
                              return (
                                <div>
                                  <span className="text-sm text-gray-300">{formatCurrency(sumTarget)}</span>
                                  {totalT > 0 && Math.abs(diff) > 1000 && (
                                    <p className={'text-[10px] ' + (diff > 0 ? 'text-amber-400' : 'text-red-400')}>
                                      {diff > 0 ? 'Thiếu ' + formatCurrency(diff) : 'Dư ' + formatCurrency(Math.abs(diff))}
                                    </p>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-700/50">
                    <p className="text-[10px] text-gray-600">
                      DT ước T{parseInt(prevMonthStr.split('-')[1])} = tỷ trọng SL × DT tổng shop. Gợi ý T{month} = T{parseInt(prevMonthStr.split('-')[1])} + 10%.
                    </p>
                    <button
                      onClick={handleSaveProductTargets}
                      className={'px-4 py-2 text-sm rounded-lg font-medium transition-all ' + (
                        productTargetsSaved
                          ? 'bg-emerald-600 text-white'
                          : 'bg-violet-600 text-white hover:bg-violet-500'
                      )}
                    >
                      {productTargetsSaved ? 'Đã lưu!' : 'Lưu KH sản phẩm'}
                    </button>
                  </div>
                </div>
              )}

              {prevMonthProducts.length === 0 && (
                <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
                  <p className="text-sm text-gray-500 text-center py-4">
                    Chưa có dữ liệu SKU tháng trước cho shop này — import file đơn hàng để thấy phân tích sản phẩm.
                  </p>
                </div>
              )}

              {/* Quick notes */}
              <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
                <h3 className="text-sm font-medium text-gray-300 mb-3">Ghi chú nhanh</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1 font-medium uppercase tracking-wider">Chiến lược</label>
                    <textarea
                      value={noteStrategy}
                      onChange={function(e) { setNoteStrategy(e.target.value); }}
                      onBlur={handleSaveNote}
                      placeholder="VD: Đẩy sale đôi 10/10..."
                      className="w-full px-3 py-2 text-xs border border-slate-600 rounded-lg bg-slate-800 text-gray-200 placeholder:text-gray-600 resize-none"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1 font-medium uppercase tracking-wider">SP focus</label>
                    <textarea
                      value={noteProductFocus}
                      onChange={function(e) { setNoteProductFocus(e.target.value); }}
                      onBlur={handleSaveNote}
                      placeholder="VD: SP A - 40% DT..."
                      className="w-full px-3 py-2 text-xs border border-slate-600 rounded-lg bg-slate-800 text-gray-200 placeholder:text-gray-600 resize-none"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1 font-medium uppercase tracking-wider">Promotion</label>
                    <textarea
                      value={notePromoPlan}
                      onChange={function(e) { setNotePromoPlan(e.target.value); }}
                      onBlur={handleSaveNote}
                      placeholder="VD: 10/10 combo 15%..."
                      className="w-full px-3 py-2 text-xs border border-slate-600 rounded-lg bg-slate-800 text-gray-200 placeholder:text-gray-600 resize-none"
                      rows={2}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Task alerts — shown immediately when staff opens page */}
      {selectedShopId && (taskAlerts.overdue.length > 0 || taskAlerts.todayDue.length > 0 || taskAlerts.upcoming.length > 0) && (
        <div className="mb-6 space-y-3">
          {taskAlerts.overdue.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <h3 className="text-sm font-bold text-red-400">TRỄ DEADLINE — {taskAlerts.overdue.length} việc</h3>
              </div>
              <div className="space-y-1.5">
                {taskAlerts.overdue.map(function(t) {
                  var daysLate = Math.floor((now.getTime() - new Date(t.deadline).getTime()) / (24 * 60 * 60 * 1000));
                  return (
                    <div key={t.id} className="flex items-center justify-between px-3 py-2 bg-red-500/5 rounded-lg">
                      <div className="flex items-center gap-3 min-w-0">
                        <button onClick={function() { cycleStatus(t); }} className={'w-4 h-4 rounded-full border-2 shrink-0 ' + (t.status === 'in_progress' ? 'border-blue-500' : 'border-gray-500')} />
                        <span className="text-sm text-gray-200 truncate">{t.title}</span>
                      </div>
                      <span className="text-xs text-red-400 font-medium shrink-0 ml-2">Trễ {daysLate} ngày</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {taskAlerts.todayDue.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <h3 className="text-sm font-bold text-amber-400">HẾT HẠN HÔM NAY — {taskAlerts.todayDue.length} việc</h3>
              </div>
              <div className="space-y-1.5">
                {taskAlerts.todayDue.map(function(t) {
                  return (
                    <div key={t.id} className="flex items-center justify-between px-3 py-2 bg-amber-500/5 rounded-lg">
                      <div className="flex items-center gap-3 min-w-0">
                        <button onClick={function() { cycleStatus(t); }} className={'w-4 h-4 rounded-full border-2 shrink-0 ' + (t.status === 'in_progress' ? 'border-blue-500' : 'border-gray-500')} />
                        <span className="text-sm text-gray-200 truncate">{t.title}</span>
                      </div>
                      <span className={'text-xs px-2 py-0.5 rounded ' + (t.status === 'in_progress' ? 'bg-blue-500/15 text-blue-400' : 'bg-gray-500/15 text-gray-400')}>
                        {t.status === 'in_progress' ? 'Đang làm' : 'Chưa làm'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {taskAlerts.upcoming.length > 0 && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-medium text-blue-400">Sắp tới hạn (3 ngày tới) — {taskAlerts.upcoming.length} việc</h3>
              </div>
              <div className="space-y-1.5">
                {taskAlerts.upcoming.map(function(t) {
                  var daysLeft = Math.ceil((new Date(t.deadline).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
                  return (
                    <div key={t.id} className="flex items-center justify-between px-3 py-2 bg-blue-500/5 rounded-lg">
                      <div className="flex items-center gap-3 min-w-0">
                        <button onClick={function() { cycleStatus(t); }} className={'w-4 h-4 rounded-full border-2 shrink-0 ' + (t.status === 'in_progress' ? 'border-blue-500' : 'border-gray-500')} />
                        <span className="text-sm text-gray-200 truncate">{t.title}</span>
                      </div>
                      <span className="text-xs text-blue-400 shrink-0 ml-2">Còn {daysLeft} ngày</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sticky KPI bar */}
      {selectedShopId && showStickyKPI && monthlyTarget > 0 && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700/50 px-4 py-2">
          <div className="max-w-5xl mx-auto flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className={'w-2 h-2 rounded-full ' + (monthSummary.pctAchieved >= 0.7 ? 'bg-emerald-500' : monthSummary.pctAchieved >= 0.4 ? 'bg-yellow-500' : 'bg-red-500')} />
              <span className="text-gray-400">KPI:</span>
              <span className={'font-bold ' + (monthSummary.pctAchieved >= 0.7 ? 'text-emerald-400' : monthSummary.pctAchieved >= 0.4 ? 'text-yellow-400' : 'text-red-400')}>
                {(monthSummary.pctAchieved * 100).toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 flex-1 max-w-32 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={'h-full rounded-full ' + (monthSummary.pctAchieved >= 0.7 ? 'bg-emerald-500' : monthSummary.pctAchieved >= 0.4 ? 'bg-yellow-500' : 'bg-red-500')}
                style={{ width: Math.min(monthSummary.pctAchieved * 100, 100) + '%' }}
              />
            </div>
            <span className="text-gray-500 hidden sm:inline">{formatCurrency(monthSummary.totalActualRevenue)} / {formatCurrency(monthlyTarget)}</span>
            {monthSummary.gap > 0 && (
              <span className="text-gray-400 hidden sm:inline">· Thiếu <span className="text-red-400 font-medium">{formatCurrency(monthSummary.gap)}</span></span>
            )}
            {monthSummary.gap > 0 && monthSummary.futureDays > 0 && (
              <span className="text-gray-400 hidden md:inline">· Cần ~{formatCurrency(Math.round(monthSummary.avgNeeded))}/ngày</span>
            )}
            <span className="text-gray-600 ml-auto">{selectedShop?.name}</span>
          </div>
        </div>
      )}

      {selectedShopId && (
        <div className="space-y-6">
          {/* Monthly overview cards */}
          <div ref={kpiSectionRef} className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

          {/* Monthly task summary — all incomplete tasks across weeks */}
          {allMonthActions.length > 0 && (function() {
            var incomplete = allMonthActions.filter(function(a) { return a.status !== 'done'; });
            var overdue = incomplete.filter(function(a) { return a.deadline && a.deadline < todayStr; });
            var inProgress = incomplete.filter(function(a) { return a.status === 'in_progress'; });
            var pending = incomplete.filter(function(a) { return a.status === 'pending' && (!a.deadline || a.deadline >= todayStr); });
            if (incomplete.length === 0) return null;
            return (
              <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 mb-1">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    <h3 className="text-sm font-medium text-gray-200">Task chưa xong tháng {month}</h3>
                  </div>
                  <div className="flex items-center gap-3 text-[10px]">
                    {overdue.length > 0 && <span className="text-red-400 font-medium">{overdue.length} trễ hạn</span>}
                    {inProgress.length > 0 && <span className="text-blue-400">{inProgress.length} đang làm</span>}
                    {pending.length > 0 && <span className="text-gray-500">{pending.length} chưa làm</span>}
                  </div>
                </div>
                <div className="space-y-1">
                  {overdue.concat(inProgress).concat(pending).slice(0, 8).map(function(a) {
                    var isOd = a.deadline && a.deadline < todayStr && a.status !== 'done';
                    var weekNum = weeks.findIndex(function(w) { return w.days[0].date === a.weekStart; }) + 1;
                    return (
                      <div key={a.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/40">
                        <button onClick={function() { cycleStatus(a); }} className={'w-4 h-4 rounded-full border-2 shrink-0 ' + (a.status === 'in_progress' ? 'border-blue-500' : 'border-gray-500')} title="Đổi trạng thái">
                          {a.status === 'in_progress' && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 m-auto" />}
                        </button>
                        <span className="text-[10px] text-gray-600 shrink-0 w-6">T{weekNum || '?'}</span>
                        <span className={'text-xs flex-1 truncate ' + (isOd ? 'text-red-400' : 'text-gray-300')}>{a.title}</span>
                        {a.deadline && (
                          <span className={'text-[10px] shrink-0 ' + (isOd ? 'text-red-400' : 'text-gray-600')}>
                            {parseInt(a.deadline.split('-')[2]) + '/' + parseInt(a.deadline.split('-')[1])}
                          </span>
                        )}
                        <span className={'text-[10px] px-1.5 py-0.5 rounded ' + (a.status === 'in_progress' ? 'bg-blue-500/15 text-blue-400' : 'bg-gray-500/15 text-gray-500')}>
                          {a.status === 'in_progress' ? 'Đang' : 'Chưa'}
                        </span>
                      </div>
                    );
                  })}
                  {incomplete.length > 8 && (
                    <p className="text-[10px] text-gray-600 text-center py-1">+ {incomplete.length - 8} task khác</p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Weekly breakdown */}
          <div className="space-y-3">
            {weeks.map(function(w, wi) {
              var isExpanded = expandedWeek === w.weekNum;
              var weekPct = w.plan.revenue > 0 ? w.actual.revenue / w.plan.revenue : 0;
              var allFuture = w.days.every(function(d) { return d.isFuture; });
              var isCurrentWeek = w.days.some(function(d) { return d.date === todayStr; });
              var prevWeek = wi > 0 ? weeks[wi - 1] : null;
              var wActions = weekActionsForWeek(w.days[0].date);
              var pendingTasks = wActions.filter(function(a) { return a.status !== 'done'; }).length;

              var isCompactFuture = allFuture && w.daysWithReport === 0 && !isCurrentWeek && !isExpanded;

              return (
                <div key={w.weekNum} className={'bg-slate-900 border rounded-xl overflow-hidden ' + (
                  isCurrentWeek ? 'border-blue-500/50' : 'border-slate-700/50'
                )}>
                  <button
                    onClick={function() { setExpandedWeek(isExpanded ? null : w.weekNum); }}
                    className={'w-full flex items-center gap-4 hover:bg-slate-800/50 transition-colors text-left ' + (isCompactFuture ? 'px-5 py-2.5' : 'px-5 py-4')}
                  >
                    <div className="shrink-0">
                      <div className={'rounded-xl flex items-center justify-center font-bold ' + (isCompactFuture ? 'w-8 h-8 text-xs ' : 'w-10 h-10 text-sm ') + (
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
                    {isCompactFuture ? (
                      <div className="flex-1 flex items-center gap-3 min-w-0">
                        <p className="text-sm text-gray-400">{w.label}</p>
                        <span className="text-xs text-gray-600">{w.plan.regularDays} thường + {w.plan.saleDays} sale</span>
                      </div>
                    ) : (
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-gray-200 text-sm">{w.label}</p>
                        {isCurrentWeek && (
                          <span className="px-2 py-0.5 text-[10px] rounded-full bg-blue-500/20 text-blue-400 font-medium">Tuần này</span>
                        )}
                        {w.missingReportDays.length > 0 && (
                          <span className="px-2 py-0.5 text-[10px] rounded-full bg-amber-500/15 text-amber-400 font-medium">
                            Thiếu {w.missingReportDays.length} BC
                          </span>
                        )}
                        {pendingTasks > 0 && (
                          <span className="px-2 py-0.5 text-[10px] rounded-full bg-violet-500/15 text-violet-400 font-medium">
                            {pendingTasks} task
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <p className="text-xs text-gray-500">
                          {w.plan.regularDays} thường + {w.plan.saleDays} sale
                          {w.daysWithReport > 0 ? ' · ' + w.daysWithReport + '/' + w.days.length + ' ngày' : ''}
                        </p>
                        {w.daysWithReport > 0 && prevWeek && prevWeek.daysWithReport > 0 && (
                          <TrendArrow current={w.actual.revenue} previous={prevWeek.actual.revenue} />
                        )}
                      </div>
                      {/* Mini progress bar */}
                      {w.plan.revenue > 0 && w.daysWithReport > 0 && (
                        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mt-2 max-w-48">
                          <div
                            className={'h-full rounded-full ' + (weekPct >= 0.9 ? 'bg-emerald-500' : weekPct >= 0.7 ? 'bg-yellow-500' : 'bg-red-500')}
                            style={{ width: Math.min(weekPct * 100, 100) + '%' }}
                          />
                        </div>
                      )}
                    </div>
                    )}
                    <div className="text-right shrink-0">
                      {plan && (
                        <p className={'text-gray-500 ' + (isCompactFuture ? 'text-[11px]' : 'text-xs')}>KH: {formatCurrency(w.plan.revenue)}</p>
                      )}
                      {!isCompactFuture && (
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
                      )}
                      {w.daysWithReport > 0 && w.plan.revenue > 0 && (
                        <p className="text-xs text-gray-500">{(weekPct * 100).toFixed(0)}% KH</p>
                      )}
                    </div>
                    <svg className={'w-4 h-4 text-gray-500 transition-transform shrink-0 ' + (isExpanded ? 'rotate-180' : '')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-700/50">
                      {/* Week KPI cards: ROAS, CPO, Huỷ/Hoàn, TB ngày thường vs sale */}
                      {w.daysWithReport > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-5 py-3 bg-slate-800/30">
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">ROAS</p>
                            <div className="flex items-center gap-2">
                              <p className={'text-sm font-semibold ' + (w.roas >= 4 ? 'text-emerald-400' : w.roas >= 2.5 ? 'text-yellow-400' : w.roas > 0 ? 'text-red-400' : 'text-gray-500')}>
                                {w.roas > 0 ? w.roas.toFixed(1) + 'x' : '—'}
                              </p>
                              {prevWeek && prevWeek.roas > 0 && <TrendArrow current={w.roas} previous={prevWeek.roas} />}
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">CPO</p>
                            <div className="flex items-center gap-2">
                              <p className={'text-sm font-semibold ' + (w.cpo > 0 && w.cpo < 30000 ? 'text-emerald-400' : w.cpo <= 60000 ? 'text-yellow-400' : 'text-red-400')}>
                                {w.cpo > 0 ? formatCurrency(Math.round(w.cpo)) : '—'}
                              </p>
                              {prevWeek && prevWeek.cpo > 0 && <TrendArrow current={w.cpo} previous={prevWeek.cpo} inverse />}
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Huỷ + Hoàn</p>
                            <p className={'text-sm font-semibold ' + (w.cancelReturnRate > 0.1 ? 'text-red-400' : w.cancelReturnRate > 0.05 ? 'text-yellow-400' : 'text-emerald-400')}>
                              {w.actual.orders > 0 ? (w.cancelReturnRate * 100).toFixed(1) + '%' : '—'}
                              {w.actual.orders > 0 && (
                                <span className="text-[10px] text-gray-500 font-normal ml-1">
                                  ({w.actual.cancelled + w.actual.returned}/{w.actual.orders})
                                </span>
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">TB Thường / Sale</p>
                            <p className="text-sm font-semibold text-gray-300">
                              {w.avgRegularRevenue > 0 ? formatCurrency(Math.round(w.avgRegularRevenue)) : '—'}
                              <span className="text-gray-600 mx-1">/</span>
                              <span className={w.avgSaleRevenue > 0 ? 'text-orange-400' : 'text-gray-500'}>
                                {w.avgSaleRevenue > 0 ? formatCurrency(Math.round(w.avgSaleRevenue)) : '—'}
                              </span>
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Missing report warning */}
                      {w.missingReportDays.length > 0 && (
                        <div className="mx-5 mt-3 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                          <p className="text-xs text-amber-400">
                            Chưa có báo cáo: {w.missingReportDays.map(function(d) {
                              return parseInt(d.split('-')[2]) + '/' + parseInt(d.split('-')[1]);
                            }).join(', ')}
                          </p>
                        </div>
                      )}

                      {/* Plan vs actual summary */}
                      {plan && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-5 py-3">
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
                              var isMissing = !d.isFuture && !report;

                              return (
                                <tr key={d.date} className={
                                  isToday ? 'bg-blue-500/5' : isMissing ? 'bg-amber-500/5' : d.isFuture ? 'opacity-50' : 'hover:bg-slate-800/30'
                                }>
                                  <td className="px-4 py-2">
                                    <div className="flex items-center gap-2">
                                      <span className={'text-xs font-medium w-6 ' + (dayOfWeek === 0 ? 'text-red-400' : dayOfWeek === 6 ? 'text-orange-400' : 'text-gray-500')}>
                                        {dayNames[dayOfWeek]}
                                      </span>
                                      <span className={'font-medium ' + (isToday ? 'text-blue-400' : isMissing ? 'text-amber-400' : 'text-gray-300')}>{dateLabel}</span>
                                      {isToday && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                                      {isMissing && <span className="text-[10px] text-amber-400/70">thiếu</span>}
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

                      {/* Product breakdown per week */}
                      {weeklyProductData[wi] && weeklyProductData[wi].length > 0 && weeklyProductData[wi].some(function(p) { return p.weekQty > 0 || p.cumQty > 0; }) && (
                        <div className="border-t border-slate-700/50 px-5 py-4">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                              Sản phẩm tuần {w.weekNum}
                              {wi > 0 && <span className="text-gray-600 normal-case ml-1">· luỹ kế từ đầu tháng</span>}
                            </h3>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-[10px] text-gray-500 uppercase tracking-wider">
                                  <th className="text-left px-2 py-1.5 font-medium">SP</th>
                                  <th className="text-right px-2 py-1.5 font-medium">SL tuần</th>
                                  <th className="text-right px-2 py-1.5 font-medium">DT tuần</th>
                                  {wi > 0 && <th className="text-right px-2 py-1.5 font-medium">LK SL</th>}
                                  {wi > 0 && <th className="text-right px-2 py-1.5 font-medium">LK DT</th>}
                                  <th className="text-right px-2 py-1.5 font-medium">KH tháng</th>
                                  <th className="text-center px-2 py-1.5 font-medium">% đạt</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/30">
                                {weeklyProductData[wi].filter(function(p) { return p.weekQty > 0 || p.cumQty > 0; }).map(function(p) {
                                  var pctRev = p.targetRevenue > 0 ? (wi > 0 ? p.cumRevenue : p.weekRevenue) / p.targetRevenue : 0;
                                  return (
                                    <tr key={p.product} className="hover:bg-slate-800/30">
                                      <td className="px-2 py-1.5 text-gray-300 max-w-[140px] truncate" title={p.product}>{p.product}</td>
                                      <td className="px-2 py-1.5 text-right text-gray-300">{p.weekQty > 0 ? p.weekQty.toLocaleString() : '—'}</td>
                                      <td className="px-2 py-1.5 text-right text-gray-400">{p.weekRevenue > 0 ? formatCurrency(p.weekRevenue) : '—'}</td>
                                      {wi > 0 && <td className="px-2 py-1.5 text-right text-gray-300 font-medium">{p.cumQty > 0 ? p.cumQty.toLocaleString() : '—'}</td>}
                                      {wi > 0 && <td className="px-2 py-1.5 text-right text-gray-300 font-medium">{p.cumRevenue > 0 ? formatCurrency(p.cumRevenue) : '—'}</td>}
                                      <td className="px-2 py-1.5 text-right text-gray-500">{p.targetRevenue > 0 ? formatCurrency(p.targetRevenue) : '—'}</td>
                                      <td className="px-2 py-1.5 text-center">
                                        {pctRev > 0 ? (
                                          <span className={'px-1.5 py-0.5 rounded text-[10px] font-medium ' + (
                                            pctRev >= 0.9 ? 'bg-emerald-500/15 text-emerald-400' :
                                            pctRev >= 0.5 ? 'bg-yellow-500/15 text-yellow-400' :
                                            'bg-red-500/15 text-red-400'
                                          )}>
                                            {(pctRev * 100).toFixed(0)}%
                                          </span>
                                        ) : <span className="text-gray-600">—</span>}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr className="bg-slate-800/30 font-medium text-xs">
                                  <td className="px-2 py-1.5 text-gray-300">Tổng</td>
                                  <td className="px-2 py-1.5 text-right text-gray-300">
                                    {weeklyProductData[wi].reduce(function(s, p) { return s + p.weekQty; }, 0).toLocaleString()}
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-gray-300">
                                    {formatCurrency(weeklyProductData[wi].reduce(function(s, p) { return s + p.weekRevenue; }, 0))}
                                  </td>
                                  {wi > 0 && (
                                    <td className="px-2 py-1.5 text-right text-gray-200">
                                      {weeklyProductData[wi].reduce(function(s, p) { return s + p.cumQty; }, 0).toLocaleString()}
                                    </td>
                                  )}
                                  {wi > 0 && (
                                    <td className="px-2 py-1.5 text-right text-gray-200">
                                      {formatCurrency(weeklyProductData[wi].reduce(function(s, p) { return s + p.cumRevenue; }, 0))}
                                    </td>
                                  )}
                                  <td className="px-2 py-1.5 text-right text-gray-500">
                                    {formatCurrency(weeklyProductData[wi].reduce(function(s, p) { return s + p.targetRevenue; }, 0))}
                                  </td>
                                  <td className="px-2 py-1.5 text-center">
                                    {(function() {
                                      var totalCum = weeklyProductData[wi].reduce(function(s, p) { return s + (wi > 0 ? p.cumRevenue : p.weekRevenue); }, 0);
                                      var totalTarget = weeklyProductData[wi].reduce(function(s, p) { return s + p.targetRevenue; }, 0);
                                      var pct = totalTarget > 0 ? totalCum / totalTarget : 0;
                                      return pct > 0 ? (
                                        <span className={'px-1.5 py-0.5 rounded text-[10px] font-medium ' + (
                                          pct >= 0.9 ? 'bg-emerald-500/15 text-emerald-400' :
                                          pct >= 0.5 ? 'bg-yellow-500/15 text-yellow-400' :
                                          'bg-red-500/15 text-red-400'
                                        )}>
                                          {(pct * 100).toFixed(0)}%
                                        </span>
                                      ) : <span className="text-gray-600">—</span>;
                                    })()}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Inline action plan for this week */}
                      <div className="border-t border-slate-700/50 px-5 py-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-medium text-gray-200">
                            Kế hoạch hành động
                          </h3>
                          <span className="text-xs text-gray-500">
                            {wActions.filter(function(a) { return a.status === 'done'; }).length}/{wActions.length} xong
                          </span>
                        </div>

                        <div className="flex gap-2 mb-3">
                          <input
                            type="text"
                            value={newTaskTitle}
                            onChange={function(e) { setNewTaskTitle(e.target.value); }}
                            onKeyDown={function(e) { if (e.key === 'Enter') handleAddTask(w.days[0].date); }}
                            placeholder="Viết hành động cụ thể bạn sẽ làm..."
                            className="flex-1 px-3 py-2 text-sm border border-slate-600 rounded-lg bg-slate-800 text-gray-200 placeholder:text-gray-600"
                          />
                          <input
                            type="date"
                            value={newTaskDeadline}
                            onChange={function(e) { setNewTaskDeadline(e.target.value); }}
                            className="px-3 py-2 text-sm border border-slate-600 rounded-lg bg-slate-800 text-gray-200 w-36"
                          />
                          <button
                            onClick={function() { handleAddTask(w.days[0].date); }}
                            disabled={!newTaskTitle.trim()}
                            className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-medium shrink-0"
                          >
                            Thêm
                          </button>
                        </div>

                        {/* AI suggestions based on data */}
                        {(function() {
                          var suggestions = getWeekSuggestions(w, wi);
                          if (suggestions.length === 0) return null;
                          var existingTitles = wActions.map(function(a) { return a.title; });
                          var filtered = suggestions.filter(function(s) { return !existingTitles.some(function(t) { return t === s; }); });
                          if (filtered.length === 0) return null;
                          return (
                            <div className="mb-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                              <p className="text-[10px] text-amber-400/80 font-medium mb-2 uppercase tracking-wider">💡 Gợi ý dựa trên số liệu</p>
                              <div className="flex flex-wrap gap-1.5">
                                {filtered.map(function(s, si) {
                                  return (
                                    <button key={si} onClick={function() { handleQuickAddTask(w.days[0].date, s, w.days[w.days.length - 1].date); }} className="text-[11px] px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/40 transition-colors text-left">
                                      + {s}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Task templates */}
                        {wActions.length === 0 && (
                          <div className="mb-3">
                            <p className="text-[10px] text-gray-500 mb-2">Mẫu task có sẵn — bấm để thêm nhanh:</p>
                            <div className="flex flex-wrap gap-1.5">
                              {taskTemplates.map(function(tmpl, ti) {
                                return (
                                  <button key={ti} onClick={function() { handleQuickAddTask(w.days[0].date, tmpl, w.days[w.days.length - 1].date); }} className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800 text-gray-400 hover:text-gray-200 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 transition-colors">
                                    + {tmpl}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {wActions.length > 0 ? (
                          <div className="space-y-1.5">
                            {wActions.map(function(action) {
                              var statusColors: Record<string, string> = {
                                pending: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
                                in_progress: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
                                done: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
                              };
                              var statusLabels: Record<string, string> = { pending: 'Chưa làm', in_progress: 'Đang làm', done: 'Xong' };
                              var isOverdue = action.deadline && action.deadline < todayStr && action.status !== 'done';

                              return (
                                <div key={action.id} className={'flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ' + (
                                  action.status === 'done' ? 'bg-slate-800/30 border-slate-700/30' : 'bg-slate-800/50 border-slate-700/50'
                                )}>
                                  <button
                                    onClick={function() { cycleStatus(action); }}
                                    className={'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ' + (
                                      action.status === 'done' ? 'border-emerald-500 bg-emerald-500' :
                                      action.status === 'in_progress' ? 'border-blue-500' : 'border-gray-500'
                                    )}
                                    title="Bấm để đổi trạng thái"
                                  >
                                    {action.status === 'done' && (
                                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                    )}
                                    {action.status === 'in_progress' && (
                                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                                    )}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <p className={'text-sm ' + (action.status === 'done' ? 'text-gray-500 line-through' : 'text-gray-200')}>
                                      {action.title}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {action.deadline && (
                                      <span className={'text-[10px] px-2 py-0.5 rounded ' + (isOverdue ? 'bg-red-500/15 text-red-400' : 'text-gray-500')}>
                                        {parseInt(action.deadline.split('-')[2]) + '/' + parseInt(action.deadline.split('-')[1])}
                                      </span>
                                    )}
                                    <span className={'text-[10px] px-2 py-0.5 rounded border ' + statusColors[action.status]}>
                                      {statusLabels[action.status]}
                                    </span>
                                    <button
                                      onClick={function() { deleteWeeklyAction(action.id); }}
                                      className="p-1 text-gray-600 hover:text-red-400 transition-colors"
                                      title="Xoá"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-center text-gray-600 text-sm py-2">
                            Nhìn số liệu tuần này, tự suy nghĩ và đặt task cho mình
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Monthly product progress summary */}
          {currentNote && currentNote.productTargets && currentNote.productTargets.length > 0 && (
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-700/50">
                <h3 className="text-sm font-medium text-gray-200">
                  Tiến độ sản phẩm tháng {month}/{year}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Thực đạt so với kế hoạch đã đặt · dữ liệu từ file SKU nhân sự upload</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-gray-500 uppercase tracking-wider bg-slate-800/50">
                      <th className="text-left px-4 py-2.5 font-medium">Sản phẩm</th>
                      <th className="text-right px-3 py-2.5 font-medium">SL thực</th>
                      <th className="text-right px-3 py-2.5 font-medium">DT thực</th>
                      <th className="text-right px-3 py-2.5 font-medium">KH SL</th>
                      <th className="text-right px-3 py-2.5 font-medium">KH DT</th>
                      <th className="text-center px-3 py-2.5 font-medium w-[80px]">% đạt</th>
                      {monthSummary.totalDaysWithReport > 0 && monthSummary.futureDays > 0 && (
                        <th className="text-center px-3 py-2.5 font-medium w-[80px]">Dự báo</th>
                      )}
                      <th className="px-3 py-2.5 font-medium w-[120px]">Tiến độ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {(weeklyProductData.length > 0 ? weeklyProductData[weeklyProductData.length - 1] : currentNote.productTargets.map(function(pt) {
                      return { product: pt.product, weekQty: 0, weekRevenue: 0, cumQty: 0, cumRevenue: 0, targetQty: pt.targetQty, targetRevenue: pt.targetRevenue };
                    })).map(function(p) {
                      var pctRev = p.targetRevenue > 0 ? p.cumRevenue / p.targetRevenue : 0;
                      var dailyRate = monthSummary.totalDaysWithReport > 0 ? p.cumRevenue / monthSummary.totalDaysWithReport : 0;
                      var projectedRev = p.cumRevenue + dailyRate * monthSummary.futureDays;
                      var projectedPct = p.targetRevenue > 0 ? projectedRev / p.targetRevenue : 0;
                      return (
                        <tr key={p.product} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-2.5 text-gray-200 font-medium max-w-[180px] truncate" title={p.product}>{p.product}</td>
                          <td className="px-3 py-2.5 text-right text-gray-300">{p.cumQty > 0 ? p.cumQty.toLocaleString() : '0'}</td>
                          <td className="px-3 py-2.5 text-right text-gray-300">{p.cumRevenue > 0 ? formatCurrency(p.cumRevenue) : '0'}</td>
                          <td className="px-3 py-2.5 text-right text-gray-500">{p.targetQty > 0 ? p.targetQty.toLocaleString() : '—'}</td>
                          <td className="px-3 py-2.5 text-right text-gray-500">{p.targetRevenue > 0 ? formatCurrency(p.targetRevenue) : '—'}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={'inline-block px-2 py-0.5 rounded text-[11px] font-bold ' + (
                              pctRev >= 0.9 ? 'bg-emerald-500/15 text-emerald-400' :
                              pctRev >= 0.7 ? 'bg-yellow-500/15 text-yellow-400' :
                              pctRev >= 0.5 ? 'bg-orange-500/15 text-orange-400' :
                              pctRev > 0 ? 'bg-red-500/15 text-red-400' : 'text-gray-600'
                            )}>
                              {Math.round(pctRev * 100) + '%'}
                            </span>
                          </td>
                          {monthSummary.totalDaysWithReport > 0 && monthSummary.futureDays > 0 && (
                            <td className="px-3 py-2.5 text-center">
                              <span className={'inline-block px-2 py-0.5 rounded text-[11px] font-bold ' + (
                                projectedPct >= 0.9 ? 'bg-emerald-500/15 text-emerald-400' :
                                projectedPct >= 0.7 ? 'bg-yellow-500/15 text-yellow-400' :
                                projectedPct >= 0.5 ? 'bg-orange-500/15 text-orange-400' :
                                projectedPct > 0 ? 'bg-red-500/15 text-red-400' : 'text-gray-600'
                              )}>
                                {projectedPct > 0 ? '~' + Math.round(projectedPct * 100) + '%' : '—'}
                              </span>
                            </td>
                          )}
                          <td className="px-3 py-2.5">
                            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={'h-full rounded-full transition-all ' + (
                                  pctRev >= 0.9 ? 'bg-emerald-500' :
                                  pctRev >= 0.7 ? 'bg-yellow-500' :
                                  pctRev >= 0.5 ? 'bg-orange-500' :
                                  'bg-red-500'
                                )}
                                style={{ width: Math.min(pctRev * 100, 100) + '%' }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    {(function() {
                      var productRows = weeklyProductData.length > 0 ? weeklyProductData[weeklyProductData.length - 1] : currentNote!.productTargets.map(function(pt) {
                        return { product: pt.product, weekQty: 0, weekRevenue: 0, cumQty: 0, cumRevenue: 0, targetQty: pt.targetQty, targetRevenue: pt.targetRevenue };
                      });
                      var totalCumQty = productRows.reduce(function(s, p) { return s + p.cumQty; }, 0);
                      var totalCumRev = productRows.reduce(function(s, p) { return s + p.cumRevenue; }, 0);
                      var totalTargetQty = productRows.reduce(function(s, p) { return s + p.targetQty; }, 0);
                      var totalTargetRev = productRows.reduce(function(s, p) { return s + p.targetRevenue; }, 0);
                      var totalPct = totalTargetRev > 0 ? totalCumRev / totalTargetRev : 0;
                      var totalDailyRate = monthSummary.totalDaysWithReport > 0 ? totalCumRev / monthSummary.totalDaysWithReport : 0;
                      var totalProjected = totalCumRev + totalDailyRate * monthSummary.futureDays;
                      var totalProjectedPct = totalTargetRev > 0 ? totalProjected / totalTargetRev : 0;
                      return (
                        <tr className="bg-slate-800/50 font-medium">
                          <td className="px-4 py-2.5 text-gray-300">Tổng</td>
                          <td className="px-3 py-2.5 text-right text-gray-200">{totalCumQty.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right text-gray-200">{totalCumRev > 0 ? formatCurrency(totalCumRev) : '0'}</td>
                          <td className="px-3 py-2.5 text-right text-gray-400">{totalTargetQty.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right text-gray-400">{formatCurrency(totalTargetRev)}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={'inline-block px-2 py-0.5 rounded text-[11px] font-bold ' + (
                              totalPct >= 0.9 ? 'bg-emerald-500/15 text-emerald-400' :
                              totalPct >= 0.7 ? 'bg-yellow-500/15 text-yellow-400' :
                              totalPct >= 0.5 ? 'bg-orange-500/15 text-orange-400' :
                              totalPct > 0 ? 'bg-red-500/15 text-red-400' : 'text-gray-600'
                            )}>
                              {Math.round(totalPct * 100) + '%'}
                            </span>
                          </td>
                          {monthSummary.totalDaysWithReport > 0 && monthSummary.futureDays > 0 && (
                            <td className="px-3 py-2.5 text-center">
                              <span className={'inline-block px-2 py-0.5 rounded text-[11px] font-bold ' + (
                                totalProjectedPct >= 0.9 ? 'bg-emerald-500/15 text-emerald-400' :
                                totalProjectedPct >= 0.7 ? 'bg-yellow-500/15 text-yellow-400' :
                                totalProjectedPct >= 0.5 ? 'bg-orange-500/15 text-orange-400' :
                                totalProjectedPct > 0 ? 'bg-red-500/15 text-red-400' : 'text-gray-600'
                              )}>
                                {totalProjectedPct > 0 ? '~' + Math.round(totalProjectedPct * 100) + '%' : '—'}
                              </span>
                            </td>
                          )}
                          <td className="px-3 py-2.5">
                            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={'h-full rounded-full ' + (
                                  totalPct >= 0.9 ? 'bg-emerald-500' :
                                  totalPct >= 0.7 ? 'bg-yellow-500' :
                                  totalPct >= 0.5 ? 'bg-orange-500' :
                                  'bg-red-500'
                                )}
                                style={{ width: Math.min(totalPct * 100, 100) + '%' }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })()}
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Monthly action summary */}
          {allMonthActions.length > 0 && (
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-sm font-medium text-gray-200 mb-3">
                Tổng kết hành động tháng {month}/{year}
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-100">{allMonthActions.length}</p>
                  <p className="text-xs text-gray-500">Tổng task</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-400">{allMonthActions.filter(function(a) { return a.status === 'in_progress'; }).length}</p>
                  <p className="text-xs text-gray-500">Đang làm</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-400">{allMonthActions.filter(function(a) { return a.status === 'done'; }).length}</p>
                  <p className="text-xs text-gray-500">Hoàn thành</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
