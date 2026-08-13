'use client';

import { useState, useMemo } from 'react';
import { useAppState } from '@/lib/store';
import { toDateString } from '@/lib/utils';
import { CskhReview, CskhIssue } from '@/lib/types';

const REVIEW_STATUSES = ['Đã xử lý', 'Đang chờ KH phản hồi', 'Không liên hệ được'];
const REVIEW_RESULTS = ['Đã sửa lên 4-5 sao', 'Giữ nguyên', 'Từ chối sửa'];
const REVIEW_METHODS = ['Nhắn tin', 'Gọi điện', 'Tặng quà', 'Hoàn tiền', 'Đổi hàng', 'Khác'];
const ISSUE_STATUSES = ['Đã xong', 'Đang xử lý', 'Tồn đọng'];
const ISSUE_URGENCIES = ['Thấp', 'Trung bình', 'Cao'];

function getQuickDates() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    today: toDateString(today),
    yesterday: toDateString(yesterday),
    sevenDaysAgo: toDateString(sevenDaysAgo),
    monthStart: toDateString(monthStart),
  };
}

function StarDisplay({ stars }: { stars: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map(function(i) {
        return (
          <span key={i} className={i <= stars ? 'text-yellow-400' : 'text-gray-600'}>
            ★
          </span>
        );
      })}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  let cls = 'bg-gray-700 text-gray-300';
  if (status === 'Đã xử lý' || status === 'Đã xong') cls = 'bg-emerald-500/20 text-emerald-400';
  else if (status === 'Đang chờ KH phản hồi' || status === 'Đang xử lý') cls = 'bg-amber-500/20 text-amber-400';
  else if (status === 'Không liên hệ được' || status === 'Tồn đọng') cls = 'bg-red-500/20 text-red-400';
  return <span className={'px-2 py-0.5 rounded-full text-xs font-medium ' + cls}>{status}</span>;
}

function UrgencyBadge({ urgency }: { urgency: string }) {
  let cls = 'bg-gray-700 text-gray-300';
  if (urgency === 'Cao') cls = 'bg-red-500/20 text-red-400';
  else if (urgency === 'Trung bình') cls = 'bg-amber-500/20 text-amber-400';
  else if (urgency === 'Thấp') cls = 'bg-emerald-500/20 text-emerald-400';
  return <span className={'px-2 py-0.5 rounded-full text-xs font-medium ' + cls}>{urgency}</span>;
}

function ResultBadge({ result }: { result: string }) {
  let cls = 'bg-gray-700 text-gray-300';
  if (result === 'Đã sửa lên 4-5 sao') cls = 'bg-emerald-500/20 text-emerald-400';
  else if (result === 'Giữ nguyên') cls = 'bg-amber-500/20 text-amber-400';
  else if (result === 'Từ chối sửa') cls = 'bg-red-500/20 text-red-400';
  return result ? <span className={'px-2 py-0.5 rounded-full text-xs font-medium ' + cls}>{result}</span> : null;
}

