'use client';

import { useState } from 'react';
import { useAppState } from '@/lib/store';
import { formatPercent } from '@/lib/utils';

export default function AdminConfigPage() {
  const { currentUser, config, updateConfig } = useAppState();
  const [form, setForm] = useState({ ...config });
  const [success, setSuccess] = useState('');

  if (!currentUser || currentUser.role !== 'admin') {
    return <div className="p-6 text-red-400">Bạn không có quyền truy cập trang này.</div>;
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateConfig(form);
    setSuccess('Đã lưu cấu hình');
    setTimeout(() => setSuccess(''), 3000);
  }

  function setPercent(field: keyof typeof form, value: string) {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setForm(f => ({ ...f, [field]: num / 100 }));
    }
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-100 mb-1">Cấu hình ngưỡng cảnh báo</h1>
      <p className="text-sm text-gray-500 mb-6">Thiết lập ngưỡng % cho cảnh báo màu trên dashboard</p>

      {success && (
        <div className="mb-4 px-4 py-3 bg-emerald-500/10 text-emerald-400 rounded-lg text-sm font-medium">{success}</div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5 space-y-4">
          <h2 className="font-medium text-gray-100">Chi phí quảng cáo (% MKT / Doanh thu)</h2>
          <p className="text-xs text-gray-500">Cảnh báo doanh số: Xanh ≥ 100%, Vàng 70-99%, Đỏ &lt; 70% (cố định)</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Ngưỡng Xanh (≤ x% = OK)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={(form.adsThresholdGreen * 100).toFixed(1)}
                  onChange={e => setPercent('adsThresholdGreen', e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Ngưỡng Vàng (≤ x% = cảnh báo nhẹ)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={(form.adsThresholdYellow * 100).toFixed(1)}
                  onChange={e => setPercent('adsThresholdYellow', e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500">Trên ngưỡng Vàng = Đỏ (nguy hiểm)</p>
        </div>

        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5 space-y-4">
          <h2 className="font-medium text-gray-100">Tỉ lệ hoàn/huỷ đơn</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Ngưỡng Vàng (cảnh báo nhẹ)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={(form.cancelReturnThresholdYellow * 100).toFixed(1)}
                  onChange={e => setPercent('cancelReturnThresholdYellow', e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Ngưỡng Đỏ (nguy hiểm)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={(form.cancelReturnThresholdRed * 100).toFixed(1)}
                  onChange={e => setPercent('cancelReturnThresholdRed', e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700/50 rounded-xl p-5">
          <h2 className="font-medium text-gray-100 mb-3">Tóm tắt cấu hình hiện tại</h2>
          <div className="space-y-2 text-sm">
            <p><span className="inline-block w-3 h-3 rounded-full bg-emerald-500 mr-2"></span>Hiệu quả: &lt; {formatPercent(form.adsThresholdGreen)}</p>
            <p><span className="inline-block w-3 h-3 rounded-full bg-amber-500 mr-2"></span>Trong ngưỡng: {formatPercent(form.adsThresholdGreen)} – {formatPercent(form.adsThresholdYellow)}</p>
            <p><span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-2"></span>Cảnh báo chi phí cao: ≥ {formatPercent(form.adsThresholdYellow)}</p>
            <hr className="my-2 border-slate-700" />
            <p><span className="inline-block w-3 h-3 rounded-full bg-emerald-500 mr-2"></span>Hoàn/Huỷ OK: ≤ {formatPercent(form.cancelReturnThresholdYellow)}</p>
            <p><span className="inline-block w-3 h-3 rounded-full bg-amber-500 mr-2"></span>Hoàn/Huỷ cảnh báo: {formatPercent(form.cancelReturnThresholdYellow)} – {formatPercent(form.cancelReturnThresholdRed)}</p>
            <p><span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-2"></span>Hoàn/Huỷ nguy hiểm: &gt; {formatPercent(form.cancelReturnThresholdRed)}</p>
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-3 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors"
        >
          Lưu cấu hình
        </button>
      </form>
    </div>
  );
}
