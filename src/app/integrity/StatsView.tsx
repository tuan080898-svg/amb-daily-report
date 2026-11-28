'use client';

import { useState } from 'react';
import { igDay, igRange, igShift, igStats, type IgData, type IgPeriod, type IgStats } from '@/lib/integrity';
import { btnCls, cardCls, chipCls } from './ui';

var PERIODS: Array<[IgPeriod, string]> = [['day', 'Ngày'], ['week', 'Tuần'], ['month', 'Tháng']];
var TREND: Record<IgPeriod, number> = { day: 7, week: 8, month: 6 };

function color(score: number | null): string {
  if (score === null) return 'text-gray-500';
  return score >= 90 ? 'text-green-300' : score >= 70 ? 'text-yellow-200' : 'text-red-300';
}
function bar(score: number | null): string {
  if (score === null) return 'bg-slate-700';
  return score >= 90 ? 'bg-green-500' : score >= 70 ? 'bg-yellow-500' : 'bg-red-500';
}
var pct = function(n: number | null) { return n === null ? '—' : n + '%'; };
var settled = function(s: IgStats) { return s.kept + s.restoredEarly + s.restoredLate + s.broken; };

export default function StatsView({ data }: { data: IgData }) {
  var nowMs = Date.parse(data.now);
  var today = igDay(data.now);
  var [period, setPeriod] = useState<IgPeriod>('week');
  var [anchor, setAnchor] = useState(today);
  var [who, setWho] = useState('');
  var range = igRange(period, anchor);
  var scope = who ? data.items.filter(function(c) { return c.ownerId === who; }) : data.items;
  var total = igStats(scope, range.from, range.to, nowMs);
  var whoName = who ? (data.users.find(function(u) { return u.id === who; }) || { name: '' }).name : 'Cả tổ chức';

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

  var parts: Array<[string, number, string]> = [
    ['Đúng hạn', total.kept, 'text-green-300'],
    ['Báo trước', total.restoredEarly, 'text-teal-300'],
    ['Khôi phục trễ', total.restoredLate, 'text-yellow-200'],
    ['Còn nợ', total.broken, 'text-red-300'],
  ];
  var cols: Array<[string, (s: IgStats) => number]> = [
    ['Số lời', function(s) { return s.total; }],
    ['Đúng hạn', function(s) { return s.kept; }],
    ['Báo trước', function(s) { return s.restoredEarly; }],
    ['Khôi phục trễ', function(s) { return s.restoredLate; }],
    ['Còn nợ', function(s) { return s.broken; }],
    ['Chờ nghiệm thu', function(s) { return s.pending; }],
    ['Chưa tới hạn', function(s) { return s.upcoming; }],
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {PERIODS.map(function(p) { return <button key={p[0]} aria-pressed={period === p[0]} className={chipCls(period === p[0]) + ' flex-1'} onClick={function() { setPeriod(p[0]); setAnchor(today); }}>{p[1]}</button>; })}
      </div>
      <div className="flex items-center gap-2">
        <button className={btnCls} aria-label="Kỳ trước" onClick={function() { setAnchor(igShift(period, anchor, -1)); }}>◀</button>
        <button className="flex-1 text-center text-sm font-semibold text-gray-100" title="Về kỳ hiện tại" onClick={function() { setAnchor(today); }}>
          {range.label}{range.from <= today && today <= range.to ? ' (hiện tại)' : ''}
        </button>
        <button className={btnCls} aria-label="Kỳ sau" onClick={function() { setAnchor(igShift(period, anchor, 1)); }}>▶</button>
      </div>

      <div className={cardCls + ' text-center'}>
        <p className="text-sm text-gray-400">{whoName} giữ lời</p>
        <p className={'text-5xl font-bold my-1 ' + color(total.score)}>{pct(total.score)}</p>
        <p className="text-xs text-gray-500">
          {settled(total) ? (total.kept + total.restoredEarly) + ' / ' + settled(total) + ' lời đã đến lúc chấm' : 'Chưa có lời nào đến lúc chấm'}
          {total.pending ? ' · ' + total.pending + ' chờ nghiệm thu' : ''}{total.upcoming ? ' · ' + total.upcoming + ' chưa tới hạn' : ''}
        </p>
        <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-slate-700/60">
          {parts.map(function(p) { return <div key={p[0]}><p className={'text-xl font-bold ' + p[2]}>{p[1]}</p><p className="text-[11px] text-gray-500">{p[0]}</p></div>; })}
        </div>
        {who && <button className="mt-3 text-sm text-blue-400 underline" onClick={function() { setWho(''); }}>← Xem cả tổ chức</button>}
      </div>

      <div className={cardCls}>
        <p className="text-sm font-semibold text-gray-200 mb-2">Từng thành viên <span className="font-normal text-gray-500">· bấm tên để xem riêng</span></p>
        <ul>
          {rows.map(function(r) {
            return (
              <li key={r.u.id}>
                <button aria-pressed={who === r.u.id} onClick={function() { setWho(who === r.u.id ? '' : r.u.id); }}
                  className={'w-full flex items-center gap-3 py-2 px-2 rounded-lg text-left ' + (who === r.u.id ? 'bg-blue-500/15' : 'hover:bg-slate-800')}>
                  <span className="w-28 md:w-40 truncate text-sm text-gray-200">{r.u.name}</span>
                  <span className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden"><span className={'block h-full ' + bar(r.s.score)} style={{ width: (r.s.score || 0) + '%' }} /></span>
                  <span className={'w-12 text-right text-sm font-bold ' + color(r.s.score)}>{pct(r.s.score)}</span>
                  <span className="w-14 text-right text-xs text-gray-500">{r.s.total} lời</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={cardCls}>
        <p className="text-sm font-semibold text-gray-200 mb-3">Xu hướng · {whoName}</p>
        <div className="flex items-end gap-1 h-32 overflow-x-auto">
          {trend.map(function(t) {
            return (
              <button key={t.anchor} onClick={function() { setAnchor(t.anchor); }} title={t.label + ': ' + pct(t.s.score) + ' (' + t.s.total + ' lời)'}
                className="flex-1 min-w-9 h-full flex flex-col items-center justify-end gap-1">
                <span className={'text-[10px] ' + color(t.s.score)}>{pct(t.s.score)}</span>
                <span className={'w-full max-w-10 rounded-t ' + bar(t.s.score)} style={{ height: Math.max(2, (t.s.score || 0) * 0.7) + 'px' }} />
                <span className="text-[10px] text-gray-500 whitespace-nowrap">{t.label.split(' – ')[0]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <details className={cardCls}>
        <summary className="cursor-pointer text-sm font-medium text-gray-200">Bảng chi tiết và cách tính điểm</summary>
        <p className="text-xs text-gray-500 my-2">
          Điểm = (giữ đúng hạn + báo trước hạn và làm đủ 3 bước) / số lời đã đến lúc chấm. Lời chờ nghiệm thu và lời chưa tới hạn chưa tính. Lời được xếp vào kỳ theo ngày đến hạn.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[620px]">
            <thead>
              <tr className="text-xs text-gray-500 text-right">
                <th className="text-left font-medium py-2">Thành viên</th>
                {cols.map(function(c) { return <th key={c[0]} className="font-medium px-2">{c[0]}</th>; })}
              </tr>
            </thead>
            <tbody>
              {rows.map(function(r) {
                return (
                  <tr key={r.u.id} className="border-t border-slate-800 text-right text-gray-300">
                    <td className="text-left py-2">{r.u.name}</td>
                    {cols.map(function(c) { return <td key={c[0]} className="px-2">{c[1](r.s)}</td>; })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
