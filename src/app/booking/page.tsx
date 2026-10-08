'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { BookingSnapshot, BookingLive, Granularity, NO_PRODUCT, buildBookingReport, mergeLive, todayVn, addDays } from '@/lib/booking';

type Preset = 'today' | '7d' | '30d' | 'month' | '90d' | 'all';

const PRESETS: Array<{ key: Preset; label: string }> = [
  { key: 'today', label: 'Hôm nay' },
  { key: '7d', label: '7 ngày' },
  { key: '30d', label: '30 ngày' },
  { key: 'month', label: 'Tháng này' },
  { key: '90d', label: '3 tháng' },
  { key: 'all', label: 'Tất cả' },
];

const GRANS: Array<{ key: Granularity; label: string }> = [
  { key: 'day', label: 'Ngày' },
  { key: 'week', label: 'Tuần' },
  { key: 'month', label: 'Tháng' },
];

const STALE_MS = 26 * 3600 * 1000;

function presetRange(p: Preset): { from: string; to: string } {
  const today = todayVn();
  if (p === 'today') return { from: today, to: today };
  if (p === '7d') return { from: addDays(today, -6), to: today };
  if (p === '30d') return { from: addDays(today, -29), to: today };
  if (p === '90d') return { from: addDays(today, -89), to: today };
  if (p === 'month') return { from: today.slice(0, 8) + '01', to: today };
  return { from: '2024-01-01', to: addDays(today, 365) };
}

function fmt(n: number): string { return n.toLocaleString('vi-VN'); }
function pct(a: number, b: number): string { return b > 0 ? (a / b * 100).toFixed(1) + '%' : '—'; }
function fmtDate(d: string): string { const p = d.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
function weekday(d: string): string {
  const names = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return names[new Date(d + 'T00:00:00Z').getUTCDay()];
}
function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return 'vừa xong';
  if (mins < 60) return mins + ' phút trước';
  if (mins < 1440) return Math.round(mins / 60) + ' giờ trước';
  return Math.round(mins / 1440) + ' ngày trước';
}

function Kpi(props: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/30">
      <p className="text-slate-400 text-xs mb-1">{props.label}</p>
      <p className={'text-2xl font-bold ' + props.color}>{props.value}</p>
      {props.sub && <p className="text-xs text-slate-500 mt-0.5">{props.sub}</p>}
    </div>
  );
}

function ChartTip(props: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!props.active || !props.payload || props.payload.length === 0) return null;
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-3 text-sm">
      <p className="font-medium text-gray-100 mb-1">{props.label}</p>
      {props.payload.map(function(p, i) {
        return (
          <p key={i} className="flex justify-between gap-4" style={{ color: p.color }}>
            <span>{p.name}:</span><span className="font-medium">{fmt(p.value)}</span>
          </p>
        );
      })}
    </div>
  );
}

