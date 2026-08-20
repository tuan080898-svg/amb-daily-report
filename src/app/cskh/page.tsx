'use client';
import { useState, useEffect, useMemo } from 'react';

interface CskhRecord {
  recordId: string;
  customerName: string;
  orderCode: string;
  phone: string;
  product: string;
  productType: string;
  initialStars: number;
  fixedStars: number;
  reason: string;
  badReviewReason: string;
  date: string;
  month: number;
  customerStatus: string;
  shop: string;
  shopManager: string;
  handler: string;
  processingResult: string;
  note: string;
  refundAmount: number;
  quantity: number;
}

function StarDisplay({ count }: { count: number }) {
  return (
    <span className="text-yellow-400">
      {'★'.repeat(Math.max(0, Math.min(5, count)))}
      {'☆'.repeat(Math.max(0, 5 - Math.min(5, count)))}
    </span>
  );
}

function ResultBadge({ result }: { result: string }) {
  if (!result) return <span className="text-slate-500 text-xs">—</span>;
  var color = 'bg-slate-700 text-slate-300';
  if (result.includes('Đã xử lý')) color = 'bg-emerald-900/50 text-emerald-400';
  else if (result.includes('Đang xử lý') || result.includes('Chờ sửa')) color = 'bg-yellow-900/50 text-yellow-400';
  else if (result.includes('Chưa xử lý')) color = 'bg-red-900/50 text-red-400';
  else if (result.includes('Không thể')) color = 'bg-slate-800 text-slate-400';
  return <span className={'px-2 py-0.5 rounded text-xs font-medium ' + color}>{result}</span>;
}

function StatusBadge({ status }: { status: string }) {
  if (!status) return <span className="text-slate-500 text-xs">—</span>;
  var color = 'text-slate-400';
  if (status.includes('sửa đánh giá')) color = 'text-emerald-400';
  else if (status.includes('không sửa') || status.includes('từ chối')) color = 'text-red-400';
  return <span className={'text-xs font-medium ' + color}>{status}</span>;
}