export default function CskhDashboardPage() {
  const { currentUser, shops, users, cskhReviews, cskhIssues, getUserShops, updateCskhReview, updateCskhIssue } = useAppState();

  const quickDates = getQuickDates();
  const [dateFrom, setDateFrom] = useState(quickDates.today);
  const [dateTo, setDateTo] = useState(quickDates.today);
  const [shopFilter, setShopFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'reviews' | 'issues'>('reviews');
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);

  // Edit state for inline updates
  const [editReviewStatus, setEditReviewStatus] = useState('');
  const [editReviewResult, setEditReviewResult] = useState('');
  const [editReviewMethod, setEditReviewMethod] = useState('');
  const [editReviewNote, setEditReviewNote] = useState('');
  const [editIssueStatus, setEditIssueStatus] = useState('');
  const [editIssueUrgency, setEditIssueUrgency] = useState('');
  const [editIssueResolution, setEditIssueResolution] = useState('');
  const [editIssueIntervention, setEditIssueIntervention] = useState(false);
  const [editIssueInterventionNote, setEditIssueInterventionNote] = useState('');

  const userShops = useMemo(function() {
    if (!currentUser) return [];
    return getUserShops(currentUser.id);
  }, [currentUser, getUserShops]);

  const employees = useMemo(function() {
    return users.filter(function(u) { return u.role === 'employee'; });
  }, [users]);

  const shopMap = useMemo(function() {
    const m: Record<string, string> = {};
    shops.forEach(function(s) { m[s.id] = s.name; });
    return m;
  }, [shops]);

  const userMap = useMemo(function() {
    const m: Record<string, string> = {};
    users.forEach(function(u) { m[u.id] = u.name; });
    return m;
  }, [users]);

  const userShopIds = useMemo(function() {
    return new Set(userShops.map(function(s) { return s.id; }));
  }, [userShops]);

  // Filter reviews
  const filteredReviews = useMemo(function() {
    return cskhReviews.filter(function(r) {
      if (!userShopIds.has(r.shopId)) return false;
      if (r.date < dateFrom || r.date > dateTo) return false;
      if (shopFilter !== 'all' && r.shopId !== shopFilter) return false;
      if (employeeFilter !== 'all' && r.reporterId !== employeeFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      return true;
    });
  }, [cskhReviews, userShopIds, dateFrom, dateTo, shopFilter, employeeFilter, statusFilter]);

  // Filter issues
  const filteredIssues = useMemo(function() {
    return cskhIssues.filter(function(r) {
      if (!userShopIds.has(r.shopId)) return false;
      if (r.date < dateFrom || r.date > dateTo) return false;
      if (shopFilter !== 'all' && r.shopId !== shopFilter) return false;
      if (employeeFilter !== 'all' && r.reporterId !== employeeFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      return true;
    });
  }, [cskhIssues, userShopIds, dateFrom, dateTo, shopFilter, employeeFilter, statusFilter]);

  // Urgent cases: intervention needed + not done, across ALL dates
  const urgentCases = useMemo(function() {
    return cskhIssues.filter(function(i) {
      return i.needsIntervention && i.status !== 'Đã xong' && userShopIds.has(i.shopId);
    });
  }, [cskhIssues, userShopIds]);

  // Stats for today (based on filter date range)
  const stats = useMemo(function() {
    const todayReviews = filteredReviews;
    const todayIssues = filteredIssues;
    const totalBadReviews = todayReviews.length;
    const doneReviews = todayReviews.filter(function(r) { return r.status === 'Đã xử lý'; }).length;
    const fixedReviews = todayReviews.filter(function(r) { return r.result === 'Đã sửa lên 4-5 sao'; }).length;
    const successRate = doneReviews > 0 ? Math.round((fixedReviews / doneReviews) * 100) : 0;
    const totalIssues = todayIssues.length;
    // Backlog: across ALL dates, not just filtered
    const backlog = cskhIssues.filter(function(i) {
      return userShopIds.has(i.shopId) && (i.status === 'Tồn đọng' || i.status === 'Đang xử lý');
    }).length + cskhReviews.filter(function(r) {
      return userShopIds.has(r.shopId) && r.status === 'Đang chờ KH phản hồi';
    }).length;
    return { totalBadReviews, doneReviews, fixedReviews, successRate, totalIssues, backlog };
  }, [filteredReviews, filteredIssues, cskhIssues, cskhReviews, userShopIds]);

  function handleQuickDate(from: string, to: string) {
    setDateFrom(from);
    setDateTo(to);
  }

  function startEditReview(r: CskhReview) {
    setEditingReviewId(r.id);
    setEditReviewStatus(r.status);
    setEditReviewResult(r.result);
    setEditReviewMethod(r.resolutionMethod);
    setEditReviewNote(r.note);
  }

  function saveEditReview(r: CskhReview) {
    updateCskhReview({
      ...r,
      status: editReviewStatus,
      result: editReviewResult,
      resolutionMethod: editReviewMethod,
      note: editReviewNote,
    });
    setEditingReviewId(null);
  }

  function startEditIssue(i: CskhIssue) {
    setEditingIssueId(i.id);
    setEditIssueStatus(i.status);
    setEditIssueUrgency(i.urgency);
    setEditIssueResolution(i.resolution);
    setEditIssueIntervention(i.needsIntervention);
    setEditIssueInterventionNote(i.interventionNote);
  }

  function saveEditIssue(i: CskhIssue) {
    updateCskhIssue({
      ...i,
      status: editIssueStatus,
      urgency: editIssueUrgency,
      resolution: editIssueResolution,
      needsIntervention: editIssueIntervention,
      interventionNote: editIssueInterventionNote,
    });
    setEditingIssueId(null);
  }

  if (!currentUser) return null;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-100">CSKH Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Theo dõi đánh giá xấu & vấn đề phát sinh CSKH</p>
      </div>

      {/* Urgent Cases */}
      {urgentCases.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Case cần can thiệp ({urgentCases.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {urgentCases.map(function(c) {
              return (
                <div key={c.id} className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-red-300">{c.orderCode}</span>
                    <UrgencyBadge urgency={c.urgency} />
                  </div>
                  <p className="text-sm text-gray-300 font-medium mb-1">{shopMap[c.shopId] || c.shopId}</p>
                  <p className="text-xs text-gray-400 mb-2">{c.issueType}</p>
                  <p className="text-xs text-gray-400 line-clamp-2">{c.description}</p>
                  {c.interventionNote && (
                    <p className="text-xs text-orange-400 mt-2 italic">{c.interventionNote}</p>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <StatusBadge status={c.status} />
                    <span className="text-xs text-gray-500">{c.date}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Đánh giá xấu</p>
          <p className="text-2xl font-bold text-gray-100">{stats.totalBadReviews}</p>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Đã xử lý xong</p>
          <p className="text-2xl font-bold text-emerald-400">{stats.doneReviews}</p>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Sửa lên 4-5 sao</p>
          <p className="text-2xl font-bold text-blue-400">{stats.fixedReviews} <span className="text-sm text-gray-500">({stats.successRate}%)</span></p>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Vấn đề phát sinh</p>
          <p className="text-2xl font-bold text-gray-100">{stats.totalIssues}</p>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 col-span-2 md:col-span-1">
          <p className="text-xs text-gray-500 mb-1">Case tồn đọng</p>
          <p className="text-2xl font-bold text-red-400">{stats.backlog}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="flex gap-2">
            <button onClick={function() { handleQuickDate(quickDates.today, quickDates.today); }} className={'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ' + (dateFrom === quickDates.today && dateTo === quickDates.today ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-gray-400 hover:bg-slate-700')}>Hôm nay</button>
            <button onClick={function() { handleQuickDate(quickDates.yesterday, quickDates.yesterday); }} className={'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ' + (dateFrom === quickDates.yesterday && dateTo === quickDates.yesterday ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-gray-400 hover:bg-slate-700')}>Hôm qua</button>
            <button onClick={function() { handleQuickDate(quickDates.sevenDaysAgo, quickDates.today); }} className={'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ' + (dateFrom === quickDates.sevenDaysAgo && dateTo === quickDates.today ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-gray-400 hover:bg-slate-700')}>7 ngày</button>
            <button onClick={function() { handleQuickDate(quickDates.monthStart, quickDates.today); }} className={'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ' + (dateFrom === quickDates.monthStart && dateTo === quickDates.today ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-gray-400 hover:bg-slate-700')}>Tháng này</button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Từ ngày</label>
            <input type="date" value={dateFrom} onChange={function(e) { setDateFrom(e.target.value); }} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-gray-200" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Đến ngày</label>
            <input type="date" value={dateTo} onChange={function(e) { setDateTo(e.target.value); }} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-gray-200" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Shop</label>
            <select value={shopFilter} onChange={function(e) { setShopFilter(e.target.value); }} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-gray-200">
              <option value="all">Tất cả shop</option>
              {userShops.map(function(s) {
                return <option key={s.id} value={s.id}>{s.name}</option>;
              })}
            </select>
          </div>
          {currentUser.role === 'admin' && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Nhân viên</label>
              <select value={employeeFilter} onChange={function(e) { setEmployeeFilter(e.target.value); }} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-gray-200">
                <option value="all">Tất cả</option>
                {employees.map(function(emp) {
                  return <option key={emp.id} value={emp.id}>{emp.name}</option>;
                })}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500 block mb-1">Trạng thái</label>
            <select value={statusFilter} onChange={function(e) { setStatusFilter(e.target.value); }} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-gray-200">
              <option value="all">Tất cả</option>
              {activeTab === 'reviews'
                ? REVIEW_STATUSES.map(function(s) { return <option key={s} value={s}>{s}</option>; })
                : ISSUE_STATUSES.map(function(s) { return <option key={s} value={s}>{s}</option>; })
              }
            </select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        <button onClick={function() { setActiveTab('reviews'); setStatusFilter('all'); }} className={'px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ' + (activeTab === 'reviews' ? 'bg-slate-900 text-blue-400 border border-slate-700/50 border-b-0' : 'bg-slate-800/50 text-gray-400 hover:text-gray-300')}>
          Đánh giá xấu ({filteredReviews.length})
        </button>
        <button onClick={function() { setActiveTab('issues'); setStatusFilter('all'); }} className={'px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ' + (activeTab === 'issues' ? 'bg-slate-900 text-blue-400 border border-slate-700/50 border-b-0' : 'bg-slate-800/50 text-gray-400 hover:text-gray-300')}>
          Vấn đề phát sinh ({filteredIssues.length})
        </button>
      </div>

      {/* Tab Content */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl rounded-tl-none overflow-hidden">
        {activeTab === 'reviews' && (
          <div className="overflow-x-auto">
            {filteredReviews.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">Không có đánh giá xấu trong khoảng thời gian này</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Ngày</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Shop</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Mã đơn</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Sao</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Nội dung</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Cách xử lý</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Trạng thái</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Kết quả</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Người báo</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReviews.map(function(r) {
                    const isEditing = editingReviewId === r.id;
                    return (
                      <tr key={r.id} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{r.date}</td>
                        <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{shopMap[r.shopId] || r.shopId}</td>
                        <td className="px-4 py-3 text-gray-300 font-mono text-xs">{r.orderCode}</td>
                        <td className="px-4 py-3"><StarDisplay stars={r.initialStars} /></td>
                        <td className="px-4 py-3 text-gray-400 max-w-[200px] truncate" title={r.reviewContent}>{r.reviewContent}</td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <select value={editReviewMethod} onChange={function(e) { setEditReviewMethod(e.target.value); }} className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-gray-200 w-24">
                              {REVIEW_METHODS.map(function(m) { return <option key={m} value={m}>{m}</option>; })}
                            </select>
                          ) : (
                            <span className="text-gray-400 text-xs">{r.resolutionMethod}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <select value={editReviewStatus} onChange={function(e) { setEditReviewStatus(e.target.value); }} className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-gray-200 w-full">
                              {REVIEW_STATUSES.map(function(s) { return <option key={s} value={s}>{s}</option>; })}
                            </select>
                          ) : (
                            <StatusBadge status={r.status} />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <select value={editReviewResult} onChange={function(e) { setEditReviewResult(e.target.value); }} className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-gray-200 w-full">
                              <option value="">--</option>
                              {REVIEW_RESULTS.map(function(s) { return <option key={s} value={s}>{s}</option>; })}
                            </select>
                          ) : (
                            <ResultBadge result={r.result} />
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{userMap[r.reporterId] || r.reporterId}</td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <div className="flex gap-1">
                              <button onClick={function() { saveEditReview(r); }} className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs hover:bg-emerald-500/30">Lưu</button>
                              <button onClick={function() { setEditingReviewId(null); }} className="px-2 py-1 bg-slate-700 text-gray-400 rounded text-xs hover:bg-slate-600">Huỷ</button>
                            </div>
                          ) : (
                            <button onClick={function() { startEditReview(r); }} className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs hover:bg-blue-500/30">Cập nhật</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'issues' && (
          <div className="overflow-x-auto">
            {filteredIssues.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">Không có vấn đề phát sinh trong khoảng thời gian này</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Ngày</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Shop</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Mã đơn</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Loại</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Mô tả</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Độ khẩn</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Trạng thái</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Can thiệp</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Người báo</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIssues.map(function(issue) {
                    const isEditing = editingIssueId === issue.id;
                    return (
                      <tr key={issue.id} className={'border-b border-slate-800 hover:bg-slate-800/50 transition-colors' + (issue.needsIntervention && issue.status !== 'Đã xong' ? ' bg-red-500/5' : '')}>
                        <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{issue.date}</td>
                        <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{shopMap[issue.shopId] || issue.shopId}</td>
                        <td className="px-4 py-3 text-gray-300 font-mono text-xs">{issue.orderCode}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{issue.issueType}</td>
                        <td className="px-4 py-3 text-gray-400 max-w-[200px] truncate" title={issue.description}>{issue.description}</td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <select value={editIssueUrgency} onChange={function(e) { setEditIssueUrgency(e.target.value); }} className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-gray-200">
                              {ISSUE_URGENCIES.map(function(u) { return <option key={u} value={u}>{u}</option>; })}
                            </select>
                          ) : (
                            <UrgencyBadge urgency={issue.urgency} />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <select value={editIssueStatus} onChange={function(e) { setEditIssueStatus(e.target.value); }} className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-gray-200">
                              {ISSUE_STATUSES.map(function(s) { return <option key={s} value={s}>{s}</option>; })}
                            </select>
                          ) : (
                            <StatusBadge status={issue.status} />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <label className="flex items-center gap-1 text-xs text-gray-300">
                              <input type="checkbox" checked={editIssueIntervention} onChange={function(e) { setEditIssueIntervention(e.target.checked); }} className="rounded" />
                              Cần
                            </label>
                          ) : (
                            issue.needsIntervention ? <span className="text-xs text-red-400 font-medium">Cần can thiệp</span> : <span className="text-xs text-gray-500">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{userMap[issue.reporterId] || issue.reporterId}</td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <div className="flex gap-1">
                              <button onClick={function() { saveEditIssue(issue); }} className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs hover:bg-emerald-500/30">Lưu</button>
                              <button onClick={function() { setEditingIssueId(null); }} className="px-2 py-1 bg-slate-700 text-gray-400 rounded text-xs hover:bg-slate-600">Huỷ</button>
                            </div>
                          ) : (
                            <button onClick={function() { startEditIssue(issue); }} className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs hover:bg-blue-500/30">Cập nhật</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
