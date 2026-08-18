'use client';

import { useState, useMemo, useRef } from 'react';
import { useAppState } from '@/lib/store';
import { CogsEntry, PnlImport, PnlDailyData } from '@/lib/types';
import * as XLSX from 'xlsx';

function fmt(n: number): string {
  return n.toLocaleString('vi-VN') + 'đ';
}

function pct(n: number): string {
  return n.toFixed(1) + '%';
}

function getMonthStart(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
}

function getMonthEnd(d: Date): string {
  var last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.getFullYear() + '-' + String(last.getMonth() + 1).padStart(2, '0') + '-' + String(last.getDate()).padStart(2, '0');
}

function parseNum(val: unknown): number {
  if (typeof val === 'number') return Math.round(val);
  if (!val) return 0;
  var str = String(val).replace(/[^\d.,]/g, '').trim();
  if (/\.\d{2}$/.test(str)) {
    str = str.replace(/,/g, '');
    return Math.max(0, Math.round(parseFloat(str)) || 0);
  }
  str = str.replace(/[.,]/g, '');
  return Math.max(0, parseInt(str) || 0);
}

function extractDateShopee(raw: string): string | null {
  if (!raw) return null;
  var match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return match[1] + '-' + match[2] + '-' + match[3];
  return null;
}

function extractDateTikTok(raw: string): string | null {
  if (!raw) return null;
  var match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) return match[3] + '-' + match[2].padStart(2, '0') + '-' + match[1].padStart(2, '0');
  var match2 = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match2) return match2[1] + '-' + match2[2] + '-' + match2[3];
  return null;
}

function normalizeKeys(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(function(row) {
    var out: Record<string, unknown> = {};
    for (var key of Object.keys(row)) {
      out[key.normalize('NFC')] = row[key];
    }
    return out;
  });
}

