'use client';

import { useState, useMemo } from 'react';
import { useAppState } from '@/lib/store';
import { toDateString } from '@/lib/utils';
import { CskhReview, CskhIssue } from '@/lib/types';

const REVIEW_METHODS = ['Nhắn tin', 'Gọi điện', 'Tặng quà', 'Hoàn tiền', 'Đổi hàng', 'Khác'];
const REVIEW_STATUSES = ['Đã xử lý', 'Đang chờ KH phản hồi', 'Không liên hệ được'];
const REVIEW_RESULTS = ['Đã sửa lên 4-5 sao', 'Giữ nguyên', 'Từ chối sửa'];
const ISSUE_TYPES = ['Đóng sai hàng', 'SP không hiệu quả', 'Thiếu hàng', 'Hàng hư hỏng', 'Khác'];
const ISSUE_STATUSES = ['Đã xong', 'Đang xử lý', 'Tồn đọng'];
const ISSUE_URGENCIES = ['Thấp', 'Trung bình', 'Cao'];

interface ReviewForm {
  tempId: string;
  shopId: string;
  orderCode: string;
  customerInfo: string;
  product: string;
  initialStars: number;
  reviewContent: string;
  resolutionMethod: string;
  status: string;
  result: string;
  note: string;
}

interface IssueForm {
  tempId: string;
  shopId: string;
  orderCode: string;
  issueType: string;
  description: string;
  resolution: string;
  urgency: string;
  status: string;
  needsIntervention: boolean;
  interventionNote: string;
}

function createEmptyReview(): ReviewForm {
  return {
    tempId: 'tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    shopId: '',
    orderCode: '',
    customerInfo: '',
    product: '',
    initialStars: 1,
    reviewContent: '',
    resolutionMethod: 'Nhắn tin',
    status: 'Đang chờ KH phản hồi',
    result: '',
    note: '',
  };
}

function createEmptyIssue(): IssueForm {
  return {
    tempId: 'tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    shopId: '',
    orderCode: '',
    issueType: 'Đóng sai hàng',
    description: '',
    resolution: '',
    urgency: 'Trung bình',
    status: 'Đang xử lý',
    needsIntervention: false,
    interventionNote: '',
  };
}