export default function BookingPage() {
  const [baseSnap, setBaseSnap] = useState<BookingSnapshot | null>(null);
  const [live, setLive] = useState<BookingLive | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const [preset, setPreset] = useState<Preset>('30d');
  const [from, setFrom] = useState(presetRange('30d').from);
  const [to, setTo] = useState(presetRange('30d').to);
  const [staff, setStaff] = useState(-1);
  const [product, setProduct] = useState(-1);
  const [gran, setGran] = useState<Granularity>('day');
  const [unique, setUnique] = useState(true);
  const baseRef = useRef<BookingSnapshot | null>(null);
  const liveBusy = useRef(false);

  const snap = useMemo(function() { return baseSnap ? mergeLive(baseSnap, live) : null; }, [baseSnap, live]);

  const loadBase = useCallback(async function(): Promise<BookingSnapshot | null> {
    const res = await fetch('/api/lark-booking', { cache: 'no-store' });
    if (res.status === 404) return null;
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json.version === 2 ? (json as BookingSnapshot) : null;
  }, []);

  // Đọc trực tiếp từ Lark phần dữ liệu từ đầu tháng (vài giây)
  const refreshLive = useCallback(async function(): Promise<void> {
    const base = baseRef.current;
    if (!base || liveBusy.current) return;
    liveBusy.current = true;
    setLiveLoading(true);
    try {
      const res = await fetch('/api/lark-booking/live?base=' + encodeURIComponent(base.generatedAt), { cache: 'no-store' });
      const json = await res.json();
      if (json.error) throw new Error(json.error === 'base-mismatch' ? 'Dữ liệu lịch sử vừa được cập nhật, hãy tải lại trang' : json.error);
      if (json.baseGeneratedAt === base.generatedAt) { setLive(json as BookingLive); setError(''); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đọc được dữ liệu trực tiếp từ Lark');
    } finally {
      liveBusy.current = false;
      setLiveLoading(false);
    }
  }, []);

  // Đọc lại toàn bộ lịch sử từ Lark (khoảng 30 giây)
  const runFullSync = useCallback(async function(): Promise<void> {
    setSyncing(true);
    setError('');
    try {
      const res = await fetch('/api/lark-booking/sync', { cache: 'no-store' });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const fresh = await loadBase();
      if (fresh) { baseRef.current = fresh; setBaseSnap(fresh); setLive(null); }
      await refreshLive();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không cập nhật được từ Lark');
    } finally {
      setSyncing(false);
    }
  }, [loadBase, refreshLive]);

  useEffect(function() {
    let alive = true;
    (async function() {
      try {
        const b = await loadBase();
        if (!alive) return;
        baseRef.current = b;
        setBaseSnap(b);
        setLoading(false);
        if (!b || Date.now() - Date.parse(b.generatedAt) > STALE_MS) await runFullSync();
        else await refreshLive();
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Không tải được dữ liệu booking');
        setLoading(false);
      }
    })();
    return function() { alive = false; };
  }, [loadBase, runFullSync, refreshLive]);

  // Tự làm mới mỗi phút khi đang xem; quay lại tab thì làm mới ngay
  useEffect(function() {
    const id = setInterval(function() {
      setTick(function(t) { return t + 1; });
      if (document.visibilityState === 'visible') refreshLive();
    }, 60000);
    function onVisible() { if (document.visibilityState === 'visible') refreshLive(); }
    document.addEventListener('visibilitychange', onVisible);
    return function() { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [refreshLive]);

  function applyPreset(p: Preset) {
    const r = presetRange(p);
    setPreset(p);
    setFrom(r.from);
    setTo(r.to);
    if (p === 'all' || p === '90d') setGran(function(g) { return g === 'day' ? 'week' : g; });
  }

  const report = useMemo(function() {
    if (!snap) return null;
    return buildBookingReport(snap, { from: from, to: to, staff: staff, product: product }, gran, unique);
  }, [snap, from, to, staff, product, gran, unique]);

  const selectCls = 'bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-1.5';

  if (loading) return <div className="p-6 text-slate-400 text-sm">Đang tải dữ liệu booking...</div>;

  if (!snap) {
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-lg font-semibold text-gray-100">Báo cáo booking KOC</h1>
        {syncing ? (
          <p className="text-sm text-slate-400">Đang lấy dữ liệu lần đầu từ Lark (khoảng 30-60 giây)...</p>
        ) : (
          <>
            <p className="text-sm text-slate-400">Chưa có dữ liệu booking.</p>
            <button onClick={runFullSync} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg">Lấy dữ liệu từ Lark</button>
          </>
        )}
        {error && <p className="text-sm text-rose-400">Lỗi: {error}</p>}
      </div>
    );
  }

  const r = report!;
  void tick;
  const periodLabel = fmtDate(from) + ' → ' + (to > todayVn() ? 'nay' : fmtDate(to));
  const noProductRow = r.byProduct.find(function(x) { return x.name === NO_PRODUCT; });
  const noProductContacted = noProductRow ? noProductRow.contacted - noProductRow.booked : 0;
  const productRows = r.byProduct.filter(function(x) { return x.booked > 0 || x.scheduled > 0; });
  const maxBar = productRows.reduce(function(m, x) { return Math.max(m, x.booked); }, 0);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-100">Báo cáo booking KOC</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {live
              ? 'Từ ' + fmtDate(live.liveFrom).slice(0, 5) + ' đọc trực tiếp từ Lark (cập nhật ' + ago(live.generatedAt) + '); dữ liệu cũ hơn cập nhật ' + ago(snap.generatedAt)
              : 'Dữ liệu từ Lark Base, cập nhật ' + ago(snap.generatedAt)}
            {' · '}{fmt(snap.meta.contactRows)} KOC đã liên hệ · {fmt(snap.meta.scheduleRows)} lượt hẹn lên video
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshLive} disabled={liveLoading || syncing}
            className={'px-3 py-1.5 text-sm rounded-lg border ' + (liveLoading || syncing ? 'border-slate-700 text-slate-500' : 'border-slate-600 text-slate-200 hover:bg-slate-800')}>
            {liveLoading ? 'Đang đọc từ Lark...' : 'Làm mới'}
          </button>
          <button onClick={runFullSync} disabled={syncing} title="Đọc lại toàn bộ lịch sử từ Lark (khoảng 30 giây)"
            className={'px-3 py-1.5 text-xs rounded-lg border ' + (syncing ? 'border-slate-700 text-slate-500' : 'border-slate-700 text-slate-400 hover:bg-slate-800')}>
            {syncing ? 'Đang cập nhật lịch sử...' : 'Cập nhật cả lịch sử'}
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-rose-400">Lỗi cập nhật: {error}</p>}

      {/* Bộ lọc */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          {PRESETS.map(function(p) {
            return (
              <button key={p.key} onClick={function() { applyPreset(p.key); }}
                className={'px-3 py-1.5 text-sm ' + (preset === p.key ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700')}>
                {p.label}
              </button>
            );
          })}
        </div>
        <input type="date" value={from} onChange={function(e) { setFrom(e.target.value); setPreset('all'); }} className={selectCls} />
        <span className="text-slate-500 text-xs">đến</span>
        <input type="date" value={to > todayVn() ? todayVn() : to} onChange={function(e) { setTo(e.target.value); setPreset('all'); }} className={selectCls} />
        <select value={staff} onChange={function(e) { setStaff(parseInt(e.target.value)); }} className={selectCls}>
          <option value={-1}>Tất cả nhân sự</option>
          {snap.staff.map(function(n, i) { return <option key={i} value={i}>{n}</option>; })}
        </select>
        <select value={product} onChange={function(e) { setProduct(parseInt(e.target.value)); }} className={selectCls}>
          <option value={-1}>Tất cả sản phẩm</option>
          {snap.products.map(function(n, i) { return { n: n, i: i }; })
            .sort(function(a, b) { return a.n.localeCompare(b.n, 'vi'); })
            .map(function(x) { return <option key={x.i} value={x.i}>{x.n}</option>; })}
        </select>
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          {GRANS.map(function(g) {
            return (
              <button key={g.key} onClick={function() { setGran(g.key); }}
                className={'px-3 py-1.5 text-sm ' + (gran === g.key ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700')}>
                {g.label}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-1.5 text-sm text-slate-300 cursor-pointer">
          <input type="checkbox" checked={unique} onChange={function(e) { setUnique(e.target.checked); }} />
          Đếm KOC duy nhất (khuyến nghị)
        </label>
      </div>
      <p className="text-xs text-slate-500 -mt-2">
        {unique ? 'Mỗi KOC (theo tên kênh) chỉ tính 1 lần trong mỗi mốc thời gian.' : 'Mỗi dòng trong bảng Lark tính 1 lượt; một KOC liên hệ nhiều lần/nhiều nhân sự sẽ tính nhiều lượt.'}
      </p>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Đã liên hệ" value={fmt(r.kpi.contacted)} sub={periodLabel + ' (theo ngày liên hệ)'} color="text-blue-400" />
        <Kpi label="Booking được" value={fmt(r.kpi.booked)} sub={pct(r.kpi.booked, r.kpi.contacted) + ' trên đã liên hệ'} color="text-emerald-400" />
        <Kpi label="Đã gửi sản phẩm" value={fmt(r.kpi.sent)} sub={pct(r.kpi.sent, r.kpi.booked) + ' trên booking được'} color="text-amber-400" />
        <Kpi label="Hẹn lên video" value={fmt(r.kpi.scheduled)} sub={'theo ngày hẹn trong kỳ'} color="text-violet-400" />
        <Kpi label="Đã lên video" value={fmt(r.kpi.aired)} sub={pct(r.kpi.aired, r.kpi.scheduled) + ' trên số hẹn'} color="text-pink-400" />
      </div>

      {/* Biểu đồ liên hệ */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-200 mb-4">Số KOC đã liên hệ và booking được theo {gran === 'day' ? 'ngày' : gran === 'week' ? 'tuần' : 'tháng'}</h3>
        {r.contactSeries.length === 0 ? <p className="text-slate-500 text-sm">Không có dữ liệu trong khoảng này.</p> : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={r.contactSeries} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} angle={r.contactSeries.length > 15 ? -45 : 0} textAnchor={r.contactSeries.length > 15 ? 'end' : 'middle'} height={r.contactSeries.length > 15 ? 50 : 30} stroke="#475569" />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} width={45} stroke="#475569" />
                <Tooltip content={<ChartTip />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="contacted" name="Đã liên hệ" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Line dataKey="booked" name="Booking được" stroke="#10b981" strokeWidth={2} dot={r.contactSeries.length <= 31} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Lịch hẹn lên video */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-200 mb-4">Lịch hẹn lên video và số đã lên video (theo ngày hẹn)</h3>
          {r.scheduleSeries.length === 0 ? <p className="text-slate-500 text-sm">Không có lịch hẹn trong khoảng này.</p> : (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={r.scheduleSeries} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} angle={r.scheduleSeries.length > 15 ? -45 : 0} textAnchor={r.scheduleSeries.length > 15 ? 'end' : 'middle'} height={r.scheduleSeries.length > 15 ? 50 : 30} stroke="#475569" />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} width={45} stroke="#475569" />
                  <Tooltip content={<ChartTip />} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Bar dataKey="scheduled" name="Hẹn lên video" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  <Line dataKey="aired" name="Đã lên video" stroke="#ec4899" strokeWidth={2} dot={r.scheduleSeries.length <= 31} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-200 mb-2">Lịch hẹn sắp tới</h3>
            <p className="text-2xl font-bold text-violet-400">{fmt(r.upcomingTotal)}</p>
            <p className="text-xs text-slate-500">lịch hẹn từ hôm nay trở đi, chưa lên video</p>
          </div>
          {r.upcoming.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {r.upcoming.map(function(u) {
                return (
                  <div key={u.date} className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">{weekday(u.date)} {fmtDate(u.date).slice(0, 5)}</span>
                    <span className="text-slate-500 truncate mx-2 flex-1 text-right">{u.byStaff.map(function(s) { return s.name + ' ' + s.count; }).join(' · ')}</span>
                    <span className="font-semibold text-violet-300 w-8 text-right">{u.count}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="border-t border-slate-700/50 pt-3">
            <p className="text-xs text-slate-400 mb-1">Quá hạn chưa lên video</p>
            <p className="text-xl font-bold text-rose-400">{fmt(r.overdueRecent)} <span className="text-xs font-normal text-slate-500">trong 30 ngày qua</span></p>
            {r.overdueByStaff.length > 0 && (
              <p className="text-xs text-slate-500 mt-1">{r.overdueByStaff.map(function(s) { return s.name + ' ' + s.count; }).join(' · ')}</p>
            )}
            {r.overdueOld > 0 && <p className="text-xs text-slate-600 mt-1">Ngoài ra {fmt(r.overdueOld)} lịch cũ hơn 30 ngày chưa có video.</p>}
          </div>
        </div>
      </div>

      {/* Theo sản phẩm */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-200 mb-1">Số KOC booking được theo sản phẩm</h3>
        <p className="text-xs text-slate-500 mb-3">
          Nhân sự chỉ ghi sản phẩm khi KOC đã chốt booking, nên bảng này chỉ tính KOC đã booking được. Một KOC nhận nhiều sản phẩm được tính cho từng sản phẩm, nên tổng các dòng có thể lớn hơn tổng ở trên.
          {noProductContacted > 0 && ' Còn ' + fmt(noProductContacted) + ' KOC đã liên hệ trong kỳ chưa chốt sản phẩm.'}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-xs border-b border-slate-700/50">
                <th className="text-left py-2 pr-3 font-medium">Sản phẩm</th>
                <th className="text-left px-3 font-medium w-56">Booking được</th>
                <th className="text-right px-3 font-medium">Hẹn lên video</th>
                <th className="text-right px-3 font-medium">Đã lên video</th>
                <th className="text-right pl-3 font-medium">Tỷ lệ lên</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {productRows.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-slate-500">Không có dữ liệu</td></tr>}
              {productRows.map(function(p) {
                return (
                  <tr key={p.name} className="hover:bg-slate-800/50">
                    <td className="py-2 pr-3 text-gray-200">{p.name}</td>
                    <td className="px-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-800 rounded overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: (maxBar > 0 ? p.booked / maxBar * 100 : 0) + '%' }} /></div>
                        <span className="text-emerald-400 font-medium w-12 text-right">{fmt(p.booked)}</span>
                      </div>
                    </td>
                    <td className="px-3 text-right text-violet-300">{fmt(p.scheduled)}</td>
                    <td className="px-3 text-right text-pink-300">{fmt(p.aired)}</td>
                    <td className="pl-3 text-right text-slate-400">{pct(p.aired, p.scheduled)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Theo nhân sự */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-200 mb-3">Theo nhân sự booking</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-xs border-b border-slate-700/50">
                <th className="text-left py-2 pr-3 font-medium">Nhân sự</th>
                <th className="text-right px-3 font-medium">Đã liên hệ</th>
                <th className="text-right px-3 font-medium">Booking được</th>
                <th className="text-right px-3 font-medium">Tỷ lệ</th>
                <th className="text-right px-3 font-medium">Hẹn lên video</th>
                <th className="text-right px-3 font-medium">Đã lên video</th>
                <th className="text-right pl-3 font-medium">Tỷ lệ lên</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {r.byStaff.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-slate-500">Không có dữ liệu</td></tr>}
              {r.byStaff.map(function(s) {
                return (
                  <tr key={s.name} className="hover:bg-slate-800/50">
                    <td className="py-2 pr-3 text-gray-200">{s.name}</td>
                    <td className="px-3 text-right text-slate-300">{fmt(s.contacted)}</td>
                    <td className="px-3 text-right text-emerald-400 font-medium">{fmt(s.booked)}</td>
                    <td className="px-3 text-right text-slate-400">{pct(s.booked, s.contacted)}</td>
                    <td className="px-3 text-right text-violet-300">{fmt(s.scheduled)}</td>
                    <td className="px-3 text-right text-pink-300">{fmt(s.aired)}</td>
                    <td className="pl-3 text-right text-slate-400">{pct(s.aired, s.scheduled)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-slate-500 space-y-1 pb-4">
        <p><span className="text-slate-400">Cách tính:</span> "Đã liên hệ" là KOC có trạng thái bất kỳ khác "chưa liên hệ" (theo ngày liên hệ trong bảng của từng nhân sự). "Booking được" là KOC đã xác nhận hợp tác trở lên (xác nhận, gửi sản phẩm, hẹn lịch, đã lên video). "Hẹn lên video" và "Đã lên video" lấy từ bảng Lịch ON AIR theo ngày hẹn.</p>
        <p>Tên sản phẩm do mỗi nhân sự ghi một kiểu (VDG, BTC, KMTL...) nên đã được gom về tên chuẩn; mục "Khác (chưa phân loại)" gồm các tên chưa nhận diện được.</p>
      </div>
    </div>
  );
}
