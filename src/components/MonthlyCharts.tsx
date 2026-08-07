'use client';

import { useMemo, useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { DailyReport, Shop } from '@/lib/types';

interface ChartDataPoint {
  key: string;
  label: string;
  revenue: number;
  mktPercent: number;
  adSpend: number;
  totalOrders: number;
}

function aggregateByDay(reports: DailyReport[]): ChartDataPoint[] {
  const map = new Map<string, { revenue: number; adSpend: number; totalOrders: number }>();
  for (const r of reports) {
    const date = r.date;
    const cur = map.get(date) || { revenue: 0, adSpend: 0, totalOrders: 0 };
    cur.revenue += r.actualRevenue;
    cur.adSpend += r.adSpend;
    cur.totalOrders += r.totalOrders;
    map.set(date, cur);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      key: date,
      label: parseInt(date.split('-')[2]) + '/' + parseInt(date.split('-')[1]),
      revenue: data.revenue,
      mktPercent: data.revenue > 0 ? Math.round((data.adSpend / data.revenue) * 1000) / 10 : 0,
      adSpend: data.adSpend,
      totalOrders: data.totalOrders,
    }));
}

function formatVND(value: number): string {
  if (value >= 1000000000) return (value / 1000000000).toFixed(1) + 'B';
  if (value >= 1000000) return (value / 1000000).toFixed(0) + 'M';
  if (value >= 1000) return (value / 1000).toFixed(0) + 'K';
  return String(value);
}

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-3 text-sm">
      <p className="font-medium text-gray-100 mb-1">{label}</p>
      {payload.map(function(p: TooltipPayload, i: number) {
        let formatted: string;
        if (p.name.indexOf('%') >= 0) {
          formatted = p.value + '%';
        } else if (p.name === 'Số đơn') {
          formatted = new Intl.NumberFormat('vi-VN').format(p.value) + ' đơn';
        } else {
          formatted = new Intl.NumberFormat('vi-VN').format(p.value) + 'đ';
        }
        return (
          <p key={i} className="flex justify-between gap-4" style={{ color: p.color }}>
            <span>{p.name}:</span>
            <span className="font-medium">{formatted}</span>
          </p>
        );
      })}
    </div>
  );
}

function RevenueChart({ data, title }: { data: ChartDataPoint[]; title: string }) {
  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-200 mb-4">{title}</h3>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="label" tick={{ fontSize: data.length > 15 ? 10 : 12, fill: '#9ca3af', fontWeight: 700 }} angle={data.length > 15 ? -45 : 0} textAnchor={data.length > 15 ? 'end' : 'middle'} height={data.length > 15 ? 50 : 30} stroke="#475569" />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 12, fill: '#9ca3af', fontWeight: 700 }}
              tickFormatter={formatVND}
              width={60}
              stroke="#475569"
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 12, fill: '#9ca3af', fontWeight: 700 }}
              tickFormatter={function(v: number) { return v + '%'; }}
              width={50}
              domain={[0, 'auto']}
              stroke="#475569"
            />
            <YAxis
              yAxisId="orders"
              hide={true}
              domain={[0, 'auto']}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8, color: '#9ca3af' }} />
            <Bar
              yAxisId="left"
              dataKey="revenue"
              name="Doanh thu"
              fill="#3b82f6"
              radius={[4, 4, 0, 0]}
              barSize={data.length <= 7 ? 32 : data.length <= 15 ? 18 : 10}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="mktPercent"
              name="% MKT/DT"
              stroke="#f87171"
              strokeWidth={2.5}
              dot={{ r: 4, fill: '#f87171' }}
              activeDot={{ r: 6 }}
            />
            <Line
              yAxisId="orders"
              type="monotone"
              dataKey="totalOrders"
              name="Số đơn"
              stroke="#a78bfa"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={{ r: 3, fill: '#a78bfa' }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function MonthlyCharts({ reports, shops }: { reports: DailyReport[]; shops: Shop[] }) {
  const [showShopCharts, setShowShopCharts] = useState(false);

  const totalData = useMemo(function() {
    return aggregateByDay(reports);
  }, [reports]);

  const shopDataMap = useMemo(function() {
    if (!showShopCharts) return new Map<string, ChartDataPoint[]>();
    const map = new Map<string, ChartDataPoint[]>();
    for (const shop of shops) {
      const shopReports = reports.filter(function(r) { return r.shopId === shop.id; });
      if (shopReports.length > 0) {
        map.set(shop.id, aggregateByDay(shopReports));
      }
    }
    return map;
  }, [reports, shops, showShopCharts]);

  if (totalData.length === 0) return null;

  return (
    <div className="space-y-4">
      <RevenueChart data={totalData} title="Tổng hợp Doanh thu & % MKT theo ngày" />

      <div className="flex justify-center">
        <button
          onClick={function() { setShowShopCharts(!showShopCharts); }}
          className="px-4 py-2 text-sm font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg transition-colors"
        >
          {showShopCharts ? 'Ẩn biểu đồ từng shop' : 'Xem biểu đồ từng shop'}
        </button>
      </div>

      {showShopCharts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {shops.map(function(shop) {
            const data = shopDataMap.get(shop.id);
            if (!data) return null;
            return (
              <RevenueChart
                key={shop.id}
                data={data}
                title={shop.name + ' (' + shop.channel + ' - ' + shop.region + ')'}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
