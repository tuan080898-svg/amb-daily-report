'use client';

import { useState, useMemo } from 'react';
import { useAppState } from '@/lib/store';
import { formatCurrency, getDaysInMonth, getSaleDays, calcPlanTotal } from '@/lib/utils';

export default function AdminKPIPage() {
  const { currentUser, shops, users, monthlyKPIs, monthlyPlans, updateKPI } = useAppState();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [editingShopId, setEditingShopId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState(0);
  const [success, setSuccess] = useState('');

  if (!currentUser || currentUser.role !== 'admin') {
    return <div className="p-6 text-red-400">Bạn không có quyền truy cập trang này.</div>;
  }

  const [yearStr, monthStr] = selectedMonth.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);

  const kpiData = useMemo(() => {
    return shops.map(shop => {
      const kpi = monthlyKPIs.find(k => k.shopId === shop.id && k.month === selectedMonth);
      const kpiAmount = kpi?.kpiAmount ?? shop.defaultMonthlyTarget;
      const plan = monthlyPlans.find(p => p.shopId === shop.id && p.month === selectedMonth);
      const planTotal = plan ? calcPlanTotal(year, month, plan) : 0;
      const assignee = users.find(u => shop.assignedTo.includes(u.id));
      const hasPlan = !!plan;
      const planMatch = hasPlan && Math.abs(planTotal - kpiAmount) < 1000;
      return { shop, kpiAmount, assignee, hasPlan, planTotal, planMatch };
    });
  }, [shops, monthlyKPIs, monthlyPlans, users, selectedMonth, year, month]);

  function handleSave(shopId: string) {
    updateKPI({ shopId, month: selectedMonth, kpiAmount: editValue });
    setEditingShopId(null);
    setSuccess(`Đã cập nhật KPI cho ${shops.find(s => s.id === shopId)?.name}`);
    setTimeout(() => setSuccess(''), 3000);
  }

  const totalKPI = kpiData.reduce((s, d) => s + d.kpiAmount, 0);
  const plannedCount = kpiData.filter(d => d.hasPlan).length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">KPI tháng</h1>
          <p className="text-sm text-gray-500 mt-1">
            Tháng {month}/{year} — Tổng KPI: {formatCurrency(totalKPI)}đ — {plannedCount}/{shops.length} shop đã lên kế hoạch
          </p>
        </div>
        <input
          type="month"
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-100"
        />
      </div>

      {success && (
        <div className="mb-4 px-4 py-3 bg-emerald-500/10 text-emerald-400 rounded-lg text-sm font-medium">{success}</div>
      )}

      <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 border-b border-slate-700/50">
                <th className="text-left px-4 py-3 font-medium text-gray-400">Shop</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">Kênh</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">KV</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">Người phụ trách</th>
                <th className="text-right px-4 py-3 font-medium text-gray-400">KPI tháng</th>
                <th className="text-center px-4 py-3 font-medium text-gray-400">Kế hoạch NV</th>
                <th className="text-right px-4 py-3 font-medium text-gray-400">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {kpiData.map(({ shop, kpiAmount, assignee, hasPlan, planTotal, planMatch }) => (
                <tr key={shop.id} className="hover:bg-slate-800">
                  <td className="px-4 py-3 font-medium text-gray-100">{shop.name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      shop.channel === 'Shopee' ? 'bg-orange-500/15 text-orange-400' : 'bg-pink-500/15 text-pink-400'
                    }`}>{shop.channel}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      shop.region === 'HCM' ? 'bg-blue-500/15 text-blue-400' : 'bg-violet-500/15 text-violet-400'
                    }`}>{shop.region}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{assignee?.name || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {editingShopId === shop.id ? (
                      <input
                        type="number"
                        min={0}
                        value={editValue || ''}
                        onChange={e => setEditValue(parseInt(e.target.value) || 0)}
                        className="w-40 px-2 py-1.5 border border-blue-300 rounded text-sm text-right bg-slate-800 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                    ) : (
                      <span className="text-gray-100 font-bold">{formatCurrency(kpiAmount)}đ</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {hasPlan ? (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                        planMatch ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
                      }`}>
                        {planMatch ? '✓ Khớp KPI' : `⚠ ${formatCurrency(planTotal)}đ`}
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-gray-500">
                        Chưa lên KH
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editingShopId === shop.id ? (
                      <span className="space-x-2">
                        <button onClick={() => handleSave(shop.id)} className="px-3 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-500">Lưu</button>
                        <button onClick={() => setEditingShopId(null)} className="px-3 py-1 bg-slate-800 text-gray-400 rounded text-xs hover:bg-slate-700">Huỷ</button>
                      </span>
                    ) : (
                      <button
                        onClick={() => { setEditingShopId(shop.id); setEditValue(kpiAmount); }}
                        className="text-blue-400 hover:underline text-xs"
                      >Sửa KPI</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