export default function CskhReportPage() {
  const { currentUser, getUserShops, addCskhReview, addCskhIssue } = useAppState();
  const [activeTab, setActiveTab] = useState<'reviews' | 'issues'>('reviews');
  const [reviewForms, setReviewForms] = useState<ReviewForm[]>([createEmptyReview()]);
  const [issueForms, setIssueForms] = useState<IssueForm[]>([createEmptyIssue()]);
  const [successMsg, setSuccessMsg] = useState('');
  const [date, setDate] = useState(toDateString(new Date()));

  const userShops = useMemo(function() {
    if (!currentUser) return [];
    return getUserShops(currentUser.id);
  }, [currentUser, getUserShops]);

  function updateReviewForm(tempId: string, field: keyof ReviewForm, value: string | number) {
    setReviewForms(function(forms) {
      return forms.map(function(f) {
        if (f.tempId !== tempId) return f;
        return { ...f, [field]: value };
      });
    });
  }

  function removeReviewForm(tempId: string) {
    setReviewForms(function(forms) {
      if (forms.length <= 1) return forms;
      return forms.filter(function(f) { return f.tempId !== tempId; });
    });
  }

  function updateIssueForm(tempId: string, field: keyof IssueForm, value: string | number | boolean) {
    setIssueForms(function(forms) {
      return forms.map(function(f) {
        if (f.tempId !== tempId) return f;
        return { ...f, [field]: value };
      });
    });
  }

  function removeIssueForm(tempId: string) {
    setIssueForms(function(forms) {
      if (forms.length <= 1) return forms;
      return forms.filter(function(f) { return f.tempId !== tempId; });
    });
  }

  function submitReview(form: ReviewForm) {
    if (!currentUser) return;
    if (!form.shopId) { alert('Vui lòng chọn shop'); return; }
    if (!form.orderCode.trim()) { alert('Vui lòng nhập mã đơn hàng'); return; }
    if (!form.initialStars) { alert('Vui lòng chọn số sao'); return; }

    const review: CskhReview = {
      id: 'cskh-rev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      date: date,
      reporterId: currentUser.id,
      shopId: form.shopId,
      orderCode: form.orderCode.trim(),
      customerInfo: form.customerInfo.trim(),
      product: form.product.trim(),
      initialStars: form.initialStars,
      reviewContent: form.reviewContent.trim(),
      resolutionMethod: form.resolutionMethod,
      status: form.status,
      result: form.result,
      note: form.note.trim(),
      createdAt: new Date().toISOString(),
    };

    addCskhReview(review);

    // Reset this form
    setReviewForms(function(forms) {
      return forms.map(function(f) {
        if (f.tempId !== form.tempId) return f;
        return createEmptyReview();
      });
    });

    setSuccessMsg('Lưu đánh giá xấu thành công!');
    setTimeout(function() { setSuccessMsg(''); }, 3000);
  }

  function submitIssue(form: IssueForm) {
    if (!currentUser) return;
    if (!form.shopId) { alert('Vui lòng chọn shop'); return; }
    if (!form.orderCode.trim()) { alert('Vui lòng nhập mã đơn hàng'); return; }
    if (!form.issueType) { alert('Vui lòng chọn loại vấn đề'); return; }

    const issue: CskhIssue = {
      id: 'cskh-iss-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      date: date,
      reporterId: currentUser.id,
      shopId: form.shopId,
      orderCode: form.orderCode.trim(),
      issueType: form.issueType,
      description: form.description.trim(),
      resolution: form.resolution.trim(),
      urgency: form.urgency,
      status: form.status,
      needsIntervention: form.needsIntervention,
      interventionNote: form.interventionNote.trim(),
      createdAt: new Date().toISOString(),
    };

    addCskhIssue(issue);

    // Reset this form
    setIssueForms(function(forms) {
      return forms.map(function(f) {
        if (f.tempId !== form.tempId) return f;
        return createEmptyIssue();
      });
    });

    setSuccessMsg('Lưu vấn đề phát sinh thành công!');
    setTimeout(function() { setSuccessMsg(''); }, 3000);
  }

  if (!currentUser) return null;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Báo cáo CSKH</h1>
        <p className="text-sm text-gray-500 mt-1">Nhập đánh giá xấu & vấn đề phát sinh CSKH</p>
      </div>

      {/* Success message */}
      {successMsg && (
        <div className="mb-4 bg-emerald-500/15 border border-emerald-500/30 rounded-xl p-3 text-emerald-400 text-sm flex items-center gap-2">
          <span>&#10003;</span> {successMsg}
        </div>
      )}

      {/* Date picker */}
      <div className="mb-6 bg-slate-900 border border-slate-700/50 rounded-xl p-4">
        <div className="flex items-center gap-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Ngày báo cáo</label>
            <input type="date" value={date} onChange={function(e) { setDate(e.target.value); }} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-200" />
          </div>
          <div className="text-sm text-gray-400">
            Người báo: <span className="text-gray-200 font-medium">{currentUser.name}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        <button onClick={function() { setActiveTab('reviews'); }} className={'px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ' + (activeTab === 'reviews' ? 'bg-slate-900 text-blue-400 border border-slate-700/50 border-b-0' : 'bg-slate-800/50 text-gray-400 hover:text-gray-300')}>
          Đánh giá xấu
        </button>
        <button onClick={function() { setActiveTab('issues'); }} className={'px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ' + (activeTab === 'issues' ? 'bg-slate-900 text-blue-400 border border-slate-700/50 border-b-0' : 'bg-slate-800/50 text-gray-400 hover:text-gray-300')}>
          Vấn đề phát sinh
        </button>
      </div>

      {/* Reviews Tab */}
      {activeTab === 'reviews' && (
        <div className="space-y-4">
          {reviewForms.map(function(form, idx) {
            return (
              <div key={form.tempId} className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-300">Đánh giá xấu #{idx + 1}</h3>
                  {reviewForms.length > 1 && (
                    <button onClick={function() { removeReviewForm(form.tempId); }} className="text-xs text-red-400 hover:text-red-300">Xoá</button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Shop */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Shop <span className="text-red-400">*</span></label>
                    <select value={form.shopId} onChange={function(e) { updateReviewForm(form.tempId, 'shopId', e.target.value); }} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-200">
                      <option value="">-- Chọn shop --</option>
                      {userShops.map(function(s) { return <option key={s.id} value={s.id}>{s.name}</option>; })}
                    </select>
                  </div>
                  {/* Order code */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Mã đơn hàng <span className="text-red-400">*</span></label>
                    <input type="text" value={form.orderCode} onChange={function(e) { updateReviewForm(form.tempId, 'orderCode', e.target.value); }} placeholder="VD: 250813ABCDEF" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-200" />
                  </div>
                  {/* Stars */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Số sao đánh giá <span className="text-red-400">*</span></label>
                    <div className="flex gap-2 mt-1">
                      {[1, 2, 3].map(function(star) {
                        return (
                          <button key={star} onClick={function() { updateReviewForm(form.tempId, 'initialStars', star); }} className={'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ' + (form.initialStars === star ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' : 'bg-slate-800 text-gray-400 border border-slate-600 hover:border-slate-500')}>
                            {star} ★
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* Customer info */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Thông tin KH</label>
                    <input type="text" value={form.customerInfo} onChange={function(e) { updateReviewForm(form.tempId, 'customerInfo', e.target.value); }} placeholder="Tên / SĐT khách" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-200" />
                  </div>
                  {/* Product */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Sản phẩm</label>
                    <input type="text" value={form.product} onChange={function(e) { updateReviewForm(form.tempId, 'product', e.target.value); }} placeholder="Tên sản phẩm" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-200" />
                  </div>
                  {/* Resolution method */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Cách xử lý</label>
                    <select value={form.resolutionMethod} onChange={function(e) { updateReviewForm(form.tempId, 'resolutionMethod', e.target.value); }} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-200">
                      {REVIEW_METHODS.map(function(m) { return <option key={m} value={m}>{m}</option>; })}
                    </select>
                  </div>
                  {/* Review content */}
                  <div className="md:col-span-2">
                    <label className="text-xs text-gray-500 block mb-1">Nội dung đánh giá</label>
                    <textarea value={form.reviewContent} onChange={function(e) { updateReviewForm(form.tempId, 'reviewContent', e.target.value); }} placeholder="Khách phàn nàn gì..." rows={2} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-200 resize-none" />
                  </div>
                  {/* Status */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Trạng thái</label>
                    <select value={form.status} onChange={function(e) { updateReviewForm(form.tempId, 'status', e.target.value); }} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-200">
                      {REVIEW_STATUSES.map(function(s) { return <option key={s} value={s}>{s}</option>; })}
                    </select>
                  </div>
                  {/* Result */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Kết quả</label>
                    <select value={form.result} onChange={function(e) { updateReviewForm(form.tempId, 'result', e.target.value); }} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-200">
                      <option value="">-- Chưa có --</option>
                      {REVIEW_RESULTS.map(function(s) { return <option key={s} value={s}>{s}</option>; })}
                    </select>
                  </div>
                  {/* Note */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Ghi chú</label>
                    <input type="text" value={form.note} onChange={function(e) { updateReviewForm(form.tempId, 'note', e.target.value); }} placeholder="Ghi chú thêm" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-200" />
                  </div>
                </div>
                <div className="flex justify-end mt-4">
                  <button onClick={function() { submitReview(form); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
                    Lưu đánh giá
                  </button>
                </div>
              </div>
            );
          })}
          <button onClick={function() { setReviewForms(function(f) { return [...f, createEmptyReview()]; }); }} className="w-full py-3 border-2 border-dashed border-slate-700 rounded-xl text-sm text-gray-400 hover:border-slate-500 hover:text-gray-300 transition-colors">
            + Thêm đánh giá xấu
          </button>
        </div>
      )}

      {/* Issues Tab */}
      {activeTab === 'issues' && (
        <div className="space-y-4">
          {issueForms.map(function(form, idx) {
            return (
              <div key={form.tempId} className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-300">Vấn đề #{idx + 1}</h3>
                  {issueForms.length > 1 && (
                    <button onClick={function() { removeIssueForm(form.tempId); }} className="text-xs text-red-400 hover:text-red-300">Xoá</button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Shop */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Shop <span className="text-red-400">*</span></label>
                    <select value={form.shopId} onChange={function(e) { updateIssueForm(form.tempId, 'shopId', e.target.value); }} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-200">
                      <option value="">-- Chọn shop --</option>
                      {userShops.map(function(s) { return <option key={s.id} value={s.id}>{s.name}</option>; })}
                    </select>
                  </div>
                  {/* Order code */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Mã đơn hàng <span className="text-red-400">*</span></label>
                    <input type="text" value={form.orderCode} onChange={function(e) { updateIssueForm(form.tempId, 'orderCode', e.target.value); }} placeholder="VD: 250813ABCDEF" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-200" />
                  </div>
                  {/* Issue type */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Loại vấn đề <span className="text-red-400">*</span></label>
                    <select value={form.issueType} onChange={function(e) { updateIssueForm(form.tempId, 'issueType', e.target.value); }} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-200">
                      {ISSUE_TYPES.map(function(t) { return <option key={t} value={t}>{t}</option>; })}
                    </select>
                  </div>
                  {/* Urgency */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Độ khẩn cấp</label>
                    <select value={form.urgency} onChange={function(e) { updateIssueForm(form.tempId, 'urgency', e.target.value); }} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-200">
                      {ISSUE_URGENCIES.map(function(u) { return <option key={u} value={u}>{u}</option>; })}
                    </select>
                  </div>
                  {/* Status */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Trạng thái</label>
                    <select value={form.status} onChange={function(e) { updateIssueForm(form.tempId, 'status', e.target.value); }} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-200">
                      {ISSUE_STATUSES.map(function(s) { return <option key={s} value={s}>{s}</option>; })}
                    </select>
                  </div>
                  {/* Needs intervention */}
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm text-gray-300 pb-2">
                      <input type="checkbox" checked={form.needsIntervention} onChange={function(e) { updateIssueForm(form.tempId, 'needsIntervention', e.target.checked); }} className="rounded bg-slate-800 border-slate-600" />
                      Cần quản lý can thiệp
                    </label>
                  </div>
                  {/* Description */}
                  <div className="md:col-span-2">
                    <label className="text-xs text-gray-500 block mb-1">Mô tả vấn đề</label>
                    <textarea value={form.description} onChange={function(e) { updateIssueForm(form.tempId, 'description', e.target.value); }} placeholder="Chi tiết vấn đề..." rows={2} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-200 resize-none" />
                  </div>
                  {/* Resolution */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Cách xử lý</label>
                    <input type="text" value={form.resolution} onChange={function(e) { updateIssueForm(form.tempId, 'resolution', e.target.value); }} placeholder="Đã xử lý như thế nào" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-200" />
                  </div>
                  {/* Intervention note */}
                  {form.needsIntervention && (
                    <div className="md:col-span-2">
                      <label className="text-xs text-orange-400 block mb-1">Ghi chú can thiệp</label>
                      <input type="text" value={form.interventionNote} onChange={function(e) { updateIssueForm(form.tempId, 'interventionNote', e.target.value); }} placeholder="Cần quản lý xử lý gì..." className="w-full bg-slate-800 border border-orange-500/30 rounded-lg px-3 py-2 text-sm text-gray-200" />
                    </div>
                  )}
                </div>
                <div className="flex justify-end mt-4">
                  <button onClick={function() { submitIssue(form); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
                    Lưu vấn đề
                  </button>
                </div>
              </div>
            );
          })}
          <button onClick={function() { setIssueForms(function(f) { return [...f, createEmptyIssue()]; }); }} className="w-full py-3 border-2 border-dashed border-slate-700 rounded-xl text-sm text-gray-400 hover:border-slate-500 hover:text-gray-300 transition-colors">
            + Thêm vấn đề phát sinh
          </button>
        </div>
      )}
    </div>
  );
}
