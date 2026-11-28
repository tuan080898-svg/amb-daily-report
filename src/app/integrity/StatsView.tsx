'use client';

import { useState } from 'react';
import { igDay, igRange, igShift, igStats, type IgData, type IgPeriod, type IgStats } from '@/lib/integrity';
import { btnCls, btnPrimaryCls, cardCls, inputCls } from './ui';

var PERIODS: Array<[IgPeriod, string]> = [['day', 'Ngày'], ['week', 'Tuần'], ['month', 'Tháng']];
var TREND: Record<IgPeriod, number> = { day: 14, week: 8, month: 6 };

function color(score: number | null): string {
  if (score === null) return 'text-gray-500';
  return score >= 90 ? 'text-green-300' : score >= 70 ? 'text-yellow-200' : 'text-red-300';
}
var pct = function(n: number | null) { return n === null ? '—' : n + '%'; };

export default function StatsView({ data }: { data: IgData }) {
  var nowMs = Date.parse(data.now);
  var today = igDay(data.now);
  var [period, setPeriod] = useState<IgPeriod>('week');
  var [anchor, setAnchor] = useState(today);
  var [who, setWho] = useState('');
  var range = igRange(period, anchor);
  var scope = who ? data.items.filter(function(c) { return c.ownerId === who; }) : data.items;
  var total = igStats(scope, range.from, range.to, nowMs);

  var rows = data.users.map(function(u) {
    return { u: u, s: igStats(data.items.filter(function(c) { return c.ownerId === u.id; }), range.from, range.to, nowMs) };
  }).sort(function(a, b) {
    // Người có điểm đứng trước, cao xuống thấp; cùng điểm thì nhiều lời hơn đứng trước
    return (b.s.score === null ? -1 : b.s.score) - (a.s.score === null ? -1 : a.s.score) || b.s.total - a.s.total || a.u.name.localeCompare(b.u.name, 'vi');
  });

  var trend = Array.from({ length: TREND[period] }, function(_, i) {
    var a = igShift(period, anchor, i - TREND[period] + 1);
    var r = igRange(period, a);
    return { anchor: a, label: r.label, s: igStats(scope, r.from, r.to, nowMs) };
  });

  var tiles: Array<[string, string | number, string]> = [
    ['Điểm Integrity', pct(total.score), color(total.score)],
    ['Lời đến hạn trong kỳ', total.total, 'text-gray-100'],
    ['Giữ lời đúng hạn', total.kept, 'text-green-300'],
    ['Báo trước, đã khôi phục', total.restoredEarly, 'text-teal-300'],
    ['Khôi phục sau hạn', total.restoredLate, 'text-yellow-200'],
    ['Quá hạn chưa khôi phục', total.broken, 'text-red-300'],
  ];
  var cols: Array<[string, (s: IgStats) => number]> = [
    ['Số lời', function(s) { return s.total; }],
    ['Đúng hạn', function(s) { return s.kept; }],
    ['Báo trước', function(s) { return s.restoredEarly; }],
    ['KP sau hạn', function(s) { return s.restoredLate; }],
    ['Chưa KP', function(s) { return s.broken; }],
    ['Chờ NT', function(s) { return s.pending; }],
    ['Chưa tới hạn', function(s) { return s.upcoming; }],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map(function(p) { return <button key={p[0]} aria-pressed={period === p[0]} className={period === p[0] ? btnPrimaryCls : btnCls} onClick={function() { setPeriod(p[0]); }}>{p[1]}</button>; })}
        <button className={btnCls} aria-label="Kỳ trước" onClick={function() { setAnchor(igShift(period, anchor, -1)); }}>◀</button>
        <span className="text-sm font-medium text-gray-200 min-w-28 text-center">{range.label}</span>
        <button className={btnCls} aria-label="Kỳ sau" onClick={function() { setAnchor(igShift(period, anchor, 1)); }}>▶</button>
        <button className={btnCls} onClick={function() { setAnchor(today); }}>Hiện tại</button>
        <select className={inputCls + ' !w-auto'} value={who} onChange={function(e) { setWho(e.target.value); }} aria-label="Phạm vi">
          <option value="">Toàn tổ chức</option>
          {data.users.map(function(u) { return <option key={u.id} value={u.id}>{u.name}</option>; })}
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {tiles.map(function(t) {
          return <div key={t[0]} className={cardCls}><p className="text-xs text-gray-500">{t[0]}</p><p className={'text-2xl font-bold mt-1 ' + t[2]}>{t[1]}</p></div>;
        })}
      </div>
      <p className="text-xs text-gray-500">
        Điểm = (giữ đúng hạn + báo trước hạn và làm đủ 3 bước) / số lời đã ngã ngũ. Lời chờ nghiệm thu và lời chưa tới hạn chưa tính vào điểm. Lời được xếp vào kỳ theo ngày đến hạn.
      </p>

      <div className={cardCls}>
        <p className="text-sm font-medium text-gray-200 mb-3">Xu hướng {TREND[period]} kỳ gần nhất · bấm cột để xem kỳ đó</p>
        <div className="flex items-end gap-1 h-36 overflow-x-auto">
          {trend.map(function(t) {
            return (
              <button key={t.anchor} onClick={function() { setAnchor(t.anchor); }} title={t.label + ': ' + pct(t.s.score) + ' (' + t.s.total + ' lời)'}
                className="flex-1 min-w-9 h-full flex flex-col items-center justify-end gap-1">
                <span className={'text-[10px] ' + color(t.s.score)}>{pct(t.s.score)}</span>
                <span className={'w-full max-w-10 rounded-t ' + (t.s.score === null ? 'bg-slate-700' : 'bg-blue-500')} style={{ height: Math.max(2, (t.s.score || 0) * 0.8) + 'px' }} />
                <span className="text-[10px] text-gray-500 whitespace-nowrap">{t.label.split(' – ')[0]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={cardCls + ' overflow-x-auto'}>
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-xs text-gray-500 text-right">
              <th className="text-left font-medium py-2">Thành viên</th>
              <th className="font-medium px-2">Điểm</th>
              {cols.map(function(c) { return <th key={c[0]} className="font-medium px-2">{c[0]}</th>; })}
            </tr>
          </thead>
          <tbody>
            {rows.map(function(r) {
              return (
                <tr key={r.u.id} className="border-t border-slate-800 text-right text-gray-300">
                  <td className="text-left py-2">{r.u.name}</td>
                  <td className={'px-2 font-bold ' + color(r.s.score)}>{pct(r.s.score)}</td>
                  {cols.map(function(c) { return <td key={c[0]} className="px-2">{c[1](r.s)}</td>; })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
