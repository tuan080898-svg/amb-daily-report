'use client';

import { useState, useMemo } from 'react';
import { useAppState } from '@/lib/store';
import { ChecklistTask, ChecklistEntry } from '@/lib/types';

const DEFAULT_TASKS: ChecklistTask[] = [
  { id: 'cl-1', title: 'Kiểm tra & xác nhận đơn hàng mới', description: 'Vào Seller Center kiểm tra đơn mới, xác nhận và xử lý kịp thời', category: 'Đơn hàng', deadline: '09:00', priority: 'high', isActive: true, order: 1 },
  { id: 'cl-2', title: 'Xử lý đơn hủy / hoàn hàng', description: 'Kiểm tra đơn hủy, đơn hoàn, liên hệ khách nếu cần', category: 'Đơn hàng', deadline: '10:00', priority: 'high', isActive: true, order: 2 },
  { id: 'cl-3', title: 'In phiếu gửi & đóng gói hàng', description: 'In vận đơn, đóng gói hàng và bàn giao cho đơn vị vận chuyển', category: 'Đơn hàng', deadline: '11:00', priority: 'high', isActive: true, order: 3 },
  { id: 'cl-4', title: 'Trả lời chat khách hàng', description: 'Phản hồi tin nhắn trên Shopee Chat, đảm bảo tỷ lệ phản hồi > 90%', category: 'CSKH', deadline: '12:00', priority: 'high', isActive: true, order: 4 },
  { id: 'cl-5', title: 'Cập nhật tồn kho sản phẩm', description: 'Đồng bộ số lượng tồn kho thực tế lên Seller Center', category: 'Kho hàng', deadline: '14:00', priority: 'medium', isActive: true, order: 5 },
  { id: 'cl-6', title: 'Kiểm tra & phản hồi đánh giá mới', description: 'Phản hồi đánh giá 1-3 sao, cảm ơn đánh giá 4-5 sao', category: 'CSKH', deadline: '15:00', priority: 'medium', isActive: true, order: 6 },
  { id: 'cl-7', title: 'Kiểm tra hiệu quả quảng cáo', description: 'Review chiến dịch ads, tắt/điều chỉnh ads kém hiệu quả', category: 'Marketing', deadline: '16:00', priority: 'medium', isActive: true, order: 7 },
  { id: 'cl-8', title: 'Kiểm tra voucher & khuyến mãi', description: 'Đảm bảo voucher/flash sale/combo đang hoạt động đúng', category: 'Marketing', deadline: '16:30', priority: 'low', isActive: true, order: 8 },
  { id: 'cl-9', title: 'Upload file đơn hàng lên hệ thống', description: 'Export file đơn hàng từ Seller Center và upload lên hệ thống báo cáo', category: 'Báo cáo', deadline: '17:00', priority: 'medium', isActive: true, order: 9 },
  { id: 'cl-10', title: 'Báo cáo doanh số cuối ngày', description: 'Tổng hợp doanh số, số đơn, vấn đề phát sinh trong ngày', category: 'Báo cáo', deadline: '17:30', priority: 'high', isActive: true, order: 10 },
];

var CATEGORIES = ['Đơn hàng', 'CSKH', 'Kho hàng', 'Marketing', 'Báo cáo'];
var CAT_COLORS: Record<string, string> = {
  'Đơn hàng': 'bg-blue-500/15 text-blue-400',
  'CSKH': 'bg-emerald-500/15 text-emerald-400',
  'Kho hàng': 'bg-amber-500/15 text-amber-400',
  'Marketing': 'bg-pink-500/15 text-pink-400',
  'Báo cáo': 'bg-violet-500/15 text-violet-400',
};
var PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-400',
  medium: 'text-yellow-400',
  low: 'text-gray-400',
};
var PRIORITY_LABELS: Record<string, string> = {
  high: 'Cao',
  medium: 'TB',
  low: 'Thấp',
};

