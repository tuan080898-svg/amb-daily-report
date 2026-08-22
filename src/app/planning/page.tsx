'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAppState } from '@/lib/store';
import { formatCurrency, getDaysInMonth, getSaleDays, getDayCounts, calcPlanTotal, calcMktTotal } from '@/lib/utils';
import { MonthlyPlan } from '@/lib/types';

export default function PlanningPage() {
  const { currentUser, shops, monthlyKPIs, monthlyPlans, getUserShops, updatePlan } = useAppState();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [selectedShopId, setSelectedShopId] = useState('');
  const [success, setSuccess] = useState('');

  const userShops = useMemo(() => {
    if (!currentUser) return [];
    return getUserShops(currentUser.id);
  }, [currentUser, getUserShops]);

  const activeShopId = selectedShopId || userShops[0]?.id || '';
  const activeShop = userShops.find(s => s.id === activeShopId);

  const [yearStr, monthStr] = selectedMonth.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const saleDays = useMemo(() => getSaleDays(year, month), [year, month]);
  const dayCounts = useMemo(() => getDayCounts(year, month), [year, month]);

  const kpi = useMemo(() => {
    return monthlyKPIs.find(k => k.shopId === activeShopId && k.month === selectedMonth);
  }, [monthlyKPIs, activeShopId, selectedMonth]);

  const existingPlan = useMemo(() => {
    return monthlyPlans.find(p => p.shopId === activeShopId && p.month === selectedMonth);
  }, [monthlyPlans, activeShopId, selectedMonth]);

  const kpiAmount = kpi?.kpiAmount ?? activeShop?.defaultMonthlyTarget ?? 0;

  const [form, setForm] = useState<Omit<MonthlyPlan, 'shopId' | 'month' | 'dailyOverrides'>>(() => ({
    regularDayTarget: existingPlan?.regularDayTarget || 0,
    saleDoubleDayTarget: existingPlan?.saleDoubleDayTarget || 0,
    saleFixedDayTarget: existingPlan?.saleFixedDayTarget || 0,
    totalMktBudget: existingPlan?.totalMktBudget || 0,
    regularDayMkt: existingPlan?.regularDayMkt || 0,
    saleDayMkt: existingPlan?.saleDayMkt || 0,
  }));

  useEffect(() => {
    if (existingPlan) {
      setForm({
        regularDayTarget: existingPlan.regularDayTarget,
        saleDoubleDayTarget: existingPlan.saleDoubleDayTarget,
        saleFixedDayTarget: existingPlan.saleFixedDayTarget,
        totalMktBudget: existingPlan.totalMktBudget,
        regularDayMkt: existingPlan.regularDayMkt,
        saleDayMkt: existingPlan.saleDayMkt,
      });
    } else {
      setForm({
        regularDayTarget: 0,
        saleDoubleDayTarget: 0,
        saleFixedDayTarget: 0,
        totalMktBudget: 0,
        regularDayMkt: 0,
        saleDayMkt: 0,
      });
    }
  }, [existingPlan, activeShopId, selectedMonth]);

  const planAsObj: MonthlyPlan = {
    shopId: activeShopId,
    month: selectedMonth,
    ...form,
    dailyOverrides: existingPlan?.dailyOverrides || {},
  };

  const revenueTotal = calcPlanTotal(year, month, planAsObj);
  const mktTotalCalc = calcMktTotal(year, month, planAsObj);
  const revenueDiff = revenueTotal - kpiAmount;
  const revenueMatch = Math.abs(revenueDiff) < 1000;

  function setNum(field: string, value: string) {
    setForm(f => ({ ...f, [field]: Math.max(0, parseInt(value) || 0) }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    updatePlan(planAsObj);
    setSuccess('Đã lưu kế hoạch tháng thành công!');
    setTimeout(() => setSuccess(''), 3000);
  }

  if (!currentUser) return null;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-100 mb-1">Kế hoạch tháng</h1>
      <p className="text-sm text-gray-500 mb-6">Phân bổ KPI doanh thu & chi phí MKT cho từng loại ngày</p>

      {success && (
        <div className="mb-4 px-4 py-3 bg-emerald-500/10 text-emerald-400 rounded-lg text-sm font-medium">{success}</div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Shop</label>
          <select
            value={activeShopId}
            onChange={e => setSelectedShopId(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {userShops.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.channel})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Tháng</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* KPI & sale days info */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
          <p className="text-xs text-blue-400 font-medium mb-1">KPI tháng (Admin đặt)</p>
          <p className="text-2xl font-bold text-blue-400">{formatCurrency(kpiAmount)}đ</p>
        </div>
        <div className="bg-gradient-to-r from-orange-500/10 to-pink-500/10 border border-orange-500/30 rounded-xl p-4">
          <p className="text-xs text-orange-400 font-medium mb-1">Ngày sale tháng {month}</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {saleDays.map(sd => (
              <span key={sd.day} className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                sd.type === 'sale_double' ? 'bg-red-500/15 text-red-400' : 'bg-orange-500/15 text-orange-400'
              }`}>
                {sd.type === 'sale_double' ? '🔥' : '🏷️'} {sd.day}/{month}
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1.5">
            {dayCounts.saleDouble} ngày đôi + {dayCounts.saleFixed} ngày 15/25 + {dayCounts.regular} ngày thường
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Revenue plan */}
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5 space-y-4">
          <h2 className="font-medium text-gray-100">Phân bổ doanh thu</h2>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                🔥 Ngày đôi ({dayCounts.saleDouble} ngày)
              </label>
              <input
                type="number" min={0}
                value={form.saleDoubleDayTarget || ''}
                onChange={e => setNum('saleDoubleDayTarget', e.target.value)}
                className="w-full px-3 py-2.5 border border-red-500/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-red-500/10 text-gray-100"
                placeholder="Target/ngày đôi"
              />
              <p className="text-xs text-gray-500 mt-1">= {formatCurrency(form.saleDoubleDayTarget * dayCounts.saleDouble)}đ</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                🏷️ Ngày 15/25 ({dayCounts.saleFixed} ngày)
              </label>
              <input
                type="number" min={0}
                value={form.saleFixedDayTarget || ''}
                onChange={e => setNum('saleFixedDayTarget', e.target.value)}
                className="w-full px-3 py-2.5 border border-orange-500/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-orange-500/10 text-gray-100"
                placeholder="Target/ngày sale"
              />
              <p className="text-xs text-gray-500 mt-1">= {formatCurrency(form.saleFixedDayTarget * dayCounts.saleFixed)}đ</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Ngày thường ({dayCounts.regular} ngày)
              </label>
              <input
                type="number" min={0}
                value={form.regularDayTarget || ''}
                onChange={e => setNum('regularDayTarget', e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Target/ngày thường"
              />
              <p className="text-xs text-gray-500 mt-1">= {formatCurrency(form.regularDayTarget * dayCounts.regular)}đ</p>
            </div>
          </div>

          {/* Revenue check */}
          <div className={`rounded-lg p-3 flex items-center justify-between ${
            revenueMatch ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-amber-500/10 border border-amber-500/30'
          }`}>
            <div>
              <p className="text-sm font-medium text-gray-100">Tổng kế hoạch doanh thu</p>
              <p className="text-xs text-gray-500">
                ({formatCurrency(form.saleDoubleDayTarget)}×{dayCounts.saleDouble}) +
                ({formatCurrency(form.saleFixedDayTarget)}×{dayCounts.saleFixed}) +
                ({formatCurrency(form.regularDayTarget)}×{dayCounts.regular})
              </p>
            </div>
            <div className="text-right">
              <p className={`text-lg font-bold ${revenueMatch ? 'text-emerald-400' : 'text-amber-400'}`}>
                {formatCurrency(revenueTotal)}đ
              </p>
              {revenueMatch ? (
                <p className="text-xs text-emerald-400">✓ Khớp KPI</p>
              ) : (
                <p className="text-xs text-amber-400">
                  {revenueDiff > 0 ? '+' : ''}{formatCurrency(revenueDiff)}đ so với KPI
                </p>
              )}
            </div>
          </div>
        </div>

        {/* MKT plan */}
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5 space-y-4">
          <h2 className="font-medium text-gray-100">Phân bổ chi phí MKT</h2>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Tổng ngân sách MKT tháng</label>
            <input
              type="number" min={0}
              value={form.totalMktBudget || ''}
              onChange={e => setNum('totalMktBudget', e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Tổng chi phí MKT tháng"
            />
            {revenueTotal > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                = {((form.totalMktBudget / revenueTotal) * 100).toFixed(1)}% trên tổng doanh thu kế hoạch
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                MKT/ngày sale ({dayCounts.saleDouble + dayCounts.saleFixed} ngày)
              </label>
              <input
                type="number" min={0}
                value={form.saleDayMkt || ''}
                onChange={e => setNum('saleDayMkt', e.target.value)}
                className="w-full px-3 py-2.5 border border-orange-500/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-orange-500/10 text-gray-100"
                placeholder="MKT/ngày sale"
              />
              <p className="text-xs text-gray-500 mt-1">
                = {formatCurrency(form.saleDayMkt * (dayCounts.saleDouble + dayCounts.saleFixed))}đ
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                MKT/ngày thường ({dayCounts.regular} ngày)
              </label>
              <input
                type="number" min={0}
                value={form.regularDayMkt || ''}
                onChange={e => setNum('regularDayMkt', e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="MKT/ngày thường"
              />
              <p className="text-xs text-gray-500 mt-1">
                = {formatCurrency(form.regularDayMkt * dayCounts.regular)}đ
              </p>
            </div>
          </div>

          {/* MKT check */}
          <div className={`rounded-lg p-3 flex items-center justify-between ${
            Math.abs(mktTotalCalc - form.totalMktBudget) < 1000
              ? 'bg-emerald-500/10 border border-emerald-500/30'
              : 'bg-amber-500/10 border border-amber-500/30'
          }`}>
            <div>
              <p className="text-sm font-medium text-gray-100">Tổng MKT phân bổ</p>
              <p className="text-xs text-gray-500">
                ({formatCurrency(form.saleDayMkt)}×{dayCounts.saleDouble + dayCounts.saleFixed}) +
                ({formatCurrency(form.regularDayMkt)}×{dayCounts.regular})
              </p>
            </div>
            <div className="text-right">
              <p className={`text-lg font-bold ${
                Math.abs(mktTotalCalc - form.totalMktBudget) < 1000 ? 'text-emerald-400' : 'text-amber-400'
              }`}>
                {formatCurrency(mktTotalCalc)}đ
              </p>
              {Math.abs(mktTotalCalc - form.totalMktBudget) < 1000 ? (
                <p className="text-xs text-emerald-400">✓ Khớp ngân sách</p>
              ) : (
                <p className="text-xs text-amber-400">
                  {mktTotalCalc - form.totalMktBudget > 0 ? '+' : ''}{formatCurrency(mktTotalCalc - form.totalMktBudget)}đ so với ngân sách
                </p>
              )}
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-3 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors"
        >
          {existingPlan ? 'Cập nhật kế hoạch' : 'Lưu kế hoạch'}
        </button>
      </form>
    </div>
  );
}