function HBar({ items, colorFn }: { items: { label: string; value: number }[]; colorFn?: (i: number) => string }) {
  if (items.length === 0) return <p className="text-slate-500 text-sm">Không có dữ liệu</p>;
  var max = Math.max(...items.map(function(d) { return d.value; }));
  var colors = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-violet-500', 'bg-cyan-500', 'bg-pink-500', 'bg-lime-500', 'bg-orange-500', 'bg-teal-500'];
  return (
    <div className="space-y-2">
      {items.map(function(d, i) {
        var pct = max > 0 ? (d.value / max) * 100 : 0;
        var c = colorFn ? colorFn(i) : colors[i % colors.length];
        return (
          <div key={d.label} className="flex items-center gap-2">
            <div className="w-28 text-xs text-slate-400 truncate text-right" title={d.label}>{d.label}</div>
            <div className="flex-1 h-5 bg-slate-800 rounded overflow-hidden">
              <div className={c + ' h-full rounded transition-all'} style={{ width: pct + '%' }} />
            </div>
            <div className="w-10 text-xs text-slate-300 text-right">{d.value}</div>
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({ items }: { items: { label: string; value: number; color: string }[] }) {
  var total = items.reduce(function(s, d) { return s + d.value; }, 0);
  if (total === 0) return <p className="text-slate-500 text-sm">Không có dữ liệu</p>;
  var R = 80, CX = 100, CY = 100, CIRC = 2 * Math.PI * R;
  var offset = 0;
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 200 200" width="160" height="160" style={{ transform: 'rotate(-90deg)', transformOrigin: '100px 100px' }}>
        {items.map(function(d, i) {
          var pct = d.value / total;
          var dash = pct * CIRC;
          var el = (
            <circle key={i} cx={CX} cy={CY} r={R} fill="none" stroke={d.color} strokeWidth="24"
              strokeDasharray={dash + ' ' + (CIRC - dash)} strokeDashoffset={-offset} />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <div className="space-y-1 text-xs">
        {items.map(function(d) {
          var pct = total > 0 ? Math.round(d.value / total * 100) : 0;
          return (
            <div key={d.label} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm inline-block flex-shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-slate-300 truncate max-w-[140px]" title={d.label}>{d.label}</span>
              <span className="text-slate-500">({d.value} - {pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CskhPage() {
  var [records, setRecords] = useState<CskhRecord[]>([]);
  var [loading, setLoading] = useState(true);
  var [error, setError] = useState('');
  var [activeTab, setActiveTab] = useState<'data' | 'dashboard'>('dashboard');
  var [filterDateFrom, setFilterDateFrom] = useState('');
  var [filterDateTo, setFilterDateTo] = useState('');
  var [filterShop, setFilterShop] = useState('');
  var [filterResult, setFilterResult] = useState('');
  var [filterReason, setFilterReason] = useState('');
  var [filterHandler, setFilterHandler] = useState('');
  var [search, setSearch] = useState('');
  var [page, setPage] = useState(0);
  var PAGE_SIZE = 50;

  useEffect(function() {
    fetchData();
  }, []);

  function fetchData() {
    setLoading(true);
    setError('');
    fetch('/api/lark-cskh')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data.error) { setError(data.error); return; }
        setRecords(data.records || []);
      })
      .catch(function(e) { setError(e.message); })
      .finally(function() { setLoading(false); });
  }

  var shops = useMemo(function() {
    var s = new Set<string>();
    records.forEach(function(r) { if (r.shop) s.add(r.shop); });
    return Array.from(s).sort();
  }, [records]);

  var reasons = useMemo(function() {
    var s = new Set<string>();
    records.forEach(function(r) {
      if (r.badReviewReason) r.badReviewReason.split(', ').forEach(function(x) { s.add(x); });
    });
    return Array.from(s).sort();
  }, [records]);

  var resultOptions = useMemo(function() {
    var s = new Set<string>();
    records.forEach(function(r) { if (r.processingResult) s.add(r.processingResult); });
    return Array.from(s).sort();
  }, [records]);

  var handlers = useMemo(function() {
    var s = new Set<string>();
    records.forEach(function(r) { if (r.handler) s.add(r.handler); });
    return Array.from(s).sort();
  }, [records]);

  var filtered = useMemo(function() {
    return records.filter(function(r) {
      if (filterDateFrom && r.date && r.date < filterDateFrom) return false;
      if (filterDateFrom && !r.date) return false;
      if (filterDateTo && r.date && r.date > filterDateTo) return false;
      if (filterDateTo && !r.date) return false;
      if (filterShop && r.shop !== filterShop) return false;
      if (filterResult === '__pending__') {
        if (r.processingResult !== 'Chưa xử lý' && r.processingResult !== 'Đang xử lý' && r.processingResult !== 'Chờ sửa') return false;
      } else if (filterResult && r.processingResult !== filterResult) return false;
      if (filterReason && !r.badReviewReason.includes(filterReason)) return false;
      if (filterHandler && r.handler !== filterHandler) return false;
      if (search) {
        var q = search.toLowerCase();
        if (!(r.customerName.toLowerCase().includes(q) || r.orderCode.toLowerCase().includes(q) ||
          r.product.toLowerCase().includes(q) || r.phone.includes(q))) return false;
      }
      return true;
    });
  }, [records, filterDateFrom, filterDateTo, filterShop, filterResult, filterReason, filterHandler, search]);

  var paged = useMemo(function() {
    return filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [filtered, page]);

  var totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  var stats = useMemo(function() {
    var total = filtered.length;
    var processed = filtered.filter(function(r) { return r.processingResult === 'Đã xử lý'; }).length;
    var fixed = filtered.filter(function(r) { return r.customerStatus.includes('sửa đánh giá'); }).length;
    var pending = filtered.filter(function(r) {
      return r.processingResult === 'Chưa xử lý' || r.processingResult === 'Đang xử lý' || r.processingResult === 'Chờ sửa';
    }).length;
    var totalRefund = filtered.reduce(function(s, r) { return s + r.refundAmount; }, 0);
    return { total, processed, fixed, pending, totalRefund };
  }, [filtered]);

  var shopBreakdown = useMemo(function() {
    var map = new Map<string, number>();
    filtered.forEach(function(r) { if (r.shop) map.set(r.shop, (map.get(r.shop) || 0) + 1); });
    return Array.from(map.entries())
      .map(function(e) { return { label: e[0], value: e[1] }; })
      .sort(function(a, b) { return b.value - a.value; })
      .slice(0, 10);
  }, [filtered]);

  var reasonBreakdown = useMemo(function() {
    var map = new Map<string, number>();
    filtered.forEach(function(r) {
      if (r.badReviewReason) {
        r.badReviewReason.split(', ').forEach(function(x) { map.set(x, (map.get(x) || 0) + 1); });
      }
    });
    var items = Array.from(map.entries())
      .map(function(e) { return { label: e[0], value: e[1] }; })
      .sort(function(a, b) { return b.value - a.value; })
      .slice(0, 8);
    var colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
    return items.map(function(d, i) { return { ...d, color: colors[i % colors.length] }; });
  }, [filtered]);

  var productBreakdown = useMemo(function() {
    var map = new Map<string, number>();
    filtered.forEach(function(r) {
      if (r.productType) {
        r.productType.split(', ').forEach(function(x) { map.set(x, (map.get(x) || 0) + 1); });
      }
    });
    return Array.from(map.entries())
      .map(function(e) { return { label: e[0], value: e[1] }; })
      .sort(function(a, b) { return b.value - a.value; })
      .slice(0, 10);
  }, [filtered]);

  var handlerBreakdown = useMemo(function() {
    var map = new Map<string, { total: number; fixed: number }>();
    filtered.forEach(function(r) {
      if (r.handler) {
        var cur = map.get(r.handler) || { total: 0, fixed: 0 };
        cur.total++;
        if (r.customerStatus.includes('sửa đánh giá')) cur.fixed++;
        map.set(r.handler, cur);
      }
    });
    return Array.from(map.entries())
      .map(function(e) { return { name: e[0], total: e[1].total, fixed: e[1].fixed, rate: e[1].total > 0 ? Math.round(e[1].fixed / e[1].total * 100) : 0 }; })
      .sort(function(a, b) { return b.total - a.total; });
  }, [filtered]);

  var monthlyTrend = useMemo(function() {
    var map = new Map<number, { total: number; fixed: number }>();
    filtered.forEach(function(r) {
      if (r.month) {
        var cur = map.get(r.month) || { total: 0, fixed: 0 };
        cur.total++;
        if (r.customerStatus.includes('sửa đánh giá')) cur.fixed++;
        map.set(r.month, cur);
      }
    });
    return Array.from(map.entries())
      .sort(function(a, b) { return a[0] - b[0]; })
      .map(function(e) { return { month: e[0], total: e[1].total, fixed: e[1].fixed }; });
  }, [filtered]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Đang tải dữ liệu từ Lark Base...</p>
          <p className="text-slate-600 text-sm mt-1">4,000+ bản ghi</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center bg-red-900/20 border border-red-800 rounded-lg p-6 max-w-md">
          <p className="text-red-400 font-medium mb-2">Lỗi kết nối Lark Base</p>
          <p className="text-red-300/70 text-sm mb-4">{error}</p>
          <button onClick={fetchData} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500 text-sm">Thử lại</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Chăm sóc khách hàng</h1>
          <p className="text-slate-400 text-sm mt-1">{records.length.toLocaleString()} đánh giá từ Lark Base</p>
        </div>
        <button onClick={fetchData} disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 text-sm flex items-center gap-2">
          <svg className={'w-4 h-4' + (loading ? ' animate-spin' : '')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Đồng bộ
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-4 bg-slate-800/50 p-1 rounded-lg w-fit">
        {[
          { key: 'dashboard' as const, label: 'Dashboard' },
          { key: 'data' as const, label: 'Dữ liệu' },
        ].map(function(tab) {
          return (
            <button key={tab.key} onClick={function() { setActiveTab(tab.key); setPage(0); }}
              className={'px-4 py-2 rounded-md text-sm font-medium transition-colors ' +
                (activeTab === tab.key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white')}>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="flex items-center gap-1">
          <input type="date" value={filterDateFrom}
            onChange={function(e) { setFilterDateFrom(e.target.value); setPage(0); }}
            className="bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-1.5" />
          <span className="text-slate-500 text-xs">đến</span>
          <input type="date" value={filterDateTo}
            onChange={function(e) { setFilterDateTo(e.target.value); setPage(0); }}
            className="bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-1.5" />
        </div>
        <select value={filterShop} onChange={function(e) { setFilterShop(e.target.value); setPage(0); }}
          className="bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-1.5">
          <option value="">Tất cả shop</option>
          {shops.map(function(s) { return <option key={s} value={s}>{s}</option>; })}
        </select>
        <select value={filterHandler} onChange={function(e) { setFilterHandler(e.target.value); setPage(0); }}
          className="bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-1.5">
          <option value="">Tất cả nhân sự</option>
          {handlers.map(function(h) { return <option key={h} value={h}>{h}</option>; })}
        </select>
        <select value={filterResult} onChange={function(e) { setFilterResult(e.target.value); setPage(0); }}
          className="bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-1.5">
          <option value="">Tất cả kết quả</option>
          <option value="__pending__">Tồn đọng (chưa/đang xử lý)</option>
          {resultOptions.map(function(r) { return <option key={r} value={r}>{r}</option>; })}
        </select>
        <select value={filterReason} onChange={function(e) { setFilterReason(e.target.value); setPage(0); }}
          className="bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-1.5">
          <option value="">Tất cả lý do</option>
          {reasons.map(function(r) { return <option key={r} value={r}>{r}</option>; })}
        </select>
        {activeTab === 'data' && (
          <input type="text" placeholder="Tìm khách / mã đơn / sản phẩm..."
            value={search} onChange={function(e) { setSearch(e.target.value); setPage(0); }}
            className="bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-1.5 w-64" />
        )}
        {(filterDateFrom || filterDateTo || filterShop || filterResult || filterReason || filterHandler || search) && (
          <button onClick={function() { setFilterDateFrom(''); setFilterDateTo(''); setFilterShop(''); setFilterResult(''); setFilterReason(''); setFilterHandler(''); setSearch(''); setPage(0); }}
            className="text-xs text-slate-400 hover:text-white px-2">Xoá bộ lọc</button>
        )}
        {filtered.length !== records.length && (
          <span className="text-xs text-slate-500 self-center ml-2">{filtered.length.toLocaleString()} / {records.length.toLocaleString()}</span>
        )}
      </div>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div onClick={function() { setFilterResult(''); setActiveTab('data'); setPage(0); }}
              className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50 cursor-pointer hover:border-slate-500 transition-colors">
              <p className="text-slate-400 text-xs mb-1">Tổng đánh giá xấu</p>
              <p className="text-2xl font-bold text-white">{stats.total.toLocaleString()}</p>
            </div>
            <div onClick={function() { setFilterResult('Đã xử lý'); setActiveTab('data'); setPage(0); }}
              className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50 cursor-pointer hover:border-emerald-500/50 transition-colors">
              <p className="text-slate-400 text-xs mb-1">Đã xử lý</p>
              <p className="text-2xl font-bold text-emerald-400">{stats.processed.toLocaleString()}</p>
              <p className="text-xs text-slate-500">{stats.total > 0 ? Math.round(stats.processed / stats.total * 100) : 0}%</p>
            </div>
            <div onClick={function() { setFilterResult(''); setActiveTab('data'); setPage(0); }}
              className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50 cursor-pointer hover:border-blue-500/50 transition-colors">
              <p className="text-slate-400 text-xs mb-1">Khách đã sửa sao</p>
              <p className="text-2xl font-bold text-blue-400">{stats.fixed.toLocaleString()}</p>
              <p className="text-xs text-slate-500">{stats.total > 0 ? Math.round(stats.fixed / stats.total * 100) : 0}% thành công</p>
            </div>
            <div onClick={function() { setFilterResult('__pending__'); setActiveTab('data'); setPage(0); }}
              className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50 cursor-pointer hover:border-amber-500/50 transition-colors">
              <p className="text-slate-400 text-xs mb-1">Tồn đọng</p>
              <p className="text-2xl font-bold text-amber-400">{stats.pending.toLocaleString()}</p>
              <p className="text-xs text-slate-500">Bấm để xem chi tiết</p>
            </div>
            <div onClick={function() { setFilterResult(''); setActiveTab('data'); setPage(0); }}
              className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50 cursor-pointer hover:border-rose-500/50 transition-colors">
              <p className="text-slate-400 text-xs mb-1">Tổng hoàn tiền</p>
              <p className="text-2xl font-bold text-rose-400">{stats.totalRefund > 0 ? (stats.totalRefund / 1000).toFixed(0) + 'K' : '0'}</p>
              <p className="text-xs text-slate-500">{stats.totalRefund.toLocaleString()}đ</p>
            </div>
          </div>

          {/* Charts Row 1 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/30">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Đánh giá xấu theo Shop</h3>
              <HBar items={shopBreakdown} />
            </div>
            <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/30">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Lý do đánh giá xấu</h3>
              <DonutChart items={reasonBreakdown} />
            </div>
          </div>

          {/* Charts Row 2 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/30">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Top sản phẩm bị review xấu</h3>
              <HBar items={productBreakdown} colorFn={function() { return 'bg-rose-500'; }} />
            </div>
            <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/30">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Nhân viên xử lý</h3>
              {handlerBreakdown.length > 0 ? (
                <div className="space-y-2">
                  {handlerBreakdown.map(function(h) {
                    return (
                      <div key={h.name} className="flex items-center gap-2">
                        <div className="w-24 text-xs text-slate-400 truncate text-right">{h.name}</div>
                        <div className="flex-1 h-5 bg-slate-800 rounded overflow-hidden flex">
                          <div className="bg-emerald-600 h-full" style={{ width: (h.total > 0 ? h.fixed / h.total * 100 : 0) + '%' }} />
                          <div className="bg-slate-600 h-full flex-1" />
                        </div>
                        <div className="w-20 text-xs text-slate-300 text-right">{h.fixed}/{h.total} ({h.rate}%)</div>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                    <span className="w-3 h-3 bg-emerald-600 rounded-sm inline-block" /> Đã sửa sao
                    <span className="w-3 h-3 bg-slate-600 rounded-sm inline-block ml-2" /> Chưa sửa
                  </div>
                </div>
              ) : <p className="text-slate-500 text-sm">Không có dữ liệu</p>}
            </div>
          </div>

          {/* Monthly Trend */}
          {monthlyTrend.length > 1 && (
            <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/30">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Xu hướng theo tháng</h3>
              <div className="flex items-end gap-2 h-32">
                {(function() {
                  var maxVal = Math.max(...monthlyTrend.map(function(d) { return d.total; }));
                  return monthlyTrend.map(function(d) {
                    var h = maxVal > 0 ? (d.total / maxVal) * 100 : 0;
                    var fixedH = maxVal > 0 ? (d.fixed / maxVal) * 100 : 0;
                    return (
                      <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
                        <div className="text-xs text-slate-400">{d.total}</div>
                        <div className="w-full flex flex-col justify-end" style={{ height: '80px' }}>
                          <div className="w-full bg-blue-600/30 rounded-t relative" style={{ height: h + '%' }}>
                            <div className="absolute bottom-0 w-full bg-emerald-500/60 rounded-t" style={{ height: (d.total > 0 ? fixedH / h * 100 : 0) + '%' }} />
                          </div>
                        </div>
                        <div className="text-xs text-slate-500">T{d.month}</div>
                      </div>
                    );
                  });
                })()}
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500 mt-2 justify-center">
                <span><span className="inline-block w-3 h-3 bg-blue-600/30 rounded-sm mr-1" /> Tổng review xấu</span>
                <span><span className="inline-block w-3 h-3 bg-emerald-500/60 rounded-sm mr-1" /> Đã sửa sao</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Data Tab */}
      {activeTab === 'data' && (
        <div>
          <div className="overflow-x-auto rounded-lg border border-slate-700/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800/80 text-slate-400 text-xs">
                  <th className="px-3 py-2 text-left">Ngày</th>
                  <th className="px-3 py-2 text-left">Shop</th>
                  <th className="px-3 py-2 text-left">Khách hàng</th>
                  <th className="px-3 py-2 text-left">SĐT</th>
                  <th className="px-3 py-2 text-left">Sản phẩm</th>
                  <th className="px-3 py-2 text-center">Sao</th>
                  <th className="px-3 py-2 text-left">Lý do</th>
                  <th className="px-3 py-2 text-left">Kết quả</th>
                  <th className="px-3 py-2 text-left">Trạng thái</th>
                  <th className="px-3 py-2 text-left">NV xử lý</th>
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-8 text-slate-500">Không có dữ liệu</td></tr>
                ) : paged.map(function(r, i) {
                  return (
                    <tr key={r.recordId + '-' + i} className="border-t border-slate-800 hover:bg-slate-800/40">
                      <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{r.date}</td>
                      <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{r.shop}</td>
                      <td className="px-3 py-2 text-white max-w-[120px] truncate" title={r.customerName}>{r.customerName}</td>
                      <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{r.phone}</td>
                      <td className="px-3 py-2 text-slate-300 max-w-[150px] truncate" title={r.product}>{r.product}</td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        <StarDisplay count={r.initialStars} />
                        {r.fixedStars > 0 && <span className="text-slate-500 mx-1">&rarr;</span>}
                        {r.fixedStars > 0 && <StarDisplay count={r.fixedStars} />}
                      </td>
                      <td className="px-3 py-2 text-slate-400 max-w-[150px] truncate" title={r.badReviewReason}>{r.badReviewReason}</td>
                      <td className="px-3 py-2"><ResultBadge result={r.processingResult} /></td>
                      <td className="px-3 py-2"><StatusBadge status={r.customerStatus} /></td>
                      <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{r.handler}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-slate-500">
                Trang {page + 1}/{totalPages} — {filtered.length.toLocaleString()} bản ghi
              </p>
              <div className="flex gap-1">
                <button onClick={function() { setPage(Math.max(0, page - 1)); }} disabled={page === 0}
                  className="px-3 py-1 bg-slate-800 text-slate-300 rounded text-xs hover:bg-slate-700 disabled:opacity-30">Trước</button>
                <button onClick={function() { setPage(Math.min(totalPages - 1, page + 1)); }} disabled={page >= totalPages - 1}
                  className="px-3 py-1 bg-slate-800 text-slate-300 rounded text-xs hover:bg-slate-700 disabled:opacity-30">Sau</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
