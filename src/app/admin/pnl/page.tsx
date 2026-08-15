'use client';

import { useState, useMemo, useRef } from 'react';
import { useAppState } from '@/lib/store';
import { CogsEntry } from '@/lib/types';
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
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.getFullYear() + '-' + String(last.getMonth() + 1).padStart(2, '0') + '-' + String(last.getDate()).padStart(2, '0');
}

function parseCogsValue(val: unknown): number {
  if (typeof val === 'number') return Math.round(val);
  if (!val) return 0;
  let str = String(val).replace(/[^\d.,]/g, '').trim();
  if (/\.\d{2}$/.test(str)) {
    str = str.replace(/,/g, '');
    return Math.max(0, Math.round(parseFloat(str)) || 0);
  }
  str = str.replace(/[.,]/g, '');
  return Math.max(0, parseInt(str) || 0);
}

export default function PnlPage() {
  const { currentUser, shops, reports, skuImports, cogsEntries, pnlConfig, saveCogs, savePnlConfig } = useAppState();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [filterShop, setFilterShop] = useState('all');
  const [filterChannel, setFilterChannel] = useState<'all' | 'Shopee' | 'TikTok'>('all');
  const [dateFrom, setDateFrom] = useState(() => getMonthStart(new Date()));
  const [dateTo, setDateTo] = useState(() => getMonthEnd(new Date()));
  const [editFees, setEditFees] = useState(false);
  const [shopeeRate, setShopeeRate] = useState(String(pnlConfig.shopeeFeeRate));
  const [tiktokRate, setTiktokRate] = useState(String(pnlConfig.tiktokFeeRate));
  const [activeTab, setActiveTab] = useState<'summary' | 'daily' | 'cogs'>('summary');

  const cogsMap = useMemo(function() {
    const m = new Map<string, number>();
    cogsEntries.forEach(function(e) { m.set(e.sku, e.cost); });
    return m;
  }, [cogsEntries]);

  const filteredShops = useMemo(function() {
    return shops.filter(function(s) {
      if (filterShop !== 'all' && s.id !== filterShop) return false;
      if (filterChannel !== 'all' && s.channel !== filterChannel) return false;
      return true;
    });
  }, [shops, filterShop, filterChannel]);

  const filteredShopIds = useMemo(function() {
    return new Set(filteredShops.map(function(s) { return s.id; }));
  }, [filteredShops]);

  const pnlRows = useMemo(function() {
    var rows: {
      date: string;
      shopId: string;
      shopName: string;
      channel: string;
      revenue: number;
      cogs: number;
      platformFee: number;
      adSpend: number;
      profit: number;
      unmatchedSkus: number;
      totalSkus: number;
    }[] = [];

    var filteredReports = reports.filter(function(r) {
      if (!filteredShopIds.has(r.shopId)) return false;
      if (dateFrom && r.date < dateFrom) return false;
      if (dateTo && r.date > dateTo) return false;
      return true;
    });

    filteredReports.forEach(function(r) {
      var shop = shops.find(function(s) { return s.id === r.shopId; });
      if (!shop) return;

      var revenue = r.actualRevenue;
      var adSpend = r.adSpend;

      var feeRate = shop.channel === 'TikTok' ? pnlConfig.tiktokFeeRate : pnlConfig.shopeeFeeRate;
      var platformFee = Math.round(revenue * feeRate / 100);

      var cogs = 0;
      var unmatchedSkus = 0;
      var totalSkus = 0;

      var skuImport = skuImports.find(function(imp) {
        return imp.shopId === r.shopId && imp.dateFrom <= r.date && imp.dateTo >= r.date;
      });

      if (skuImport && skuImport.dailySku[r.date]) {
        var skuList = skuImport.dailySku[r.date];
        totalSkus = skuList.length;
        skuList.forEach(function(sku) {
          var cost = cogsMap.get(sku);
          if (cost !== undefined) {
            cogs += cost;
          } else {
            unmatchedSkus++;
          }
        });
      }

      var profit = revenue - cogs - platformFee - adSpend;

      rows.push({
        date: r.date,
        shopId: r.shopId,
        shopName: shop.name,
        channel: shop.channel,
        revenue: revenue,
        cogs: cogs,
        platformFee: platformFee,
        adSpend: adSpend,
        profit: profit,
        unmatchedSkus: unmatchedSkus,
        totalSkus: totalSkus,
      });
    });

    rows.sort(function(a, b) { return a.date.localeCompare(b.date) || a.shopName.localeCompare(b.shopName); });
    return rows;
  }, [reports, shops, skuImports, cogsMap, filteredShopIds, dateFrom, dateTo, pnlConfig]);

  var totals = useMemo(function() {
    var t = { revenue: 0, cogs: 0, platformFee: 0, adSpend: 0, profit: 0, unmatchedSkus: 0, totalSkus: 0 };
    pnlRows.forEach(function(r) {
      t.revenue += r.revenue;
      t.cogs += r.cogs;
      t.platformFee += r.platformFee;
      t.adSpend += r.adSpend;
      t.profit += r.profit;
      t.unmatchedSkus += r.unmatchedSkus;
      t.totalSkus += r.totalSkus;
    });
    return t;
  }, [pnlRows]);

  var shopSummary = useMemo(function() {
    var map = new Map<string, { shopName: string; channel: string; revenue: number; cogs: number; platformFee: number; adSpend: number; profit: number }>();
    pnlRows.forEach(function(r) {
      var existing = map.get(r.shopId) || { shopName: r.shopName, channel: r.channel, revenue: 0, cogs: 0, platformFee: 0, adSpend: 0, profit: 0 };
      existing.revenue += r.revenue;
      existing.cogs += r.cogs;
      existing.platformFee += r.platformFee;
      existing.adSpend += r.adSpend;
      existing.profit += r.profit;
      map.set(r.shopId, existing);
    });
    return Array.from(map.entries()).sort(function(a, b) { return b[1].revenue - a[1].revenue; });
  }, [pnlRows]);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    var files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadMsg('');

    var allEntries = new Map<string, CogsEntry>();
    cogsEntries.forEach(function(entry) {
      allEntries.set(entry.sku, entry);
    });

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
          var isTikTokFormat = headers.some(function(h) { return h === 'Seller SKU'; });

          if (isShopeeFormat) {
            rows.forEach(function(row) {
              var sku = String(row['SKU phân loại hàng'] || '').trim().replace(/\n/g, '');
              if (!sku) return;
              var name = String(row['Tên phân loại hàng'] || '').trim();
              var costKey = headers.find(function(h) { return h.includes('Giá vốn'); }) || '';
              var cost = parseCogsValue(row[costKey]);
              if (cost > 0) allEntries.set(sku, { sku: sku, name: name, cost: cost });
            });
          } else if (isTikTokFormat) {
            rows.forEach(function(row) {
              var sku = String(row['Seller SKU'] || '').trim();
              if (!sku || sku === 'null') return;
              var name = String(row['Variation'] || row['Product Name'] || '').trim();
              var colKeys = Object.keys(row);
              var costVal = 0;
              for (var i = 0; i < colKeys.length; i++) {
                var v = row[colKeys[i]];
                if (typeof v === 'number' && v > 100 && colKeys[i] !== 'SKU ID') {
                  costVal = Math.round(v);
                  break;
                }
              }
              if (costVal <= 0) {
                var emptyKey = colKeys.find(function(k) { return k.trim() === '' || k === '__EMPTY'; });
                if (emptyKey) costVal = parseCogsValue(row[emptyKey]);
              }
              if (costVal > 0) allEntries.set(sku, { sku: sku, name: name, cost: costVal });
            });
          }
        } catch (err) {
          console.error('Parse error:', err);
        }

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

  function handleSaveFees() {
    var sr = parseFloat(shopeeRate) || 6;
    var tr = parseFloat(tiktokRate) || 4;
    savePnlConfig({ shopeeFeeRate: sr, tiktokFeeRate: tr });
    setEditFees(false);
  }

  function setQuickRange(type: 'thisMonth' | 'lastMonth' | 'last3Months') {
    var now = new Date();
    if (type === 'thisMonth') {
      setDateFrom(getMonthStart(now));
      setDateTo(getMonthEnd(now));
    } else if (type === 'lastMonth') {
      var prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      setDateFrom(getMonthStart(prev));
      setDateTo(getMonthEnd(prev));
    } else if (type === 'last3Months') {
      var prev3 = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      setDateFrom(getMonthStart(prev3));
      setDateTo(getMonthEnd(now));
    }
  }

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="p-6 text-center">
        <p className="text-red-400">Bạn không có quyền truy cập trang này.</p>
      </div>
    );
  }

  var profitMargin = totals.revenue > 0 ? (totals.profit / totals.revenue * 100) : 0;
  var cogsRatio = totals.revenue > 0 ? (totals.cogs / totals.revenue * 100) : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Lãi lỗ (PnL)</h1>
          <p className="text-sm text-gray-500 mt-1">
            Doanh thu - Giá vốn - Phí sàn - Quảng cáo = Lợi nhuận
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={function() { fileInputRef.current?.click(); }}
            disabled={uploading}
            className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
          >
            {uploading ? 'Đang xử lý...' : 'Tải file giá vốn'}
          </button>
          {cogsEntries.length > 0 && (
            <span className="text-xs text-gray-500">{cogsEntries.length} SKU đã có giá vốn</span>
          )}
        </div>
      </div>

      {uploadMsg && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
          {uploadMsg}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={filterShop}
          onChange={function(e) { setFilterShop(e.target.value); }}
          className="px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-200"
        >
          <option value="all">Tất cả shop</option>
          {shops.map(function(s) {
            return <option key={s.id} value={s.id}>{s.name}</option>;
          })}
        </select>
        <select
          value={filterChannel}
          onChange={function(e) { setFilterChannel(e.target.value as 'all' | 'Shopee' | 'TikTok'); }}
          className="px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-200"
        >
          <option value="all">Tất cả kênh</option>
          <option value="Shopee">Shopee</option>
          <option value="TikTok">TikTok</option>
        </select>
        <div className="flex items-center gap-1.5 border border-slate-600 rounded-lg px-3 py-2 bg-slate-800">
          <input
            type="date"
            value={dateFrom}
            onChange={function(e) { setDateFrom(e.target.value); if (e.target.value > dateTo) setDateTo(e.target.value); }}
            className="text-sm outline-none bg-transparent text-gray-200"
          />
          <span className="text-gray-500 text-xs">&rarr;</span>
          <input
            type="date"
            value={dateTo}
            onChange={function(e) { setDateTo(e.target.value); if (e.target.value < dateFrom) setDateFrom(e.target.value); }}
            className="text-sm outline-none bg-transparent text-gray-200"
          />
        </div>
      </div>

      {/* Quick date + Fee config */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="text-xs text-gray-500">Nhanh:</span>
        <button onClick={function() { setQuickRange('thisMonth'); }} className="px-3 py-1 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 border border-blue-500 transition-colors font-medium">Tháng này</button>
        <button onClick={function() { setQuickRange('lastMonth'); }} className="px-3 py-1 text-xs rounded-lg bg-slate-800 text-gray-300 hover:bg-slate-700 border border-slate-700 transition-colors">Tháng trước</button>
        <button onClick={function() { setQuickRange('last3Months'); }} className="px-3 py-1 text-xs rounded-lg bg-slate-800 text-gray-300 hover:bg-slate-700 border border-slate-700 transition-colors">3 tháng</button>
        <span className="mx-2 text-slate-700">|</span>
        {!editFees ? (
          <button
            onClick={function() { setEditFees(true); setShopeeRate(String(pnlConfig.shopeeFeeRate)); setTiktokRate(String(pnlConfig.tiktokFeeRate)); }}
            className="px-3 py-1 text-xs rounded-lg bg-slate-800 text-gray-300 hover:bg-slate-700 border border-slate-700 transition-colors"
          >
            Phí sàn: Shopee {pnlConfig.shopeeFeeRate}% | TikTok {pnlConfig.tiktokFeeRate}%
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Shopee</span>
            <input
              type="number"
              value={shopeeRate}
              onChange={function(e) { setShopeeRate(e.target.value); }}
              className="w-16 px-2 py-1 text-xs rounded bg-slate-800 border border-slate-600 text-gray-200"
              step="0.5"
            />
            <span className="text-xs text-gray-500">%</span>
            <span className="text-xs text-gray-400 ml-2">TikTok</span>
            <input
              type="number"
              value={tiktokRate}
              onChange={function(e) { setTiktokRate(e.target.value); }}
              className="w-16 px-2 py-1 text-xs rounded bg-slate-800 border border-slate-600 text-gray-200"
              step="0.5"
            />
            <span className="text-xs text-gray-500">%</span>
            <button onClick={handleSaveFees} className="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-500">Lưu</button>
            <button onClick={function() { setEditFees(false); }} className="px-2 py-1 text-xs rounded bg-slate-700 text-gray-300 hover:bg-slate-600">Hủy</button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
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
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Quảng cáo</p>
          <p className="text-xl font-bold text-pink-400">{fmt(totals.adSpend)}</p>
        </div>
        <div className={'bg-slate-900 border rounded-xl p-4 ' + (totals.profit >= 0 ? 'border-emerald-500/30' : 'border-red-500/30')}>
          <p className="text-xs text-gray-500 mb-1">Lợi nhuận</p>
          <p className={'text-xl font-bold ' + (totals.profit >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmt(totals.profit)}</p>
          {totals.revenue > 0 && <p className={'text-xs mt-1 ' + (profitMargin >= 0 ? 'text-emerald-500' : 'text-red-500')}>{pct(profitMargin)} biên LN</p>}
        </div>
      </div>

      {/* Warning if no COGS */}
      {cogsEntries.length === 0 && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
          Chưa có dữ liệu giá vốn. Hãy tải file giá vốn (xlsx) lên để tính COGS chính xác.
        </div>
      )}

      {/* Unmatched SKU warning */}
      {totals.unmatchedSkus > 0 && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
          {totals.unmatchedSkus}/{totals.totalSkus} SKU chưa có giá vốn — COGS sẽ chưa chính xác. Tải thêm file giá vốn hoặc bổ sung SKU bị thiếu.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-700/50">
        <button
          onClick={function() { setActiveTab('summary'); }}
          className={'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ' + (activeTab === 'summary' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300')}
        >Theo shop</button>
        <button
          onClick={function() { setActiveTab('daily'); }}
          className={'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ' + (activeTab === 'daily' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300')}
        >Theo ngày</button>
        <button
          onClick={function() { setActiveTab('cogs'); }}
          className={'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ' + (activeTab === 'cogs' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300')}
        >Bảng giá vốn ({cogsEntries.length})</button>
      </div>

      {/* Tab: Shop Summary */}
      {activeTab === 'summary' && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800/80 border-b border-slate-700/50">
                  <th className="text-left px-4 py-3 font-medium text-gray-400">Shop</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400">Kênh</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-400">Doanh thu</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-400">Giá vốn</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-400">Phí sàn</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-400">QC</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-400">Lợi nhuận</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-400">Biên LN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {shopSummary.map(function(entry) {
                  var id = entry[0];
                  var d = entry[1];
                  var margin = d.revenue > 0 ? (d.profit / d.revenue * 100) : 0;
                  return (
                    <tr key={id} className="hover:bg-slate-800/50">
                      <td className="px-4 py-3 font-medium text-gray-200">{d.shopName}</td>
                      <td className="px-4 py-3">
                        <span className={'inline-flex px-2 py-0.5 rounded text-xs font-medium ' + (d.channel === 'TikTok' ? 'bg-pink-500/15 text-pink-400' : 'bg-orange-500/15 text-orange-400')}>{d.channel}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-blue-300">{fmt(d.revenue)}</td>
                      <td className="px-4 py-3 text-right text-amber-300">{fmt(d.cogs)}</td>
                      <td className="px-4 py-3 text-right text-orange-300">{fmt(d.platformFee)}</td>
                      <td className="px-4 py-3 text-right text-pink-300">{fmt(d.adSpend)}</td>
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
                    <td className="px-4 py-3 text-right text-orange-300">{fmt(totals.platformFee)}</td>
                    <td className="px-4 py-3 text-right text-pink-300">{fmt(totals.adSpend)}</td>
                    <td className={'px-4 py-3 text-right ' + (totals.profit >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmt(totals.profit)}</td>
                    <td className={'px-4 py-3 text-right text-xs ' + (profitMargin >= 0 ? 'text-emerald-500' : 'text-red-500')}>{pct(profitMargin)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {shopSummary.length === 0 && (
            <div className="text-center py-8 text-gray-500 text-sm">Không có dữ liệu trong khoảng thời gian này</div>
          )}
        </div>
      )}

      {/* Tab: Daily Detail */}
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
                  <th className="text-right px-4 py-3 font-medium text-gray-400">Phí sàn</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-400">QC</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-400">Lợi nhuận</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-400">SKU</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {pnlRows.map(function(r, i) {
                  return (
                    <tr key={i} className="hover:bg-slate-800/50">
                      <td className="px-4 py-2.5 text-gray-300 text-xs">{r.date}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-gray-200 text-xs">{r.shopName}</span>
                        <span className={'ml-2 inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ' + (r.channel === 'TikTok' ? 'bg-pink-500/15 text-pink-400' : 'bg-orange-500/15 text-orange-400')}>{r.channel}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-blue-300 text-xs">{fmt(r.revenue)}</td>
                      <td className="px-4 py-2.5 text-right text-amber-300 text-xs">{fmt(r.cogs)}</td>
                      <td className="px-4 py-2.5 text-right text-orange-300 text-xs">{fmt(r.platformFee)}</td>
                      <td className="px-4 py-2.5 text-right text-pink-300 text-xs">{fmt(r.adSpend)}</td>
                      <td className={'px-4 py-2.5 text-right text-xs font-semibold ' + (r.profit >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmt(r.profit)}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-500">
                        {r.totalSkus > 0 ? (
                          r.unmatchedSkus > 0 ? (
                            <span className="text-amber-400">{r.totalSkus - r.unmatchedSkus}/{r.totalSkus}</span>
                          ) : (
                            <span className="text-emerald-500">{r.totalSkus}</span>
                          )
                        ) : (
                          <span className="text-gray-600">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pnlRows.length === 0 && (
            <div className="text-center py-8 text-gray-500 text-sm">Không có dữ liệu trong khoảng thời gian này</div>
          )}
        </div>
      )}

      {/* Tab: COGS table */}
      {activeTab === 'cogs' && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-100 text-sm">Bảng giá vốn</h2>
              <p className="text-xs text-gray-500 mt-0.5">{cogsEntries.length} SKU</p>
            </div>
            <button
              onClick={function() { fileInputRef.current?.click(); }}
              className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
            >Cập nhật giá vốn</button>
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
                      <td className="px-4 py-2">
                        <code className="px-2 py-0.5 bg-slate-800 rounded text-blue-300 text-xs font-mono">{entry.sku}</code>
                      </td>
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
