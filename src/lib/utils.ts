import { AlertColor, AppConfig, CalculatedMetrics, DailyReport, DayType, MonthlyPlan } from './types';

export const DEFAULT_CONFIG: AppConfig = {
  adsThresholdGreen: 0.10,
  adsThresholdYellow: 0.16,
  cancelReturnThresholdYellow: 0.05,
  cancelReturnThresholdRed: 0.10,
};

export function calculateMetrics(
  report: DailyReport,
  config: AppConfig = DEFAULT_CONFIG
): CalculatedMetrics {
  const targetAchievement = report.targetRevenue > 0
    ? report.actualRevenue / report.targetRevenue
    : 0;

  const adsToRevenueRatio = report.actualRevenue > 0
    ? report.adSpend / report.actualRevenue
    : 0;

  const cancelReturnRate = report.totalOrders > 0
    ? (report.cancelledOrders + report.returnedOrders) / report.totalOrders
    : 0;

  const revenueAlert: AlertColor =
    targetAchievement >= 1 ? 'green' :
    targetAchievement >= 0.7 ? 'yellow' : 'red';

  const adsAlert: AlertColor =
    adsToRevenueRatio <= config.adsThresholdGreen ? 'green' :
    adsToRevenueRatio <= config.adsThresholdYellow ? 'yellow' : 'red';

  const cancelReturnAlert: AlertColor =
    cancelReturnRate <= config.cancelReturnThresholdYellow ? 'green' :
    cancelReturnRate <= config.cancelReturnThresholdRed ? 'yellow' : 'red';

  return {
    targetAchievement,
    adsToRevenueRatio,
    cancelReturnRate,
    revenueAlert,
    adsAlert,
    cancelReturnAlert,
  };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value);
}

export function formatPercent(value: number): string {
  return (value * 100).toFixed(1) + '%';
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function getDailyTarget(monthlyTarget: number, year: number, month: number): number {
  return Math.round(monthlyTarget / getDaysInMonth(year, month));
}

export function getSaleDays(year: number, month: number): { day: number; type: DayType; label: string }[] {
  const sales: { day: number; type: DayType; label: string }[] = [];
  const daysInMonth = getDaysInMonth(year, month);

  if (month <= daysInMonth) {
    sales.push({ day: month, type: 'sale_double', label: `${month}.${month}` });
  }

  if (15 <= daysInMonth) {
    sales.push({ day: 15, type: 'sale_fixed', label: 'Sale 15' });
  }
  if (25 <= daysInMonth) {
    sales.push({ day: 25, type: 'sale_fixed', label: 'Sale 25' });
  }

  const seen = new Set<number>();
  return sales.filter(s => {
    if (seen.has(s.day)) return false;
    seen.add(s.day);
    return true;
  }).sort((a, b) => a.day - b.day);
}

export function getDayType(dateStr: string): DayType {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const month = parseInt(monthStr);
  const day = parseInt(dayStr);

  if (day === month) return 'sale_double';
  if (day === 15 || day === 25) return 'sale_fixed';
  return 'regular';
}

export function isSaleDay(dateStr: string): boolean {
  return getDayType(dateStr) !== 'regular';
}

export function getTargetForDate(dateStr: string, plan: MonthlyPlan): number {
  if (plan.dailyOverrides[dateStr] !== undefined) return plan.dailyOverrides[dateStr];
  const dt = getDayType(dateStr);
  if (dt === 'sale_double') return plan.saleDoubleDayTarget;
  if (dt === 'sale_fixed') return plan.saleFixedDayTarget;
  return plan.regularDayTarget;
}

export function getMktForDate(dateStr: string, plan: MonthlyPlan): number {
  const dt = getDayType(dateStr);
  return dt === 'regular' ? plan.regularDayMkt : plan.saleDayMkt;
}

export function getDayCounts(year: number, month: number): { regular: number; saleDouble: number; saleFixed: number; total: number } {
  const saleDays = getSaleDays(year, month);
  const saleDouble = saleDays.filter(s => s.type === 'sale_double').length;
  const saleFixed = saleDays.filter(s => s.type === 'sale_fixed').length;
  const total = getDaysInMonth(year, month);
  return { regular: total - saleDouble - saleFixed, saleDouble, saleFixed, total };
}

export function calcPlanTotal(year: number, month: number, plan: MonthlyPlan): number {
  const c = getDayCounts(year, month);
  return (c.regular * plan.regularDayTarget) + (c.saleDouble * plan.saleDoubleDayTarget) + (c.saleFixed * plan.saleFixedDayTarget);
}

export function calcMktTotal(year: number, month: number, plan: MonthlyPlan): number {
  const c = getDayCounts(year, month);
  return (c.regular * plan.regularDayMkt) + ((c.saleDouble + c.saleFixed) * plan.saleDayMkt);
}

export function getAlertBg(color: AlertColor): string {
  switch (color) {
    case 'green': return 'bg-emerald-500/15 text-emerald-400';
    case 'yellow': return 'bg-amber-500/15 text-amber-400';
    case 'red': return 'bg-red-500/15 text-red-400';
  }
}

export function getAlertDot(color: AlertColor): string {
  switch (color) {
    case 'green': return 'bg-emerald-500';
    case 'yellow': return 'bg-amber-500';
    case 'red': return 'bg-red-500';
  }
}

export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function exportToCSV(headers: string[], rows: string[][]): string {
  const bom = '﻿';
  const headerLine = headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(',');
  const dataLines = rows.map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  );
  return bom + [headerLine, ...dataLines].join('\n');
}
