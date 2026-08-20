'use client';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

interface RefundRecord {
  recordId: string;
  tableId: string;
  customerName: string;
  orderCode: string;
  phone: string;
  product: string;
  shop: string;
  platform: string;
  refundAmount: number;
  refundReason: string;
  status: string;
  handler: string;
  date: string;
}

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
  var [refundRecords, setRefundRecords] = useState<RefundRecord[]>([]);
  var [loading, setLoading] = useState(true);
  var [error, setError] = useState('');
  var [activeTab, setActiveTab] = useState<'data' | 'dashboard' | 'refund'>('dashboard');
  var [filterDateFrom, setFilterDateFrom] = useState('');
  var [filterDateTo, setFilterDateTo] = useState('');
  var [filterShop, setFilterShop] = useState('');
  var [filterResult, setFilterResult] = useState('');
  var [filterReason, setFilterReason] = useState('');
  var [filterHandler, setFilterHandler] = useState('');
  var [filterRefundReason, setFilterRefundReason] = useState('');
  var [filterRefundStatus, setFilterRefundStatus] = useState('');
  var [search, setSearch] = useState('');
  var [page, setPage] = useState(0);
  var PAGE_SIZE = 50;
  var [editingRefund, setEditingRefund] = useState<RefundRecord | null>(null);
  var [isNewRefund, setIsNewRefund] = useState(false);
  var [saving, setSaving] = useState(false);
  var [billImages, setBillImages] = useState<{ file: File; preview: string }[]>([]);
  var [uploadingImage, setUploadingImage] = useState(false);
  var fileInputRef = useRef<HTMLInputElement>(null);

  var emptyRefund: RefundRecord = {
    recordId: '', tableId: '', customerName: '', orderCode: '', phone: '',
    product: '', shop: '', platform: '', refundAmount: 0, refundReason: '',
    status: '', handler: '', date: new Date().toISOString().split('T')[0],
  };

  function openNewRefund() {
    setEditingRefund({ ...emptyRefund });
    setIsNewRefund(true);
    setBillImages([]);
  }

  function openEditRefund(r: RefundRecord) {
    setEditingRefund({ ...r });
    setIsNewRefund(false);
    setBillImages([]);
  }

  function closeModal() {
    setEditingRefund(null);
    setIsNewRefund(false);
    setBillImages([]);
  }

  function addImageFiles(files: FileList | File[]) {
    var newImages = Array.from(files)
      .filter(function(f) { return f.type.startsWith('image/'); })
      .map(function(f) { return { file: f, preview: URL.createObjectURL(f) }; });
    setBillImages(function(prev) { return prev.concat(newImages); });
  }

  function removeImage(index: number) {
    setBillImages(function(prev) {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter(function(_, i) { return i !== index; });
    });
  }

  var handlePaste = useCallback(function(e: ClipboardEvent) {
    if (!editingRefund) return;
    var items = e.clipboardData?.items;
    if (!items) return;
    var imageFiles: File[] = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        var f = items[i].getAsFile();
        if (f) imageFiles.push(f);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      addImageFiles(imageFiles);
    }
  }, [editingRefund]);

  useEffect(function() {
    document.addEventListener('paste', handlePaste as EventListener);
    return function() { document.removeEventListener('paste', handlePaste as EventListener); };
  }, [handlePaste]);

  async function uploadImages(): Promise<string[]> {
    var tokens: string[] = [];
    for (var img of billImages) {
      var formData = new FormData();
      formData.append('file', img.file, img.file.name || 'bill.png');
      var res = await fetch('/api/lark-refund/upload', { method: 'POST', body: formData });
      var json = await res.json();
      if (json.file_token) tokens.push(json.file_token);
    }
    return tokens;
  }

  async function saveRefund() {
    if (!editingRefund) return;
    setSaving(true);
    try {
      var imageTokens: string[] = [];
      if (billImages.length > 0) {
        setUploadingImage(true);
        imageTokens = await uploadImages();
        setUploadingImage(false);
      }

      var isNew = isNewRefund;
      var method = isNew ? 'POST' : 'PUT';
      var base: Record<string, unknown> = {
        customerName: editingRefund.customerName,
        orderCode: editingRefund.orderCode,
        phone: editingRefund.phone,
        product: editingRefund.product,
        shop: editingRefund.shop,
        platform: editingRefund.platform,
        refundAmount: editingRefund.refundAmount,
        refundReason: editingRefund.refundReason,
        status: editingRefund.status,
        handler: editingRefund.handler,
        date: editingRefund.date,
      };
      if (imageTokens.length > 0) base.imageTokens = imageTokens;
      if (isNew) {
        base.tableId = editingRefund.tableId || undefined;
      } else {
        base.recordId = editingRefund.recordId;
        base.tableId = editingRefund.tableId;
      }

      var res = await fetch('/api/lark-refund', {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(base),
      });
      var data = await res.json();
      if (data.error) {
        var debugInfo = data.debug ? '\n\nFields gửi:\n' + JSON.stringify(data.debug.sentFields, null, 2) : '';
        alert('Lỗi: ' + data.error + debugInfo);
        return;
      }
      if (data.warning) alert(data.warning);
      closeModal();
      fetchData();
    } catch (e: unknown) {
      alert('Lỗi: ' + (e instanceof Error ? e.message : 'Unknown'));
    } finally {
      setSaving(false);
      setUploadingImage(false);
    }
  }

  function updateEditField(field: keyof RefundRecord, value: string | number) {
    if (!editingRefund) return;
    setEditingRefund({ ...editingRefund, [field]: value });
  }

  var [editingCskh, setEditingCskh] = useState<CskhRecord | null>(null);
  var [isNewCskh, setIsNewCskh] = useState(false);

  var emptyCskh: CskhRecord = {
    recordId: '', customerName: '', orderCode: '', phone: '', product: '',
    productType: '', initialStars: 1, fixedStars: 0, reason: '', badReviewReason: '',
    date: new Date().toISOString().split('T')[0], month: new Date().getMonth() + 1,
    customerStatus: '', shop: '', shopManager: '', handler: '', processingResult: '',
    note: '', refundAmount: 0, quantity: 1,
  };

  function openNewCskh() {
    setEditingCskh({ ...emptyCskh });
    setIsNewCskh(true);
  }

  function openEditCskh(r: CskhRecord) {
    setEditingCskh({ ...r });
    setIsNewCskh(false);
  }

  function closeCskhModal() {
    setEditingCskh(null);
    setIsNewCskh(false);
  }

  function saveCskh() {
    if (!editingCskh) return;
    setSaving(true);
    var isNew = isNewCskh;
    var method = isNew ? 'POST' : 'PUT';
    var payload: Record<string, unknown> = {
      customerName: editingCskh.customerName,
      orderCode: editingCskh.orderCode,
      phone: editingCskh.phone,
      product: editingCskh.product,
      initialStars: editingCskh.initialStars,
      fixedStars: editingCskh.fixedStars,
      shop: editingCskh.shop,
      handler: editingCskh.handler,
      processingResult: editingCskh.processingResult,
      customerStatus: editingCskh.customerStatus,
      note: editingCskh.note,
      refundAmount: editingCskh.refundAmount,
      quantity: editingCskh.quantity,
      date: editingCskh.date,
    };
    if (!isNew) payload.recordId = editingCskh.recordId;

    fetch('/api/lark-cskh', {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data.error) { alert('Lỗi: ' + data.error); return; }
        closeCskhModal();
        fetchData();
      })
      .catch(function(e) { alert('Lỗi: ' + e.message); })
      .finally(function() { setSaving(false); });
  }

  function updateCskhField(field: keyof CskhRecord, value: string | number) {
    if (!editingCskh) return;
    setEditingCskh({ ...editingCskh, [field]: value });
  }

  useEffect(function() {
    fetchData();
  }, []);

  function fetchData() {
    setLoading(true);
    setError('');
    Promise.all([
      fetch('/api/lark-cskh').then(function(res) { return res.json(); }),
      fetch('/api/lark-refund').then(function(res) { return res.json(); })
    ])
      .then(function(results) {
        var cskhData = results[0];
        var refundData = results[1];
        if (cskhData.error) { setError(cskhData.error); return; }
        setRecords(cskhData.records || []);
        setRefundRecords(refundData.records || []);
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
    var source = activeTab === 'refund' ? refundRecords : records;
    source.forEach(function(r) { if (r.handler) s.add(r.handler); });
    return Array.from(s).sort();
  }, [records, refundRecords, activeTab]);

  var refundReasons = useMemo(function() {
    var s = new Set<string>();
    refundRecords.forEach(function(r) { if (r.refundReason) s.add(r.refundReason.trim()); });
    return Array.from(s).sort();
  }, [refundRecords]);

  var refundStatuses = useMemo(function() {
    var s = new Set<string>();
    refundRecords.forEach(function(r) { if (r.status) s.add(r.status); });
    return Array.from(s).sort();
  }, [refundRecords]);

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

  var filteredRefund = useMemo(function() {
    return refundRecords.filter(function(r) {
      if (filterDateFrom && r.date && r.date < filterDateFrom) return false;
      if (filterDateFrom && !r.date) return false;
      if (filterDateTo && r.date && r.date > filterDateTo) return false;
      if (filterDateTo && !r.date) return false;
      if (filterShop && r.shop !== filterShop) return false;
      if (filterHandler && r.handler !== filterHandler) return false;
      if (filterRefundReason && !r.refundReason.includes(filterRefundReason)) return false;
      if (filterRefundStatus && r.status !== filterRefundStatus) return false;
      if (search) {
        var q = search.toLowerCase();
        if (!(r.customerName.toLowerCase().includes(q) || r.orderCode.toLowerCase().includes(q) ||
          r.product.toLowerCase().includes(q) || r.phone.includes(q))) return false;
      }
      return true;
    });
  }, [refundRecords, filterDateFrom, filterDateTo, filterShop, filterHandler, filterRefundReason, filterRefundStatus, search]);

  var pagedCskh = useMemo(function() {
    return filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [filtered, page]);

  var pagedRefund = useMemo(function() {
    return filteredRefund.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [filteredRefund, page]);

  var activeCount = activeTab === 'refund' ? filteredRefund.length : filtered.length;
  var totalPages = Math.ceil(activeCount / PAGE_SIZE);

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
          { key: 'refund' as const, label: 'Trả hàng hoàn tiền (' + refundRecords.length + ')' },
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
        {activeTab !== 'refund' && (
          <select value={filterResult} onChange={function(e) { setFilterResult(e.target.value); setPage(0); }}
            className="bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-1.5">
            <option value="">Tất cả kết quả</option>
            <option value="__pending__">Tồn đọng (chưa/đang xử lý)</option>
            {resultOptions.map(function(r) { return <option key={r} value={r}>{r}</option>; })}
          </select>
        )}
        {activeTab !== 'refund' && (
          <select value={filterReason} onChange={function(e) { setFilterReason(e.target.value); setPage(0); }}
            className="bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-1.5">
            <option value="">Tất cả lý do</option>
            {reasons.map(function(r) { return <option key={r} value={r}>{r}</option>; })}
          </select>
        )}
        {activeTab === 'refund' && (
          <select value={filterRefundReason} onChange={function(e) { setFilterRefundReason(e.target.value); setPage(0); }}
            className="bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-1.5">
            <option value="">Tất cả lý do hoàn</option>
            {refundReasons.map(function(r) { return <option key={r} value={r}>{r}</option>; })}
          </select>
        )}
        {activeTab === 'refund' && (
          <select value={filterRefundStatus} onChange={function(e) { setFilterRefundStatus(e.target.value); setPage(0); }}
            className="bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-1.5">
            <option value="">Tất cả trạng thái</option>
            {refundStatuses.map(function(r) { return <option key={r} value={r}>{r}</option>; })}
          </select>
        )}
        {(activeTab === 'data' || activeTab === 'refund') && (
          <input type="text" placeholder="Tìm khách / mã đơn / sản phẩm..."
            value={search} onChange={function(e) { setSearch(e.target.value); setPage(0); }}
            className="bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-1.5 w-64" />
        )}
        {(filterDateFrom || filterDateTo || filterShop || filterResult || filterReason || filterHandler || filterRefundReason || filterRefundStatus || search) && (
          <button onClick={function() { setFilterDateFrom(''); setFilterDateTo(''); setFilterShop(''); setFilterResult(''); setFilterReason(''); setFilterHandler(''); setFilterRefundReason(''); setFilterRefundStatus(''); setSearch(''); setPage(0); }}
            className="text-xs text-slate-400 hover:text-white px-2">Xoá bộ lọc</button>
        )}
        {activeTab !== 'refund' && filtered.length !== records.length && (
          <span className="text-xs text-slate-500 self-center ml-2">{filtered.length.toLocaleString()} / {records.length.toLocaleString()}</span>
        )}
        {activeTab === 'refund' && filteredRefund.length !== refundRecords.length && (
          <span className="text-xs text-slate-500 self-center ml-2">{filteredRefund.length.toLocaleString()} / {refundRecords.length.toLocaleString()}</span>
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
          <div className="flex justify-end mb-2">
            <button onClick={openNewCskh}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 text-sm flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Thêm mới
            </button>
          </div>
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
                  <th className="px-3 py-2 text-center w-16"></th>
                </tr>
              </thead>
              <tbody>
                {pagedCskh.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-8 text-slate-500">Không có dữ liệu</td></tr>
                ) : pagedCskh.map(function(r, i) {
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
                      <td className="px-3 py-2 text-center">
                        <button onClick={function() { openEditCskh(r); }}
                          className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded hover:bg-slate-700/50">Sửa</button>
                      </td>
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
                Trang {page + 1}/{totalPages} — {activeCount.toLocaleString()} bản ghi
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

      {/* Refund Tab */}
      {activeTab === 'refund' && (
        <div>
          {/* Refund summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
              <p className="text-slate-400 text-xs mb-1">Tổng đơn trả hàng</p>
              <p className="text-2xl font-bold text-white">{filteredRefund.length}</p>
            </div>
            <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
              <p className="text-slate-400 text-xs mb-1">Đã hoàn tiền</p>
              <p className="text-2xl font-bold text-emerald-400">{filteredRefund.filter(function(r) { return r.status === 'Đã hoàn tiền'; }).length}</p>
            </div>
            <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
              <p className="text-slate-400 text-xs mb-1">Chưa hoàn</p>
              <p className="text-2xl font-bold text-amber-400">{filteredRefund.filter(function(r) { return r.status !== 'Đã hoàn tiền'; }).length}</p>
            </div>
            <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
              <p className="text-slate-400 text-xs mb-1">Tổng tiền hoàn</p>
              <p className="text-2xl font-bold text-rose-400">{(filteredRefund.reduce(function(s, r) { return s + r.refundAmount; }, 0) / 1000).toFixed(0)}K</p>
              <p className="text-xs text-slate-500">{filteredRefund.reduce(function(s, r) { return s + r.refundAmount; }, 0).toLocaleString()}đ</p>
            </div>
          </div>

          <div className="flex justify-end mb-2">
            <button onClick={openNewRefund}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 text-sm flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Thêm mới
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-700/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800/80 text-slate-400 text-xs">
                  <th className="px-3 py-2 text-left">Ngày</th>
                  <th className="px-3 py-2 text-left">Shop</th>
                  <th className="px-3 py-2 text-left">Sàn</th>
                  <th className="px-3 py-2 text-left">Khách hàng</th>
                  <th className="px-3 py-2 text-left">SĐT</th>
                  <th className="px-3 py-2 text-left">Mã đơn</th>
                  <th className="px-3 py-2 text-left">Sản phẩm</th>
                  <th className="px-3 py-2 text-right">Tiền hoàn</th>
                  <th className="px-3 py-2 text-left">Lý do</th>
                  <th className="px-3 py-2 text-left">Trạng thái</th>
                  <th className="px-3 py-2 text-left">Người hoàn</th>
                  <th className="px-3 py-2 text-center w-16"></th>
                </tr>
              </thead>
              <tbody>
                {pagedRefund.length === 0 ? (
                  <tr><td colSpan={12} className="text-center py-8 text-slate-500">Không có dữ liệu</td></tr>
                ) : pagedRefund.map(function(r, i) {
                  var statusColor = r.status === 'Đã hoàn tiền' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-amber-900/50 text-amber-400';
                  return (
                    <tr key={r.recordId + '-' + i} className="border-t border-slate-800 hover:bg-slate-800/40">
                      <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{r.date}</td>
                      <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{r.shop}</td>
                      <td className="px-3 py-2 text-slate-400">{r.platform}</td>
                      <td className="px-3 py-2 text-white max-w-[120px] truncate" title={r.customerName}>{r.customerName}</td>
                      <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{r.phone}</td>
                      <td className="px-3 py-2 text-slate-400 max-w-[120px] truncate" title={r.orderCode}>{r.orderCode}</td>
                      <td className="px-3 py-2 text-slate-300 max-w-[150px] truncate" title={r.product}>{r.product}</td>
                      <td className="px-3 py-2 text-rose-400 text-right whitespace-nowrap">{r.refundAmount > 0 ? r.refundAmount.toLocaleString() + 'đ' : '—'}</td>
                      <td className="px-3 py-2 text-slate-400 max-w-[200px]" title={r.refundReason}>
                        <span className="line-clamp-2 text-xs">{r.refundReason}</span>
                      </td>
                      <td className="px-3 py-2"><span className={'px-2 py-0.5 rounded text-xs font-medium ' + statusColor}>{r.status || '—'}</span></td>
                      <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{r.handler}</td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={function() { openEditRefund(r); }}
                          className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded hover:bg-slate-700/50">Sửa</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-slate-500">
                Trang {page + 1}/{totalPages} — {activeCount.toLocaleString()} bản ghi
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

      {/* Edit/Create CSKH Modal */}
      {editingCskh && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={closeCskhModal}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={function(e) { e.stopPropagation(); }}>
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">{isNewCskh ? 'Thêm đánh giá CSKH' : 'Sửa đánh giá CSKH'}</h2>
              <button onClick={closeCskhModal} className="text-slate-400 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Ngày xử lý</label>
                <input type="date" value={editingCskh.date}
                  onChange={function(e) { updateCskhField('date', e.target.value); }}
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-2" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Shop</label>
                <select value={editingCskh.shop}
                  onChange={function(e) { updateCskhField('shop', e.target.value); }}
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-2">
                  <option value="">-- Chọn --</option>
                  {shops.map(function(s) { return <option key={s} value={s}>{s}</option>; })}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Tên khách hàng</label>
                <input type="text" value={editingCskh.customerName}
                  onChange={function(e) { updateCskhField('customerName', e.target.value); }}
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-2" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Số điện thoại</label>
                <input type="text" value={editingCskh.phone}
                  onChange={function(e) { updateCskhField('phone', e.target.value); }}
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-2" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Mã đơn hàng</label>
                <input type="text" value={editingCskh.orderCode}
                  onChange={function(e) { updateCskhField('orderCode', e.target.value); }}
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-2" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Sản phẩm</label>
                <input type="text" value={editingCskh.product}
                  onChange={function(e) { updateCskhField('product', e.target.value); }}
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-2" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Số sao ban đầu</label>
                <select value={editingCskh.initialStars}
                  onChange={function(e) { updateCskhField('initialStars', Number(e.target.value)); }}
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-2">
                  {[1,2,3,4,5].map(function(n) { return <option key={n} value={n}>{n} sao</option>; })}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Số sao đã sửa</label>
                <select value={editingCskh.fixedStars}
                  onChange={function(e) { updateCskhField('fixedStars', Number(e.target.value)); }}
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-2">
                  {[0,1,2,3,4,5].map(function(n) { return <option key={n} value={n}>{n === 0 ? 'Chưa sửa' : n + ' sao'}</option>; })}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Kết quả xử lý</label>
                <select value={editingCskh.processingResult}
                  onChange={function(e) { updateCskhField('processingResult', e.target.value); }}
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-2">
                  <option value="">-- Chọn --</option>
                  {resultOptions.map(function(r) { return <option key={r} value={r}>{r}</option>; })}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Trạng thái khách</label>
                <input type="text" value={editingCskh.customerStatus}
                  onChange={function(e) { updateCskhField('customerStatus', e.target.value); }}
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-2"
                  placeholder="VD: Đã sửa đánh giá" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">NV xử lý</label>
                <select value={editingCskh.handler}
                  onChange={function(e) { updateCskhField('handler', e.target.value); }}
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-2">
                  <option value="">-- Chọn --</option>
                  {handlers.map(function(h) { return <option key={h} value={h}>{h}</option>; })}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Số tiền hoàn (đ)</label>
                <input type="number" value={editingCskh.refundAmount}
                  onChange={function(e) { updateCskhField('refundAmount', Number(e.target.value)); }}
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-2" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Số lượng</label>
                <input type="number" value={editingCskh.quantity}
                  onChange={function(e) { updateCskhField('quantity', Number(e.target.value)); }}
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-2" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-slate-400 block mb-1">Ghi chú</label>
                <textarea value={editingCskh.note} rows={2}
                  onChange={function(e) { updateCskhField('note', e.target.value); }}
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-2 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-slate-700">
              <button onClick={closeCskhModal} className="px-4 py-2 text-sm text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">Huỷ</button>
              <button onClick={saveCskh} disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 flex items-center gap-2">
                {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {isNewCskh ? 'Tạo mới' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit/Create Refund Modal */}
      {editingRefund && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={function(e) { e.stopPropagation(); }}>
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">{isNewRefund ? 'Thêm đơn trả hàng' : 'Sửa đơn trả hàng'}</h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Ngày</label>
                <input type="date" value={editingRefund.date}
                  onChange={function(e) { updateEditField('date', e.target.value); }}
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-2" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Tên khách hàng</label>
                <input type="text" value={editingRefund.customerName}
                  onChange={function(e) { updateEditField('customerName', e.target.value); }}
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-2" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Mã đơn hàng</label>
                <input type="text" value={editingRefund.orderCode}
                  onChange={function(e) { updateEditField('orderCode', e.target.value); }}
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-2" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Số điện thoại</label>
                <input type="text" value={editingRefund.phone}
                  onChange={function(e) { updateEditField('phone', e.target.value); }}
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-2" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-slate-400 block mb-1">Sản phẩm</label>
                <input type="text" value={editingRefund.product}
                  onChange={function(e) { updateEditField('product', e.target.value); }}
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-2" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Shop</label>
                <input type="text" value={editingRefund.shop}
                  onChange={function(e) { updateEditField('shop', e.target.value); }}
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-2" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Sàn</label>
                <input type="text" value={editingRefund.platform}
                  onChange={function(e) { updateEditField('platform', e.target.value); }}
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-2" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Số tiền hoàn (đ)</label>
                <input type="number" value={editingRefund.refundAmount}
                  onChange={function(e) { updateEditField('refundAmount', Number(e.target.value)); }}
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-2" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Người hoàn tiền</label>
                <input type="text" value={editingRefund.handler}
                  onChange={function(e) { updateEditField('handler', e.target.value); }}
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-2" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-slate-400 block mb-1">Lý do hoàn</label>
                <textarea value={editingRefund.refundReason} rows={2}
                  onChange={function(e) { updateEditField('refundReason', e.target.value); }}
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-2 resize-none" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Trạng thái</label>
                <select value={editingRefund.status}
                  onChange={function(e) { updateEditField('status', e.target.value); }}
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded px-3 py-2">
                  <option value="">-- Chọn --</option>
                  <option value="Đã hoàn tiền">Đã hoàn tiền</option>
                  <option value="Chưa hoàn tiền">Chưa hoàn tiền</option>
                  {refundStatuses.filter(function(s) { return s !== 'Đã hoàn tiền' && s !== 'Chưa hoàn tiền'; }).map(function(s) {
                    return <option key={s} value={s}>{s}</option>;
                  })}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-slate-400 block mb-1">Ảnh bill chuyển khoản</label>
                <input type="file" ref={fileInputRef} accept="image/*" multiple className="hidden"
                  onChange={function(e) { if (e.target.files) addImageFiles(e.target.files); e.target.value = ''; }} />
                <div
                  className="border-2 border-dashed border-slate-600 rounded-lg p-4 text-center cursor-pointer hover:border-blue-500/50 transition-colors"
                  onClick={function() { fileInputRef.current?.click(); }}
                  onDragOver={function(e) { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={function(e) { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files) addImageFiles(e.dataTransfer.files); }}>
                  {billImages.length === 0 ? (
                    <div>
                      <svg className="w-8 h-8 mx-auto text-slate-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-xs text-slate-400">Bấm để chọn ảnh, kéo thả, hoặc <span className="text-blue-400">Ctrl+V</span> để dán</p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 justify-center">
                      {billImages.map(function(img, idx) {
                        return (
                          <div key={idx} className="relative group">
                            <img src={img.preview} alt="bill" className="h-20 rounded border border-slate-600 object-cover" />
                            <button onClick={function(e) { e.stopPropagation(); removeImage(idx); }}
                              className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">&times;</button>
                          </div>
                        );
                      })}
                      <div className="h-20 w-20 border border-dashed border-slate-600 rounded flex items-center justify-center text-slate-500 text-2xl">+</div>
                    </div>
                  )}
                </div>
                {uploadingImage && <p className="text-xs text-blue-400 mt-1">Đang tải ảnh lên Lark...</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-slate-700">
              <button onClick={closeModal} className="px-4 py-2 text-sm text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">Huỷ</button>
              <button onClick={saveRefund} disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 flex items-center gap-2">
                {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {uploadingImage ? 'Đang tải ảnh...' : (isNewRefund ? 'Tạo mới' : 'Lưu thay đổi')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