export default function PnlPage() {
  var { currentUser, shops, cogsEntries, pnlConfig, pnlImports, reports, saveCogs, savePnlConfig, savePnlImports } = useAppState();
  var cogsFileRef = useRef<HTMLInputElement>(null);
  var orderFileRef = useRef<HTMLInputElement>(null);
  var [uploading, setUploading] = useState(false);
  var [uploadMsg, setUploadMsg] = useState('');
  var [orderUploading, setOrderUploading] = useState(false);
  var [orderMsg, setOrderMsg] = useState('');
  var [selectedShopId, setSelectedShopId] = useState('');
  var [filterShop, setFilterShop] = useState('all');
  var [filterChannel, setFilterChannel] = useState<'all' | 'Shopee' | 'TikTok'>('all');
  var [dateFrom, setDateFrom] = useState(function() { return getMonthStart(new Date()); });
  var [dateTo, setDateTo] = useState(function() { return getMonthEnd(new Date()); });
  var [editFees, setEditFees] = useState(false);
  var [shopeeRate, setShopeeRate] = useState(String(pnlConfig.shopeeFeeRate));
  var [tiktokRate, setTiktokRate] = useState(String(pnlConfig.tiktokFeeRate));
  var [opexRate, setOpexRate] = useState(String(pnlConfig.opexRate));
  var [activeTab, setActiveTab] = useState<'ceo' | 'summary' | 'daily' | 'cogs'>('ceo');

  var cogsMap = useMemo(function() {
    var m = new Map<string, number>();
    cogsEntries.forEach(function(e) { m.set(e.sku, e.cost); });
    return m;
  }, [cogsEntries]);

  var filteredImports = useMemo(function() {
    return pnlImports.filter(function(imp) {
      if (filterShop !== 'all' && imp.shopId !== filterShop) return false;
      if (filterChannel !== 'all' && imp.channel !== filterChannel) return false;
      if (dateFrom && imp.dateTo < dateFrom) return false;
      if (dateTo && imp.dateFrom > dateTo) return false;
      return true;
    });
  }, [pnlImports, filterShop, filterChannel, dateFrom, dateTo]);

  var pnlRows = useMemo(function() {
    var rows: { date: string; shopId: string; shopName: string; channel: string; revenue: number; cogs: number; platformFee: number; adSpend: number; opex: number; profit: number }[] = [];
    filteredImports.forEach(function(imp) {
      imp.dailyData.forEach(function(dd) {
        if (dateFrom && dd.date < dateFrom) return;
        if (dateTo && dd.date > dateTo) return;
        var vatRate = imp.channel === 'TikTok' ? 1.10 : 1.08;
        var adSpendWithVat = Math.round(dd.adSpend * vatRate);
        var opex = Math.round(dd.revenue * pnlConfig.opexRate / 100);
        var profit = dd.revenue - dd.cogs - dd.platformFee - adSpendWithVat - opex;
        rows.push({
          date: dd.date,
          shopId: imp.shopId,
          shopName: imp.shopName,
          channel: imp.channel,
          revenue: dd.revenue,
          cogs: dd.cogs,
          platformFee: dd.platformFee,
          adSpend: adSpendWithVat,
          opex: opex,
          profit: profit,
        });
      });
    });
    rows.sort(function(a, b) { return a.date.localeCompare(b.date) || a.shopName.localeCompare(b.shopName); });
    return rows;
  }, [filteredImports, dateFrom, dateTo, pnlConfig.opexRate]);

  var totals = useMemo(function() {
    var t = { revenue: 0, cogs: 0, platformFee: 0, adSpend: 0, opex: 0, profit: 0 };
    pnlRows.forEach(function(r) {
      t.revenue += r.revenue;
      t.cogs += r.cogs;
      t.platformFee += r.platformFee;
      t.adSpend += r.adSpend;
      t.opex += r.opex;
      t.profit += r.profit;
    });
    return t;
  }, [pnlRows]);

  var shopSummary = useMemo(function() {
    var map = new Map<string, { shopName: string; channel: string; revenue: number; cogs: number; platformFee: number; adSpend: number; opex: number; profit: number }>();
    pnlRows.forEach(function(r) {
      var existing = map.get(r.shopId) || { shopName: r.shopName, channel: r.channel, revenue: 0, cogs: 0, platformFee: 0, adSpend: 0, opex: 0, profit: 0 };
      existing.revenue += r.revenue;
      existing.cogs += r.cogs;
      existing.platformFee += r.platformFee;
      existing.adSpend += r.adSpend;
      existing.opex += r.opex;
      existing.profit += r.profit;
      map.set(r.shopId, existing);
    });
    return Array.from(map.entries()).sort(function(a, b) { return b[1].revenue - a[1].revenue; });
  }, [pnlRows]);

  function handleCogsUpload(e: React.ChangeEvent<HTMLInputElement>) {
    var files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadMsg('');

    var allEntries = new Map<string, CogsEntry>();
    cogsEntries.forEach(function(entry) { allEntries.set(entry.sku, entry); });
    var processed = 0;
    var totalFiles = files.length;

    Array.from(files).forEach(function(file) {
      var reader = new FileReader();
      reader.onload = function(ev) {
        try {
          var data = new Uint8Array(ev.target?.result as ArrayBuffer);
          var wb = XLSX.read(data, { type: 'array' });
          var ws = wb.Sheets[wb.SheetNames[0]];
          var rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];
          var headers = Object.keys(rows[0] || {});
          var isShopeeFormat = headers.some(function(h) { return h.includes('SKU phân loại hàng'); });

          if (isShopeeFormat) {
            rows.forEach(function(row) {
              var sku = String(row['SKU phân loại hàng'] || '').trim().replace(/\n/g, '');
              if (!sku) return;
              var name = String(row['Tên phân loại hàng'] || '').trim();
              var costKey = headers.find(function(h) { return h.includes('Giá vốn'); }) || '';
              var cost = parseNum(row[costKey]);
              if (cost > 0) allEntries.set(sku, { sku: sku, name: name, cost: cost });
            });
          } else {
            rows.forEach(function(row) {
              var sku = String(row['Seller SKU'] || '').trim();
              if (!sku || sku === 'null') return;
              var name = String(row['Variation'] || row['Product Name'] || '').trim();
              var colKeys = Object.keys(row);
              var costVal = 0;
              for (var i = 0; i < colKeys.length; i++) {
                var v = row[colKeys[i]];
                if (typeof v === 'number' && v > 100 && colKeys[i] !== 'SKU ID') { costVal = Math.round(v); break; }
              }
              if (costVal <= 0) {
                var emptyKey = colKeys.find(function(k) { return k.trim() === '' || k === '__EMPTY'; });
                if (emptyKey) costVal = parseNum(row[emptyKey]);
              }
              if (costVal > 0) allEntries.set(sku, { sku: sku, name: name, cost: costVal });
            });
          }
        } catch (err) { console.error('Parse COGS error:', err); }
        processed++;
        if (processed === totalFiles) {
          var result = Array.from(allEntries.values());
          saveCogs(result);
          setUploadMsg('Đã cập nhật ' + result.length + ' SKU giá vốn');
          setUploading(false);
        }
      };
      reader.readAsArrayBuffer(file);
    });
    e.target.value = '';
  }

  function handleOrderUpload(e: React.ChangeEvent<HTMLInputElement>) {
    var files = e.target.files;
    if (!files || files.length === 0 || !selectedShopId) return;
    setOrderUploading(true);
    setOrderMsg('');

    var shop = shops.find(function(s) { return s.id === selectedShopId; });
    if (!shop) { setOrderUploading(false); return; }

    var processed = 0;
    var totalFiles = files.length;
    var newImports: PnlImport[] = [];

    Array.from(files).forEach(function(file) {
      var reader = new FileReader();
      reader.onload = function(ev) {
        try {
          var data = new Uint8Array(ev.target?.result as ArrayBuffer);
          var wb = XLSX.read(data, { type: 'array' });
          var ws = wb.Sheets[wb.SheetNames[0]];
          var rows = normalizeKeys(XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[]);
          var h0 = (Object.keys(rows[0] || {})[0] || '').trim();
          var isShopee = h0 === 'Mã đơn hàng';

          var dailyMap = new Map<string, { revenue: number; cogs: number; platformFee: number; adSpend: number; skuDetails: { sku: string; qty: number; revenue: number; cogs: number; fee: number }[] }>();
          var orderSeen = new Set<string>();

          rows.forEach(function(row) {
            var orderId: string;
            var date: string | null;
            var isCancelled: boolean;
            var lineRevenue: number;
            var lineFee: number;
            var sku: string;
            var qty: number;

            if (isShopee) {
              orderId = String(row['Mã đơn hàng'] || '').trim();
              if (!orderId) return;
              date = extractDateShopee(String(row['Ngày đặt hàng'] || ''));
              if (!date) return;
              var status = String(row['Trạng Thái Đơn Hàng'] || '').trim();
              isCancelled = status.indexOf('hủy') >= 0 || status.indexOf('Hủy') >= 0;
              if (isCancelled) return;

              var giaUuDai = parseNum(row['Giá ưu đãi']);
              qty = parseNum(row['Số lượng']) || 1;
              if (giaUuDai > 0) {
                lineRevenue = giaUuDai * qty;
              } else {
                var tongGiaBan = parseNum(row['Tổng giá bán (sản phẩm)']);
                lineRevenue = tongGiaBan > 0 ? tongGiaBan : 0;
              }
              if (!orderSeen.has(orderId)) {
                lineFee = parseNum(row['Phí cố định']) + parseNum(row['Phí Dịch Vụ']) + parseNum(row['Phí xử lý giao dịch']);
              } else {
                lineFee = 0;
              }
              sku = String(row['SKU phân loại hàng'] || '').trim();
            } else {
              orderId = String(row['Order ID'] || '').trim();
              if (!orderId) return;
              date = extractDateTikTok(String(row['Created Time'] || ''));
              if (!date) return;
              var tiktokStatus = String(row['Order Status'] || '').trim().toLowerCase();
              var cancelType = String(row['Cancelation/Return Type'] || '').trim();
              isCancelled = tiktokStatus === 'canceled' || tiktokStatus.indexOf('hủy') >= 0 || cancelType === 'Cancel';
              if (isCancelled) return;

              lineRevenue = parseNum(row['SKU Subtotal After Discount']) + parseNum(row['SKU Platform Discount']);
              qty = parseNum(row['Quantity']) || 1;
              sku = String(row['Seller SKU'] || '').trim();

              var feeRate = pnlConfig.tiktokFeeRate / 100;
              lineFee = Math.round(lineRevenue * feeRate);
            }

            if (!orderSeen.has(orderId)) orderSeen.add(orderId);

            var dayData = dailyMap.get(date) || { revenue: 0, cogs: 0, platformFee: 0, adSpend: 0, skuDetails: [] };
            dayData.revenue += lineRevenue;
            dayData.platformFee += lineFee;

            var skuCogs = 0;
            if (sku) {
              var unitCost = cogsMap.get(sku) || 0;
              skuCogs = unitCost * qty;
              dayData.cogs += skuCogs;
              dayData.skuDetails.push({ sku: sku, qty: qty, revenue: lineRevenue, cogs: skuCogs, fee: lineFee });
            }

            dailyMap.set(date, dayData);
          });

          var adMap = new Map<string, number>();
          reports.filter(function(r) { return r.shopId === selectedShopId; }).forEach(function(r) {
            adMap.set(r.date, r.adSpend);
          });

          var dailyDataArr: PnlDailyData[] = [];
          var dates = Array.from(dailyMap.keys()).sort();
          dates.forEach(function(d) {
            var dd = dailyMap.get(d)!;
            dd.adSpend = adMap.get(d) || 0;
            dailyDataArr.push({ date: d, revenue: dd.revenue, cogs: dd.cogs, platformFee: dd.platformFee, adSpend: dd.adSpend, skuDetails: dd.skuDetails });
          });

          if (dailyDataArr.length > 0) {
            newImports.push({
              id: 'pnl-' + selectedShopId + '-' + dates[0] + '-' + Date.now(),
              shopId: selectedShopId,
              shopName: shop!.name,
              channel: shop!.channel,
              dateFrom: dates[0],
              dateTo: dates[dates.length - 1],
              dailyData: dailyDataArr,
              importedAt: new Date().toISOString(),
            });
          }
        } catch (err) { console.error('Parse order error:', err); }

        processed++;
        if (processed === totalFiles) {
          if (newImports.length > 0) {
            var existing = pnlImports.filter(function(imp) {
              return !newImports.some(function(ni) {
                return ni.shopId === imp.shopId && !(ni.dateTo < imp.dateFrom || ni.dateFrom > imp.dateTo);
              });
            });
            var merged = existing.concat(newImports);
            savePnlImports(merged);
            var totalDays = newImports.reduce(function(s, i) { return s + i.dailyData.length; }, 0);
            setOrderMsg('Đã import ' + newImports.length + ' file, ' + totalDays + ' ngày dữ liệu PnL');
          }
          setOrderUploading(false);
        }
      };
      reader.readAsArrayBuffer(file);
    });
    e.target.value = '';
  }

  function handleDeleteImport(id: string) {
    var filtered = pnlImports.filter(function(imp) { return imp.id !== id; });
    savePnlImports(filtered);
  }

  function handleSaveFees() {
    savePnlConfig({ shopeeFeeRate: parseFloat(shopeeRate) || 34, tiktokFeeRate: parseFloat(tiktokRate) || 34, opexRate: parseFloat(opexRate) || 16 });
    setEditFees(false);
  }

  function fmtDate(d: Date): string {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function setQuickRange(type: 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'last3Months') {
    var now = new Date();
    if (type === 'yesterday') {
      var yd = new Date(now); yd.setDate(yd.getDate() - 1);
      setDateFrom(fmtDate(yd)); setDateTo(fmtDate(yd));
    } else if (type === 'thisWeek') {
      var day = now.getDay(); var diff = day === 0 ? 6 : day - 1;
      var mon = new Date(now); mon.setDate(mon.getDate() - diff);
      setDateFrom(fmtDate(mon)); setDateTo(fmtDate(now));
    } else if (type === 'lastWeek') {
      var day2 = now.getDay(); var diff2 = day2 === 0 ? 6 : day2 - 1;
      var thisMon = new Date(now); thisMon.setDate(thisMon.getDate() - diff2);
      var lastMon = new Date(thisMon); lastMon.setDate(lastMon.getDate() - 7);
      var lastSun = new Date(thisMon); lastSun.setDate(lastSun.getDate() - 1);
      setDateFrom(fmtDate(lastMon)); setDateTo(fmtDate(lastSun));
    } else if (type === 'thisMonth') { setDateFrom(getMonthStart(now)); setDateTo(getMonthEnd(now)); }
    else if (type === 'lastMonth') { var prev = new Date(now.getFullYear(), now.getMonth() - 1, 1); setDateFrom(getMonthStart(prev)); setDateTo(getMonthEnd(prev)); }
    else { var prev3 = new Date(now.getFullYear(), now.getMonth() - 2, 1); setDateFrom(getMonthStart(prev3)); setDateTo(getMonthEnd(now)); }
  }

  if (!currentUser || currentUser.role !== 'admin') {
    return <div className="p-6 text-center"><p className="text-red-400">Bạn không có quyền truy cập trang này.</p></div>;
  }

  var profitMargin = totals.revenue > 0 ? (totals.profit / totals.revenue * 100) : 0;
  var cogsRatio = totals.revenue > 0 ? (totals.cogs / totals.revenue * 100) : 0;
  var feeRatio = totals.revenue > 0 ? (totals.platformFee / totals.revenue * 100) : 0;
  var adRatio = totals.revenue > 0 ? (totals.adSpend / totals.revenue * 100) : 0;
  var opexRatio = totals.revenue > 0 ? (totals.opex / totals.revenue * 100) : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Lãi lỗ (PnL)</h1>
          <p className="text-sm text-gray-500 mt-1">Doanh thu - Giá vốn - Phí sàn - QC (đã VAT) - Vận hành ({pnlConfig.opexRate}%) = Lợi nhuận</p>
        </div>
      </div>

      {/* Upload area */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* COGS upload */}
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium text-gray-200">1. File giá vốn</p>
              <p className="text-xs text-gray-500">Upload file xlsx giá vốn Shopee/TikTok</p>
            </div>
            <input ref={cogsFileRef} type="file" accept=".xlsx,.xls" multiple onChange={handleCogsUpload} className="hidden" />
            <button onClick={function() { cogsFileRef.current?.click(); }} disabled={uploading}
              className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors">
              {uploading ? 'Đang xử lý...' : 'Tải giá vốn'}
            </button>
          </div>
          {cogsEntries.length > 0 && <p className="text-xs text-emerald-400">{cogsEntries.length} SKU đã có giá vốn</p>}
          {uploadMsg && <p className="text-xs text-emerald-400 mt-1">{uploadMsg}</p>}
        </div>

        {/* Order file upload */}
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium text-gray-200">2. File đơn hàng</p>
              <p className="text-xs text-gray-500">Phí sàn Shopee lấy từ file, TikTok dùng {pnlConfig.tiktokFeeRate}%</p>
            </div>
            <input ref={orderFileRef} type="file" accept=".xlsx,.xls" multiple onChange={handleOrderUpload} className="hidden" />
            <button
              onClick={function() { if (selectedShopId) orderFileRef.current?.click(); else alert('Chọn shop trước'); }}
              disabled={orderUploading || !selectedShopId}
              className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors">
              {orderUploading ? 'Đang xử lý...' : 'Tải đơn hàng'}
            </button>
          </div>
          <select value={selectedShopId} onChange={function(e) { setSelectedShopId(e.target.value); }}
            className="w-full px-3 py-1.5 text-xs border border-slate-600 rounded-lg bg-slate-800 text-gray-200 mt-1">
            <option value="">-- Chọn shop --</option>
            {shops.map(function(s) { return <option key={s.id} value={s.id}>{s.name} ({s.channel})</option>; })}
          </select>
          {orderMsg && <p className="text-xs text-blue-400 mt-1">{orderMsg}</p>}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={filterShop} onChange={function(e) { setFilterShop(e.target.value); }}
          className="px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-200">
          <option value="all">Tất cả shop</option>
          {shops.map(function(s) { return <option key={s.id} value={s.id}>{s.name}</option>; })}
        </select>
        <select value={filterChannel} onChange={function(e) { setFilterChannel(e.target.value as 'all' | 'Shopee' | 'TikTok'); }}
          className="px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-200">
          <option value="all">Tất cả kênh</option>
          <option value="Shopee">Shopee</option>
          <option value="TikTok">TikTok</option>
        </select>
        <div className="flex items-center gap-1.5 border border-slate-600 rounded-lg px-3 py-2 bg-slate-800">
          <input type="date" value={dateFrom} onChange={function(e) { setDateFrom(e.target.value); if (e.target.value > dateTo) setDateTo(e.target.value); }}
            className="text-sm outline-none bg-transparent text-gray-200" />
          <span className="text-gray-500 text-xs">&rarr;</span>
          <input type="date" value={dateTo} onChange={function(e) { setDateTo(e.target.value); if (e.target.value < dateFrom) setDateFrom(e.target.value); }}
            className="text-sm outline-none bg-transparent text-gray-200" />
        </div>
      </div>

      {/* Quick date + Fee config */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="text-xs text-gray-500">Nhanh:</span>
        <button onClick={function() { setQuickRange('yesterday'); }} className="px-3 py-1 text-xs rounded-lg bg-slate-800 text-gray-300 hover:bg-slate-700 border border-slate-700 transition-colors">Hôm qua</button>
        <button onClick={function() { setQuickRange('thisWeek'); }} className="px-3 py-1 text-xs rounded-lg bg-slate-800 text-gray-300 hover:bg-slate-700 border border-slate-700 transition-colors">Tuần này</button>
        <button onClick={function() { setQuickRange('lastWeek'); }} className="px-3 py-1 text-xs rounded-lg bg-slate-800 text-gray-300 hover:bg-slate-700 border border-slate-700 transition-colors">Tuần trước</button>
        <button onClick={function() { setQuickRange('thisMonth'); }} className="px-3 py-1 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 border border-blue-500 transition-colors font-medium">Tháng này</button>
        <button onClick={function() { setQuickRange('lastMonth'); }} className="px-3 py-1 text-xs rounded-lg bg-slate-800 text-gray-300 hover:bg-slate-700 border border-slate-700 transition-colors">Tháng trước</button>
        <button onClick={function() { setQuickRange('last3Months'); }} className="px-3 py-1 text-xs rounded-lg bg-slate-800 text-gray-300 hover:bg-slate-700 border border-slate-700 transition-colors">3 tháng</button>
        <span className="mx-2 text-slate-700">|</span>
        {!editFees ? (
          <button onClick={function() { setEditFees(true); setShopeeRate(String(pnlConfig.shopeeFeeRate)); setTiktokRate(String(pnlConfig.tiktokFeeRate)); setOpexRate(String(pnlConfig.opexRate)); }}
            className="px-3 py-1 text-xs rounded-lg bg-slate-800 text-gray-300 hover:bg-slate-700 border border-slate-700 transition-colors">
            Shopee: {pnlConfig.shopeeFeeRate}% | TikTok: {pnlConfig.tiktokFeeRate}% | Vận hành: {pnlConfig.opexRate}%
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">Shopee</span>
            <input type="number" value={shopeeRate} onChange={function(e) { setShopeeRate(e.target.value); }}
              className="w-16 px-2 py-1 text-xs rounded bg-slate-800 border border-slate-600 text-gray-200" step="0.5" />
            <span className="text-xs text-gray-500">%</span>
            <span className="text-xs text-gray-400 ml-2">TikTok</span>
            <input type="number" value={tiktokRate} onChange={function(e) { setTiktokRate(e.target.value); }}
              className="w-16 px-2 py-1 text-xs rounded bg-slate-800 border border-slate-600 text-gray-200" step="0.5" />
            <span className="text-xs text-gray-500">%</span>
            <span className="text-xs text-gray-400 ml-2">Vận hành</span>
            <input type="number" value={opexRate} onChange={function(e) { setOpexRate(e.target.value); }}
              className="w-16 px-2 py-1 text-xs rounded bg-slate-800 border border-slate-600 text-gray-200" step="1" />
            <span className="text-xs text-gray-500">%</span>
            <button onClick={handleSaveFees} className="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-500">Lưu</button>
            <button onClick={function() { setEditFees(false); }} className="px-2 py-1 text-xs rounded bg-slate-700 text-gray-300 hover:bg-slate-600">Hủy</button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {pnlRows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Doanh thu</p>
            <p className="text-xl font-bold text-blue-400">{fmt(totals.revenue)}</p>
          </div>
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Giá vốn (COGS)</p>
            <p className="text-xl font-bold text-amber-400">{fmt(totals.cogs)}</p>
            {totals.revenue > 0 && <p className="text-xs text-gray-500 mt-1">{pct(cogsRatio)} DT</p>}
          </div>
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Phí sàn</p>
            <p className="text-xl font-bold text-orange-400">{fmt(totals.platformFee)}</p>
            {totals.revenue > 0 && <p className="text-xs text-gray-500 mt-1">{pct(feeRatio)} DT</p>}
          </div>
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">QC (đã VAT)</p>
            <p className="text-xl font-bold text-pink-400">{fmt(totals.adSpend)}</p>
            {totals.revenue > 0 && <p className="text-xs text-gray-500 mt-1">{pct(adRatio)} DT</p>}
          </div>
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Vận hành ({pnlConfig.opexRate}%)</p>
            <p className="text-xl font-bold text-violet-400">{fmt(totals.opex)}</p>
            {totals.revenue > 0 && <p className="text-xs text-gray-500 mt-1">{pct(opexRatio)} DT</p>}
          </div>
          <div className={'bg-slate-900 border rounded-xl p-4 ' + (totals.profit >= 0 ? 'border-emerald-500/30' : 'border-red-500/30')}>
            <p className="text-xs text-gray-500 mb-1">Lợi nhuận</p>
            <p className={'text-xl font-bold ' + (totals.profit >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmt(totals.profit)}</p>
            {totals.revenue > 0 && <p className={'text-xs mt-1 ' + (profitMargin >= 0 ? 'text-emerald-500' : 'text-red-500')}>{pct(profitMargin)} biên LN</p>}
          </div>
        </div>
      )}

      {cogsEntries.length === 0 && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
          Chưa có dữ liệu giá vốn. Tải file giá vốn (xlsx) lên trước, sau đó tải file đơn hàng.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-700/50">
        <button onClick={function() { setActiveTab('ceo'); }}
          className={'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ' + (activeTab === 'ceo' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-gray-500 hover:text-gray-300')}>
          Tổng hợp</button>
        <button onClick={function() { setActiveTab('summary'); }}
          className={'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ' + (activeTab === 'summary' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300')}>
          Theo shop</button>
        <button onClick={function() { setActiveTab('daily'); }}
          className={'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ' + (activeTab === 'daily' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300')}>
          Theo ngày</button>
        <button onClick={function() { setActiveTab('cogs'); }}
          className={'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ' + (activeTab === 'cogs' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300')}>
          Giá vốn ({cogsEntries.length})</button>
      </div>

      {/* Tab: CEO Dashboard */}
      {activeTab === 'ceo' && (
        <div className="space-y-6">
          {pnlRows.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg mb-2">Chưa có dữ liệu PnL</p>
              <p className="text-sm">Tải file giá vốn + file đơn hàng lên để xem báo cáo CEO</p>
            </div>
          ) : (
            <>
              {/* Report Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-gray-500 tracking-widest font-bold mb-1">BÁO CÁO LỢI NHUẬN TỔNG HỢP</p>
                  <p className="text-xs text-gray-600">Kỳ đối soát: {dateFrom} → {dateTo}</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/30">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-xs text-gray-400">Phép tính đã kiểm tra</span>
                </div>
              </div>

              {/* Two Main Cards: Net Profit + CEO Insight */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Net Profit Card */}
                <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-bold text-gray-400 tracking-wider">LỢI NHUẬN RÒNG CUỐI CÙNG</p>
                    <span className={'inline-flex px-3 py-1 rounded-full text-xs font-bold ' + (profitMargin >= 0 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30')}>{pct(Math.abs(profitMargin))}</span>
                  </div>
                  <p className={'text-4xl font-extrabold tracking-tight mb-4 ' + (totals.profit >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmt(totals.profit)}</p>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/80 border border-slate-700/30">
                    <span className={'text-lg font-bold ' + (profitMargin >= 0 ? 'text-emerald-400' : 'text-red-400')}>{pct(Math.abs(profitMargin))}</span>
                    <span className="text-sm text-gray-500">biên lợi nhuận ròng</span>
                  </div>
                </div>

                {/* CEO Insight Card */}
                <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
                  <p className="text-xs font-bold text-gray-400 tracking-wider mb-4">CEO CẦN NHÌN CON SỐ CUỐI CÙNG</p>
                  <div className="space-y-3 mb-4">
                    {profitMargin >= 15 && <p className="text-sm text-gray-300 leading-relaxed">Biên lợi nhuận ròng đang ở mức tốt. Doanh nghiệp có dư địa để đầu tư mở rộng quy mô.</p>}
                    {profitMargin >= 5 && profitMargin < 15 && <p className="text-sm text-gray-300 leading-relaxed">Doanh thu cao chưa chắc lợi nhuận cao.</p>}
                    {profitMargin >= 5 && profitMargin < 15 && <p className="text-sm text-gray-300 leading-relaxed">Chỉ cần bỏ sót 3% chi phí, lợi nhuận có thể sai lệch gần một phần ba.</p>}
                    {profitMargin >= 0 && profitMargin < 5 && <p className="text-sm text-gray-300 leading-relaxed">Biên lợi nhuận rất mỏng. Mỗi phần trăm chi phí tăng thêm đều ảnh hưởng trực tiếp đến lãi ròng.</p>}
                    {profitMargin < 0 && <p className="text-sm text-gray-300 leading-relaxed">Đang kinh doanh LỖ. Chi phí vượt quá doanh thu, cần rà soát ngay từng khoản mục chi phí.</p>}
                  </div>
                  <div className="px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <p className="text-xs font-bold text-amber-400 tracking-wider">
                      {'QUYẾT ĐỊNH: ' + (profitMargin < 0 ? 'CẮT GIẢM CHI PHÍ NGAY' : profitMargin < 10 ? 'GOM ĐỦ CHI PHÍ TRƯỚC KHI SCALE' : adRatio > 15 ? 'TỐI ƯU QC TRƯỚC KHI SCALE' : 'ĐỦ ĐIỀU KIỆN ĐỂ SCALE')}
                    </p>
                  </div>
                </div>
              </div>

              {/* 4 KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center text-blue-400 text-lg font-bold">$</span>
                    <p className="text-[10px] font-bold text-gray-400 tracking-wider leading-tight">TỔNG DOANH THU</p>
                  </div>
                  <p className="text-xl lg:text-2xl font-bold text-blue-400 mb-1">{fmt(totals.revenue)}</p>
                  <p className="text-xs text-gray-500">100% doanh thu</p>
                </div>
                <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center text-orange-400 text-lg font-bold">−</span>
                    <p className="text-[10px] font-bold text-gray-400 tracking-wider leading-tight">PHÍ SÀN</p>
                  </div>
                  <p className="text-xl lg:text-2xl font-bold text-orange-400 mb-1">{fmt(totals.platformFee)}</p>
                  <p className="text-xs text-gray-500">{pct(feeRatio)} doanh thu</p>
                </div>
                <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400 text-lg font-bold">●</span>
                    <p className="text-[10px] font-bold text-gray-400 tracking-wider leading-tight">GIÁ VỐN HÀNG HÓA</p>
                  </div>
                  <p className="text-xl lg:text-2xl font-bold text-amber-400 mb-1">{fmt(totals.cogs)}</p>
                  <p className="text-xs text-gray-500">{pct(cogsRatio)} doanh thu</p>
                </div>
                <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center text-violet-400 text-lg font-bold">◻</span>
                    <p className="text-[10px] font-bold text-gray-400 tracking-wider leading-tight">CHI PHÍ VẬN HÀNH</p>
                  </div>
                  <p className="text-xl lg:text-2xl font-bold text-violet-400 mb-1">{fmt(totals.opex + totals.adSpend)}</p>
                  <p className="text-xs text-gray-500">{pct(opexRatio + adRatio)} doanh thu</p>
                </div>
              </div>

              {/* Profit Formula Bar */}
              <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5">
                <p className="text-xs font-bold text-gray-400 tracking-wider mb-4">CÔNG THỨC LỢI NHUẬN RÒNG</p>
                <div className="flex flex-wrap items-center gap-2 lg:gap-3 text-sm">
                  <span className="text-blue-400 font-semibold">{fmt(totals.revenue)}</span>
                  <span className="text-gray-600 font-bold">−</span>
                  <span className="text-orange-400 font-semibold">{fmt(totals.platformFee)}</span>
                  <span className="text-gray-600 font-bold">−</span>
                  <span className="text-pink-400 font-semibold">{fmt(totals.adSpend)}</span>
                  <span className="text-gray-600 font-bold">−</span>
                  <span className="text-amber-400 font-semibold">{fmt(totals.cogs)}</span>
                  <span className="text-gray-600 font-bold">−</span>
                  <span className="text-violet-400 font-semibold">{fmt(totals.opex)}</span>
                  <span className="text-gray-600 font-bold">=</span>
                  <span className={'px-4 py-1.5 rounded-lg border-2 font-bold text-base ' + (totals.profit >= 0 ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/5' : 'text-red-400 border-red-500/40 bg-red-500/5')}>{fmt(totals.profit)}</span>
                </div>
              </div>

              {/* Bottom: Cost Breakdown + Donut Chart */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Cost Breakdown with Bars */}
                <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6">
                  <div className="mb-5">
                    <p className="text-xs font-bold text-gray-400 tracking-wider">CHI TIẾT CÁC KHOẢN CHI PHÍ</p>
                    <p className="text-xs text-gray-600 mt-1">Nhìn rõ khoản nào đang ăn vào lợi nhuận</p>
                  </div>
                  {(function() {
                    var costItems = [
                      { label: 'Giá vốn hàng hóa', value: totals.cogs, color: 'bg-amber-500' },
                      { label: 'Phí sàn', value: totals.platformFee, color: 'bg-orange-500' },
                      { label: 'Quảng cáo (đã VAT)', value: totals.adSpend, color: 'bg-pink-500' },
                      { label: 'Vận hành • ' + pnlConfig.opexRate + '% DT', value: totals.opex, color: 'bg-violet-500' },
                    ];
                    var maxCost = Math.max.apply(null, costItems.map(function(x) { return x.value; }));
                    var totalCost = costItems.reduce(function(s, x) { return s + x.value; }, 0);
                    return (
                      <div className="space-y-5">
                        {costItems.map(function(item, i) {
                          var barW = maxCost > 0 ? Math.max(2, item.value / maxCost * 100) : 0;
                          return (
                            <div key={i}>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-sm font-medium text-gray-300">{item.label}</span>
                                <span className="text-sm font-semibold text-gray-200">{fmt(item.value)}</span>
                              </div>
                              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                                <div className={'h-full rounded-full transition-all ' + item.color} style={{ width: barW + '%' }}></div>
                              </div>
                            </div>
                          );
                        })}
                        <div className="pt-4 border-t border-slate-700/50">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500 italic">Tổng các khoản trên</span>
                            <span className="text-sm font-bold text-gray-300">= {fmt(totalCost)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Donut Chart - Revenue Structure */}
                <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6">
                  <p className="text-xs font-bold text-gray-400 tracking-wider mb-5">CƠ CẤU 100% DOANH THU</p>
                  <div className="flex flex-col items-center">
                    {(function() {
                      var R = 70;
                      var C = 2 * Math.PI * R;
                      var rawSegs = [
                        { label: 'Phí sàn', pctVal: feeRatio, color: '#f97316' },
                        { label: 'Giá vốn', pctVal: cogsRatio, color: '#f59e0b' },
                        { label: 'Vận hành', pctVal: opexRatio, color: '#8b5cf6' },
                        { label: 'QC', pctVal: adRatio, color: '#ec4899' },
                      ];
                      if (profitMargin > 0) rawSegs.push({ label: 'Lợi nhuận', pctVal: profitMargin, color: '#22c55e' });
                      var rawTotal = rawSegs.reduce(function(s, x) { return s + x.pctVal; }, 0);
                      if (rawTotal === 0) return <p className="text-sm text-gray-500">Chưa có dữ liệu</p>;
                      var gap = 100 - rawTotal;
                      if (gap > 0.5) rawSegs.push({ label: 'Điều chỉnh', pctVal: gap, color: '#ef4444' });
                      var finalTotal = rawSegs.reduce(function(s, x) { return s + x.pctVal; }, 0);
                      var segs = Math.abs(finalTotal - 100) > 1 ? rawSegs.map(function(s) { return { label: s.label, pctVal: s.pctVal / finalTotal * 100, color: s.color }; }) : rawSegs;
                      var offset = 0;
                      return (
                        <div className="flex flex-col items-center">
                          <svg viewBox="0 0 200 200" className="w-48 h-48 mb-5">
                            {segs.map(function(seg, i) {
                              var arc = seg.pctVal / 100 * C;
                              var dashArr = arc + ' ' + (C - arc);
                              var curOffset = offset;
                              offset += arc;
                              return <circle key={i} cx="100" cy="100" r={R} fill="none" stroke={seg.color} strokeWidth="28" strokeDasharray={dashArr} strokeDashoffset={-curOffset} style={{ transform: 'rotate(-90deg)', transformOrigin: '100px 100px' }} />;
                            })}
                            <text x="100" y="90" textAnchor="middle" fill="#94a3b8" fontSize="11" fontWeight="600">LỢI NHUẬN</text>
                            <text x="100" y="118" textAnchor="middle" fill={profitMargin >= 0 ? '#22c55e' : '#ef4444'} fontSize="26" fontWeight="700">{pct(Math.abs(profitMargin))}</text>
                          </svg>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                            {segs.map(function(seg, i) {
                              return (
                                <div key={i} className="flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }}></span>
                                  <span className="text-xs text-gray-400">{seg.label + ' ' + seg.pctVal.toFixed(1) + '%'}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="mt-5 pt-3 border-t border-slate-700/50 text-center">
                    <p className="text-[10px] font-bold text-gray-500 tracking-[0.2em]">MỘT MÀN HÌNH • MỘT QUYẾT ĐỊNH</p>
                  </div>
                </div>
              </div>

              {/* Shop Summary Table */}
              {shopSummary.length > 0 && (
                <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-700/50">
                    <p className="text-xs font-bold text-gray-400 tracking-wider">BÁO CÁO THEO SHOP</p>
                    <p className="text-xs text-gray-600 mt-1">Chi tiết doanh thu - chi phí - lợi nhuận từng shop</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-800/60 border-b border-slate-700/50">
                          <th className="text-left px-4 py-3 font-medium text-gray-400">Shop</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-400">Kênh</th>
                          <th className="text-right px-4 py-3 font-medium text-gray-400">Doanh thu</th>
                          <th className="text-right px-4 py-3 font-medium text-gray-400">Giá vốn</th>
                          <th className="text-right px-4 py-3 font-medium text-gray-400">% GV</th>
                          <th className="text-right px-4 py-3 font-medium text-gray-400">Phí sàn</th>
                          <th className="text-right px-4 py-3 font-medium text-gray-400">% Phí sàn</th>
                          <th className="text-right px-4 py-3 font-medium text-gray-400">QC (+VAT)</th>
                          <th className="text-right px-4 py-3 font-medium text-gray-400">% QC</th>
                          <th className="text-right px-4 py-3 font-medium text-gray-400">Vận hành</th>
                          <th className="text-right px-4 py-3 font-medium text-gray-400">Lợi nhuận</th>
                          <th className="text-right px-4 py-3 font-medium text-gray-400">Biên LN</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {shopSummary.map(function(entry) {
                          var id = entry[0]; var d = entry[1];
                          var margin = d.revenue > 0 ? (d.profit / d.revenue * 100) : 0;
                          var cogsPct = d.revenue > 0 ? (d.cogs / d.revenue * 100) : 0;
                          var feePct = d.revenue > 0 ? (d.platformFee / d.revenue * 100) : 0;
                          var adPct = d.revenue > 0 ? (d.adSpend / d.revenue * 100) : 0;
                          return (
                            <tr key={id} className="hover:bg-slate-800/50">
                              <td className="px-4 py-3 font-medium text-gray-200">{d.shopName}</td>
                              <td className="px-4 py-3">
                                <span className={'inline-flex px-2 py-0.5 rounded text-xs font-medium ' + (d.channel === 'TikTok' ? 'bg-pink-500/15 text-pink-400' : 'bg-orange-500/15 text-orange-400')}>{d.channel}</span>
                              </td>
                              <td className="px-4 py-3 text-right text-blue-300">{fmt(d.revenue)}</td>
                              <td className="px-4 py-3 text-right text-amber-300">{fmt(d.cogs)}</td>
                              <td className="px-4 py-3 text-right text-xs text-amber-500">{pct(cogsPct)}</td>
                              <td className="px-4 py-3 text-right text-orange-300">{fmt(d.platformFee)}</td>
                              <td className="px-4 py-3 text-right text-xs text-orange-500">{pct(feePct)}</td>
                              <td className="px-4 py-3 text-right text-pink-300">{fmt(d.adSpend)}</td>
                              <td className="px-4 py-3 text-right text-xs text-pink-500">{pct(adPct)}</td>
                              <td className="px-4 py-3 text-right text-violet-300">{fmt(d.opex)}</td>
                              <td className={'px-4 py-3 text-right font-semibold ' + (d.profit >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmt(d.profit)}</td>
                              <td className={'px-4 py-3 text-right text-xs ' + (margin >= 0 ? 'text-emerald-500' : 'text-red-500')}>{pct(margin)}</td>
                            </tr>
                          );
                        })}
                        {shopSummary.length > 1 && (
                          <tr className="bg-slate-800/50 font-semibold">
                            <td className="px-4 py-3 text-gray-200" colSpan={2}>Tổng</td>
                            <td className="px-4 py-3 text-right text-blue-300">{fmt(totals.revenue)}</td>
                            <td className="px-4 py-3 text-right text-amber-300">{fmt(totals.cogs)}</td>
                            <td className="px-4 py-3 text-right text-xs text-amber-500">{pct(totals.revenue > 0 ? totals.cogs / totals.revenue * 100 : 0)}</td>
                            <td className="px-4 py-3 text-right text-orange-300">{fmt(totals.platformFee)}</td>
                            <td className="px-4 py-3 text-right text-xs text-orange-500">{pct(totals.revenue > 0 ? totals.platformFee / totals.revenue * 100 : 0)}</td>
                            <td className="px-4 py-3 text-right text-pink-300">{fmt(totals.adSpend)}</td>
                            <td className="px-4 py-3 text-right text-xs text-pink-500">{pct(totals.revenue > 0 ? totals.adSpend / totals.revenue * 100 : 0)}</td>
                            <td className="px-4 py-3 text-right text-violet-300">{fmt(totals.opex)}</td>
                            <td className={'px-4 py-3 text-right ' + (totals.profit >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmt(totals.profit)}</td>
                            <td className={'px-4 py-3 text-right text-xs ' + (profitMargin >= 0 ? 'text-emerald-500' : 'text-red-500')}>{pct(profitMargin)}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab: Shop Summary */}
      {activeTab === 'summary' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800/80 border-b border-slate-700/50">
                    <th className="text-left px-4 py-3 font-medium text-gray-400">Shop</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-400">Kênh</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-400">Doanh thu</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-400">Giá vốn</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-400">% GV</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-400">Phí sàn</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-400">% Phí sàn</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-400">QC (+VAT)</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-400">% QC</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-400">Vận hành</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-400">Lợi nhuận</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-400">Biên LN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {shopSummary.map(function(entry) {
                    var id = entry[0]; var d = entry[1];
                    var margin = d.revenue > 0 ? (d.profit / d.revenue * 100) : 0;
                    var cogsPct = d.revenue > 0 ? (d.cogs / d.revenue * 100) : 0;
                    var feePct = d.revenue > 0 ? (d.platformFee / d.revenue * 100) : 0;
                    var adPct = d.revenue > 0 ? (d.adSpend / d.revenue * 100) : 0;
                    return (
                      <tr key={id} className="hover:bg-slate-800/50">
                        <td className="px-4 py-3 font-medium text-gray-200">{d.shopName}</td>
                        <td className="px-4 py-3">
                          <span className={'inline-flex px-2 py-0.5 rounded text-xs font-medium ' + (d.channel === 'TikTok' ? 'bg-pink-500/15 text-pink-400' : 'bg-orange-500/15 text-orange-400')}>{d.channel}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-blue-300">{fmt(d.revenue)}</td>
                        <td className="px-4 py-3 text-right text-amber-300">{fmt(d.cogs)}</td>
                        <td className="px-4 py-3 text-right text-xs text-amber-500">{pct(cogsPct)}</td>
                        <td className="px-4 py-3 text-right text-orange-300">{fmt(d.platformFee)}</td>
                        <td className="px-4 py-3 text-right text-xs text-orange-500">{pct(feePct)}</td>
                        <td className="px-4 py-3 text-right text-pink-300">{fmt(d.adSpend)}</td>
                        <td className="px-4 py-3 text-right text-xs text-pink-500">{pct(adPct)}</td>
                        <td className="px-4 py-3 text-right text-violet-300">{fmt(d.opex)}</td>
                        <td className={'px-4 py-3 text-right font-semibold ' + (d.profit >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmt(d.profit)}</td>
                        <td className={'px-4 py-3 text-right text-xs ' + (margin >= 0 ? 'text-emerald-500' : 'text-red-500')}>{pct(margin)}</td>
                      </tr>
                    );
                  })}
                  {shopSummary.length > 1 && (
                    <tr className="bg-slate-800/50 font-semibold">
                      <td className="px-4 py-3 text-gray-200" colSpan={2}>Tổng</td>
                      <td className="px-4 py-3 text-right text-blue-300">{fmt(totals.revenue)}</td>
                      <td className="px-4 py-3 text-right text-amber-300">{fmt(totals.cogs)}</td>
                      <td className="px-4 py-3 text-right text-xs text-amber-500">{pct(totals.revenue > 0 ? totals.cogs / totals.revenue * 100 : 0)}</td>
                      <td className="px-4 py-3 text-right text-orange-300">{fmt(totals.platformFee)}</td>
                      <td className="px-4 py-3 text-right text-xs text-orange-500">{pct(totals.revenue > 0 ? totals.platformFee / totals.revenue * 100 : 0)}</td>
                      <td className="px-4 py-3 text-right text-pink-300">{fmt(totals.adSpend)}</td>
                      <td className="px-4 py-3 text-right text-xs text-pink-500">{pct(totals.revenue > 0 ? totals.adSpend / totals.revenue * 100 : 0)}</td>
                      <td className="px-4 py-3 text-right text-violet-300">{fmt(totals.opex)}</td>
                      <td className={'px-4 py-3 text-right ' + (totals.profit >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmt(totals.profit)}</td>
                      <td className={'px-4 py-3 text-right text-xs ' + (profitMargin >= 0 ? 'text-emerald-500' : 'text-red-500')}>{pct(profitMargin)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {shopSummary.length === 0 && <div className="text-center py-8 text-gray-500 text-sm">Chưa có dữ liệu. Tải file giá vốn + file đơn hàng lên để tính PnL.</div>}
          </div>

          {/* Import history */}
          {pnlImports.length > 0 && (
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-700/50">
                <h2 className="font-semibold text-gray-100 text-sm">Lịch sử import PnL</h2>
              </div>
              <div className="divide-y divide-slate-800">
                {pnlImports.map(function(imp) {
                  var totalRev = imp.dailyData.reduce(function(s, d) { return s + d.revenue; }, 0);
                  return (
                    <div key={imp.id} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className={'inline-flex px-2 py-0.5 rounded text-xs font-medium ' + (imp.channel === 'TikTok' ? 'bg-pink-500/15 text-pink-400' : 'bg-orange-500/15 text-orange-400')}>{imp.channel}</span>
                        <div>
                          <p className="text-sm text-gray-200">{imp.shopName}</p>
                          <p className="text-xs text-gray-500">{imp.dateFrom} &rarr; {imp.dateTo} | {imp.dailyData.length} ngày | DT: {fmt(totalRev)}</p>
                        </div>
                      </div>
                      <button onClick={function() { handleDeleteImport(imp.id); }}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors" title="Xoá">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Daily */}
      {activeTab === 'daily' && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800/80 border-b border-slate-700/50">
                  <th className="text-left px-4 py-3 font-medium text-gray-400">Ngày</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400">Shop</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-400">Doanh thu</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-400">Giá vốn</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-400">% GV</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-400">Phí sàn</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-400">% Phí sàn</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-400">QC (+VAT)</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-400">% QC</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-400">Vận hành</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-400">Lợi nhuận</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-400">Biên LN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {pnlRows.map(function(r, i) {
                  var margin = r.revenue > 0 ? (r.profit / r.revenue * 100) : 0;
                  var cogsPct = r.revenue > 0 ? (r.cogs / r.revenue * 100) : 0;
                  var feePct = r.revenue > 0 ? (r.platformFee / r.revenue * 100) : 0;
                  var adPct = r.revenue > 0 ? (r.adSpend / r.revenue * 100) : 0;
                  return (
                    <tr key={i} className="hover:bg-slate-800/50">
                      <td className="px-4 py-2.5 text-gray-300 text-xs">{r.date}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-gray-200 text-xs">{r.shopName}</span>
                        <span className={'ml-2 inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ' + (r.channel === 'TikTok' ? 'bg-pink-500/15 text-pink-400' : 'bg-orange-500/15 text-orange-400')}>{r.channel}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-blue-300 text-xs">{fmt(r.revenue)}</td>
                      <td className="px-4 py-2.5 text-right text-amber-300 text-xs">{fmt(r.cogs)}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-amber-500">{pct(cogsPct)}</td>
                      <td className="px-4 py-2.5 text-right text-orange-300 text-xs">{fmt(r.platformFee)}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-orange-500">{pct(feePct)}</td>
                      <td className="px-4 py-2.5 text-right text-pink-300 text-xs">{fmt(r.adSpend)}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-pink-500">{pct(adPct)}</td>
                      <td className="px-4 py-2.5 text-right text-violet-300 text-xs">{fmt(r.opex)}</td>
                      <td className={'px-4 py-2.5 text-right text-xs font-semibold ' + (r.profit >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmt(r.profit)}</td>
                      <td className={'px-4 py-2.5 text-right text-xs ' + (margin >= 0 ? 'text-emerald-500' : 'text-red-500')}>{pct(margin)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pnlRows.length === 0 && <div className="text-center py-8 text-gray-500 text-sm">Chưa có dữ liệu PnL</div>}
        </div>
      )}

      {/* Tab: COGS */}
      {activeTab === 'cogs' && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-100 text-sm">Bảng giá vốn</h2>
              <p className="text-xs text-gray-500 mt-0.5">{cogsEntries.length} SKU</p>
            </div>
            <button onClick={function() { cogsFileRef.current?.click(); }}
              className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors">Cập nhật giá vốn</button>
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-800">
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-400 w-14">#</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-400">Mã SKU</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-400">Tên</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-400">Giá vốn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {cogsEntries.map(function(entry, i) {
                  return (
                    <tr key={entry.sku} className="hover:bg-slate-800/50">
                      <td className="px-4 py-2 text-gray-500 text-xs">{i + 1}</td>
                      <td className="px-4 py-2"><code className="px-2 py-0.5 bg-slate-800 rounded text-blue-300 text-xs font-mono">{entry.sku}</code></td>
                      <td className="px-4 py-2 text-gray-300 text-xs">{entry.name}</td>
                      <td className="px-4 py-2 text-right text-amber-300 text-xs font-medium">{fmt(entry.cost)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {cogsEntries.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">Chưa có dữ liệu giá vốn</p>
              <p className="text-xs text-gray-600 mt-1">Tải file xlsx giá vốn lên để bắt đầu</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