function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function nowTimeStr() {
  var d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

export default function ChecklistPage() {
  var { currentUser, users, checklistTasks, checklistEntries, saveChecklistTasks, saveChecklistEntries } = useAppState();
  var isAdmin = currentUser?.role === 'admin';

  var [activeTab, setActiveTab] = useState<'today' | 'manage' | 'overview'>('today');
  var [selectedDate, setSelectedDate] = useState(todayStr());
  var [showAddTask, setShowAddTask] = useState(false);
  var [editTask, setEditTask] = useState<ChecklistTask | null>(null);
  var [newTitle, setNewTitle] = useState('');
  var [newDesc, setNewDesc] = useState('');
  var [newCategory, setNewCategory] = useState('Đơn hàng');
  var [newDeadline, setNewDeadline] = useState('17:00');
  var [newPriority, setNewPriority] = useState<'high' | 'medium' | 'low'>('medium');

  var tasks = checklistTasks.length > 0 ? checklistTasks.filter(function(t) { return t.isActive; }).sort(function(a, b) { return a.order - b.order; }) : DEFAULT_TASKS;
  var allTasks = checklistTasks.length > 0 ? checklistTasks : DEFAULT_TASKS;

  var todayEntries = useMemo(function() {
    return checklistEntries.filter(function(e) { return e.date === selectedDate && e.userId === currentUser?.id; });
  }, [checklistEntries, selectedDate, currentUser]);

  function isTaskCompleted(taskId: string) {
    return todayEntries.some(function(e) { return e.taskId === taskId && e.completed; });
  }

  function getEntryNote(taskId: string) {
    var entry = todayEntries.find(function(e) { return e.taskId === taskId; });
    return entry ? entry.note : '';
  }

  function toggleTask(taskId: string) {
    var completed = isTaskCompleted(taskId);
    var existing = checklistEntries.filter(function(e) {
      return !(e.date === selectedDate && e.taskId === taskId && e.userId === currentUser?.id);
    });
    if (!completed) {
      existing.push({
        date: selectedDate,
        taskId: taskId,
        userId: currentUser?.id || '',
        completed: true,
        completedAt: new Date().toISOString(),
        note: '',
      });
    }
    saveChecklistEntries(existing);
  }

  function saveNote(taskId: string, note: string) {
    var updated = checklistEntries.map(function(e) {
      if (e.date === selectedDate && e.taskId === taskId && e.userId === currentUser?.id) {
        return { ...e, note: note };
      }
      return e;
    });
    var has = updated.some(function(e) { return e.date === selectedDate && e.taskId === taskId && e.userId === currentUser?.id; });
    if (!has) {
      updated.push({
        date: selectedDate,
        taskId: taskId,
        userId: currentUser?.id || '',
        completed: false,
        completedAt: '',
        note: note,
      });
    }
    saveChecklistEntries(updated);
  }

  var completedCount = tasks.filter(function(t) { return isTaskCompleted(t.id); }).length;
  var totalCount = tasks.length;
  var pctDone = totalCount > 0 ? Math.round(completedCount / totalCount * 100) : 0;

  function isOverdue(deadline: string) {
    if (selectedDate !== todayStr()) return false;
    return nowTimeStr() > deadline && !isTaskCompleted('');
  }

  function handleInitTasks() {
    saveChecklistTasks(DEFAULT_TASKS);
  }

  function handleSaveTask() {
    if (!newTitle.trim()) return;
    var taskList = [...allTasks];
    if (editTask) {
      taskList = taskList.map(function(t) {
        if (t.id !== editTask.id) return t;
        return { ...t, title: newTitle, description: newDesc, category: newCategory, deadline: newDeadline, priority: newPriority };
      });
    } else {
      taskList.push({
        id: 'cl-' + Date.now(),
        title: newTitle,
        description: newDesc,
        category: newCategory,
        deadline: newDeadline,
        priority: newPriority,
        isActive: true,
        order: taskList.length + 1,
      });
    }
    saveChecklistTasks(taskList);
    setShowAddTask(false);
    setEditTask(null);
    setNewTitle('');
    setNewDesc('');
    setNewCategory('Đơn hàng');
    setNewDeadline('17:00');
    setNewPriority('medium');
  }

  function handleEditTask(t: ChecklistTask) {
    setEditTask(t);
    setNewTitle(t.title);
    setNewDesc(t.description);
    setNewCategory(t.category);
    setNewDeadline(t.deadline);
    setNewPriority(t.priority);
    setShowAddTask(true);
  }

  function handleToggleActive(taskId: string) {
    var updated = allTasks.map(function(t) {
      if (t.id !== taskId) return t;
      return { ...t, isActive: !t.isActive };
    });
    saveChecklistTasks(updated);
  }

  function handleDeleteTask(taskId: string) {
    if (!confirm('Xóa task này?')) return;
    saveChecklistTasks(allTasks.filter(function(t) { return t.id !== taskId; }));
  }

  var employees = users.filter(function(u) { return u.role === 'employee'; });

  var overviewData = useMemo(function() {
    return employees.map(function(emp) {
      var empEntries = checklistEntries.filter(function(e) { return e.date === selectedDate && e.userId === emp.id && e.completed; });
      var done = tasks.filter(function(t) { return empEntries.some(function(e) { return e.taskId === t.id; }); }).length;
      return { user: emp, done: done, total: totalCount };
    });
  }, [employees, checklistEntries, selectedDate, tasks, totalCount]);

  if (!currentUser) return null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-100">Checklist vận hành Shopee</h1>
        <p className="text-sm text-gray-500 mt-1">Công việc hàng ngày cần hoàn thành</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input type="date" value={selectedDate} onChange={function(e) { setSelectedDate(e.target.value); }}
          className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-200" />
        <button onClick={function() { setSelectedDate(todayStr()); }}
          className={'px-3 py-2 text-sm rounded-lg transition-colors ' + (selectedDate === todayStr() ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-gray-400 hover:text-gray-200')}>
          Hôm nay</button>

        {checklistTasks.length === 0 && isAdmin && (
          <button onClick={handleInitTasks}
            className="px-3 py-2 text-sm bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors">
            Khởi tạo checklist mẫu</button>
        )}
      </div>

      <div className="flex gap-1 border-b border-slate-700/50">
        <button onClick={function() { setActiveTab('today'); }}
          className={'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ' + (activeTab === 'today' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300')}>
          Checklist ({completedCount}/{totalCount})</button>
        {isAdmin && (
          <>
            <button onClick={function() { setActiveTab('overview'); }}
              className={'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ' + (activeTab === 'overview' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300')}>
              Tổng quan nhân sự</button>
            <button onClick={function() { setActiveTab('manage'); }}
              className={'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ' + (activeTab === 'manage' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300')}>
              Quản lý task</button>
          </>
        )}
      </div>

      {/* Progress bar */}
      {activeTab === 'today' && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-300">Tiến độ: {completedCount}/{totalCount} task</span>
            <span className={'text-sm font-semibold ' + (pctDone === 100 ? 'text-emerald-400' : pctDone >= 50 ? 'text-yellow-400' : 'text-red-400')}>{pctDone}%</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2.5">
            <div className={'h-2.5 rounded-full transition-all duration-500 ' + (pctDone === 100 ? 'bg-emerald-500' : pctDone >= 50 ? 'bg-yellow-500' : 'bg-red-500')}
              style={{ width: pctDone + '%' }} />
          </div>
        </div>
      )}

      {/* Tab: Today's checklist */}
      {activeTab === 'today' && (
        <div className="space-y-2">
          {CATEGORIES.map(function(cat) {
            var catTasks = tasks.filter(function(t) { return t.category === cat; });
            if (catTasks.length === 0) return null;
            return (
              <div key={cat} className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-2">
                  <span className={'inline-flex px-2 py-0.5 rounded text-xs font-medium ' + (CAT_COLORS[cat] || 'bg-gray-500/15 text-gray-400')}>{cat}</span>
                  <span className="text-xs text-gray-500">{catTasks.filter(function(t) { return isTaskCompleted(t.id); }).length}/{catTasks.length}</span>
                </div>
                <div className="divide-y divide-slate-800">
                  {catTasks.map(function(task) {
                    var done = isTaskCompleted(task.id);
                    var overdue = selectedDate === todayStr() && nowTimeStr() > task.deadline && !done;
                    var note = getEntryNote(task.id);
                    return (
                      <div key={task.id} className={'px-4 py-3 ' + (done ? 'bg-slate-800/30' : overdue ? 'bg-red-500/5' : '')}>
                        <div className="flex items-start gap-3">
                          <button onClick={function() { toggleTask(task.id); }}
                            className={'mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ' +
                              (done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-500 hover:border-blue-400')}>
                            {done && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={'text-sm font-medium ' + (done ? 'line-through text-gray-500' : 'text-gray-200')}>{task.title}</span>
                              <span className={'text-[10px] font-medium ' + PRIORITY_COLORS[task.priority]}>{PRIORITY_LABELS[task.priority]}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{task.description}</p>
                            {(note || done) && (
                              <input type="text" placeholder="Ghi chú..." value={note}
                                onChange={function(e) { saveNote(task.id, e.target.value); }}
                                className="mt-1.5 w-full bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-gray-300 placeholder-gray-600" />
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={'text-xs ' + (overdue ? 'text-red-400 font-semibold' : 'text-gray-500')}>
                              {overdue ? 'Quá hạn!' : ''} {task.deadline}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: Overview (admin) */}
      {activeTab === 'overview' && isAdmin && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800/80 border-b border-slate-700/50">
                  <th className="text-left px-4 py-3 font-medium text-gray-400">Nhân viên</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-400">Hoàn thành</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-400">Tỷ lệ</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400">Trạng thái</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400">Task chưa làm</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {overviewData.map(function(row) {
                  var pct = row.total > 0 ? Math.round(row.done / row.total * 100) : 0;
                  var empDoneIds = checklistEntries.filter(function(e) { return e.date === selectedDate && e.userId === row.user.id && e.completed; }).map(function(e) { return e.taskId; });
                  var missing = tasks.filter(function(t) { return !empDoneIds.includes(t.id); });
                  return (
                    <tr key={row.user.id} className="hover:bg-slate-800/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-200">{row.user.name}</p>
                        <p className="text-xs text-gray-500">{row.user.email}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300">{row.done}/{row.total}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={'font-semibold ' + (pct === 100 ? 'text-emerald-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400')}>{pct}%</span>
                      </td>
                      <td className="px-4 py-3">
                        {pct === 100 ? (
                          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/15 text-emerald-400">Hoàn thành</span>
                        ) : pct >= 50 ? (
                          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/15 text-yellow-400">Đang làm</span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-red-500/15 text-red-400">Chưa làm</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {missing.slice(0, 3).map(function(t) {
                            return <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-gray-400">{t.title.substring(0, 20)}...</span>;
                          })}
                          {missing.length > 3 && <span className="text-[10px] text-gray-500">+{missing.length - 3} task</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {overviewData.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-gray-500 text-sm">Chưa có nhân viên nào</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Manage tasks (admin) */}
      {activeTab === 'manage' && isAdmin && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-400">{allTasks.length} task</p>
            <button onClick={function() { setShowAddTask(true); setEditTask(null); setNewTitle(''); setNewDesc(''); setNewCategory('Đơn hàng'); setNewDeadline('17:00'); setNewPriority('medium'); }}
              className="px-3 py-2 text-sm bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors">
              + Thêm task</button>
          </div>

          {showAddTask && (
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-200">{editTask ? 'Sửa task' : 'Thêm task mới'}</h3>
              <input type="text" placeholder="Tên công việc" value={newTitle} onChange={function(e) { setNewTitle(e.target.value); }}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-200" />
              <input type="text" placeholder="Mô tả" value={newDesc} onChange={function(e) { setNewDesc(e.target.value); }}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-200" />
              <div className="flex gap-3">
                <select value={newCategory} onChange={function(e) { setNewCategory(e.target.value); }}
                  className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-200">
                  {CATEGORIES.map(function(c) { return <option key={c} value={c}>{c}</option>; })}
                </select>
                <input type="time" value={newDeadline} onChange={function(e) { setNewDeadline(e.target.value); }}
                  className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-200" />
                <select value={newPriority} onChange={function(e) { setNewPriority(e.target.value as 'high' | 'medium' | 'low'); }}
                  className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-200">
                  <option value="high">Cao</option>
                  <option value="medium">Trung bình</option>
                  <option value="low">Thấp</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveTask}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Lưu</button>
                <button onClick={function() { setShowAddTask(false); setEditTask(null); }}
                  className="px-4 py-2 text-sm bg-slate-700 text-gray-300 rounded-lg hover:bg-slate-600 transition-colors">Hủy</button>
              </div>
            </div>
          )}

          <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="divide-y divide-slate-800">
              {allTasks.sort(function(a, b) { return a.order - b.order; }).map(function(task) {
                return (
                  <div key={task.id} className={'px-4 py-3 flex items-center gap-3 ' + (!task.isActive ? 'opacity-50' : '')}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-200">{task.title}</span>
                        <span className={'inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ' + (CAT_COLORS[task.category] || 'bg-gray-500/15 text-gray-400')}>{task.category}</span>
                        <span className={'text-[10px] ' + PRIORITY_COLORS[task.priority]}>{PRIORITY_LABELS[task.priority]}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{task.description} | Deadline: {task.deadline}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={function() { handleEditTask(task); }}
                        className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors" title="Sửa">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={function() { handleToggleActive(task.id); }}
                        className={'p-1.5 rounded transition-colors ' + (task.isActive ? 'text-emerald-500 hover:bg-emerald-500/10' : 'text-gray-600 hover:bg-slate-700')} title={task.isActive ? 'Tắt' : 'Bật'}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={task.isActive ? 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' : 'M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21'} /></svg>
                      </button>
                      <button onClick={function() { handleDeleteTask(task.id); }}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors" title="Xóa">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
