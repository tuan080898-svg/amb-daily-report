'use client';

import { useState, useMemo, useRef } from 'react';
import { useAppState } from '@/lib/store';
import { toDateString, getDailyTarget, getTargetForDate, getDayType, formatCurrency, formatPercent } from '@/lib/utils';
import { DailyReport, Shop } from '@/lib/types';
import * as XLSX from 'xlsx';
import { aggregateProducts, ProductSummary } from '@/lib/sku';

export default function ReportFormPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Nhập báo cáo hàng ngày</h1>
        <p className="text-sm text-gray-500 mt-1">Import dữ liệu đơn hàng từ Shopee / TikTok Shop</p>
      </div>
      <FileUploadForm />
    </div>
  );
}

// ==================== STEP INDICATOR ====================

function StepIndicator({ currentStep, steps }: { currentStep: number; steps: { label: string; desc: string }[] }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((step, i) => {
        const isActive = i + 1 === currentStep;
        const isDone = i + 1 < currentStep;
        return (
          <div key={i} className="flex items-center flex-1">
            <div className="flex items-center gap-3 flex-1">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-all ${
                isDone ? 'bg-emerald-500 text-white' :
                isActive ? 'bg-blue-500 text-white ring-4 ring-blue-500/20' :
                'bg-slate-800 text-gray-500 border border-slate-600'
              }`}>
                {isDone ? (
                  <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : i + 1}
              </div>
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${isActive ? 'text-gray-100' : isDone ? 'text-emerald-400' : 'text-gray-500'}`}>{step.label}</p>
                <p className="text-xs text-gray-500 hidden md:block">{step.desc}</p>
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-px flex-1 mx-4 ${isDone ? 'bg-emerald-500' : 'bg-slate-700'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ==================== FILE UPLOAD (XLSX + CSV) ====================

type DetectedPlatform = 'shopee' | 'tiktok' | 'csv' | null;

interface DailyAgg {
  date: string;
  totalOrders: number;
  completedRevenue: number;
  cancelledOrders: number;
  returnedOrders: number;
}

interface ParsedRow {
  shopName: string;
  shopId: string;
  date: string;
  targetRevenue: number;
  actualRevenue: number;
  adSpend: number;
  totalOrders: number;
  cancelledOrders: number;
  returnedOrders: number;
  note: string;
  error?: string;
}

function FileUploadForm() {
  const { currentUser, shops, reports, monthlyPlans, monthlyKPIs, config, getUserShops, addReport, updateReport } = useAppState();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [success, setSuccess] = useState('');
  const [importing, setImporting] = useState(false);
  const [detectedPlatform, setDetectedPlatform] = useState<DetectedPlatform>(null);
  const [selectedShopId, setSelectedShopId] = useState('');
  const [rawData, setRawData] = useState<XLSX.WorkSheet | null>(null);
  const [totalRawOrders, setTotalRawOrders] = useState(0);
  const mktFileInputRef = useRef<HTMLInputElement>(null);
  const [mktFileName, setMktFileName] = useState('');
  const [mktParseError, setMktParseError] = useState('');
  const [mktDataMap, setMktDataMap] = useState<Record<string, number>>({});
  const [manualMktDateFrom, setManualMktDateFrom] = useState(toDateString(new Date()));
  const [manualMktDateTo, setManualMktDateTo] = useState(toDateString(new Date()));
  const [manualMktAmount, setManualMktAmount] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [collectedSkuByDate, setCollectedSkuByDate] = useState<Record<string, string[]>>({});

  const userShops = useMemo(function() {
    if (!currentUser) return [];
    return getUserShops(currentUser.id);
  }, [currentUser, getUserShops]);

  const currentStep = useMemo(() => {
    if (parsedRows.length > 0) return 4;
    if (rawData && detectedPlatform && selectedShopId) return 3;
    if (selectedShopId) return 2;
    return 1;
  }, [parsedRows, rawData, detectedPlatform, selectedShopId]);

  function detectPlatform(headers: string[]): DetectedPlatform {
    const h0 = (headers[0] || '').trim();
    if (h0 === 'Order ID') return 'tiktok';
    if (h0 === 'Mã đơn hàng') return 'shopee';
    return null;
  }

  function extractDateShopee(raw: string): string | null {
    if (!raw) return null;
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return match[1] + '-' + match[2] + '-' + match[3];
    return null;
  }

  function extractDateTikTok(raw: string): string | null {
    if (!raw) return null;
    const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (match) {
      return match[3] + '-' + match[2].padStart(2, '0') + '-' + match[1].padStart(2, '0');
    }
    const match2 = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match2) return match2[1] + '-' + match2[2] + '-' + match2[3];
    return null;
  }

  function parseNum(val: unknown): number {
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

  function normalizeKeys(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    return rows.map(function(row) {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(row)) {
        out[key.normalize('NFC')] = row[key];
      }
      return out;
    });
  }

  function calcLineRevenue(row: Record<string, unknown>): number {
    const giaUuDai = parseNum(row['Giá ưu đãi']);
    const soLuong = parseNum(row['Số lượng']) || 1;
    if (giaUuDai > 0) return giaUuDai * soLuong;
    const tongGiaBan = parseNum(row['Tổng giá bán (sản phẩm)']);
    if (tongGiaBan > 0) return tongGiaBan;
    return 0;
  }

  function aggregateShopee(ws: XLSX.WorkSheet): DailyAgg[] {
    const data = normalizeKeys(XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]);
    const orderSeen = new Set<string>();
    const dailyMap = new Map<string, DailyAgg>();
    const skuByDate: Record<string, string[]> = {};

    for (const row of data) {
      const orderId = String(row['Mã đơn hàng'] || '').trim();
      if (!orderId) continue;

      const dateRaw = String(row['Ngày đặt hàng'] || '');
      const date = extractDateShopee(dateRaw);
      if (!date) continue;

      const status = String(row['Trạng Thái Đơn Hàng'] || '').trim();
      const returnStatus = String(row['Trạng thái Trả hàng/Hoàn tiền'] || '').trim();
      const isCancelled = status.indexOf('hủy') >= 0 || status.indexOf('Hủy') >= 0;
      const isReturned = returnStatus.length > 0;

      const agg = dailyMap.get(date) || {
        date, totalOrders: 0, completedRevenue: 0, cancelledOrders: 0, returnedOrders: 0,
      };

      if (!isCancelled) {
        agg.completedRevenue += calcLineRevenue(row);
        const sku = String(row['SKU phân loại hàng'] || '').trim();
        if (sku) {
          if (!skuByDate[date]) skuByDate[date] = [];
          const qty = parseNum(row['Số lượng']) || 1;
          for (let i = 0; i < qty; i++) skuByDate[date].push(sku);
        }
      }

      if (!orderSeen.has(orderId)) {
        orderSeen.add(orderId);
        agg.totalOrders++;
        if (isCancelled) agg.cancelledOrders++;
        if (isReturned) agg.returnedOrders++;
      }

      dailyMap.set(date, agg);
    }

    setTotalRawOrders(orderSeen.size);
    setCollectedSkuByDate(skuByDate);
    return Array.from(dailyMap.values()).sort(function(a, b) { return a.date.localeCompare(b.date); });
  }

  function aggregateTikTok(ws: XLSX.WorkSheet): DailyAgg[] {
    const data = normalizeKeys(XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]);
    const orderSeen = new Set<string>();
    const dailyMap = new Map<string, DailyAgg>();
    const skuByDate: Record<string, string[]> = {};

    for (const row of data) {
      const orderId = String(row['Order ID'] || '').trim();
      if (!orderId) continue;

      const dateRaw = String(row['Created Time'] || '');
      const date = extractDateTikTok(dateRaw);
      if (!date) continue;

      const status = String(row['Order Status'] || '').trim();
      const cancelType = String(row['Cancelation/Return Type'] || '').trim();
      const statusLower = status.toLowerCase();
      const isCancelled = statusLower === 'canceled' || statusLower.indexOf('hủy') >= 0 || cancelType === 'Cancel';
      const isReturned = cancelType === 'Return';

      const agg = dailyMap.get(date) || {
        date, totalOrders: 0, completedRevenue: 0, cancelledOrders: 0, returnedOrders: 0,
      };

      if (!isCancelled) {
        const skuRevenue = parseNum(row['SKU Subtotal After Discount']) + parseNum(row['SKU Platform Discount']);
        agg.completedRevenue += skuRevenue;
        const sku = String(row['Seller SKU'] || '').trim();
        if (sku) {
          if (!skuByDate[date]) skuByDate[date] = [];
          const qty = parseNum(row['Quantity']) || 1;
          for (let i = 0; i < qty; i++) skuByDate[date].push(sku);
        }
      }

      if (!orderSeen.has(orderId)) {
        orderSeen.add(orderId);
        agg.totalOrders++;
        if (isCancelled) agg.cancelledOrders++;
        if (isReturned) agg.returnedOrders++;
      }

      dailyMap.set(date, agg);
    }

    setTotalRawOrders(orderSeen.size);
    setCollectedSkuByDate(skuByDate);
    return Array.from(dailyMap.values()).sort(function(a, b) { return a.date.localeCompare(b.date); });
  }

  function calcDailyTarget(dateStr: string, shopId: string, shop: Shop): number {
    const monthKey = dateStr.slice(0, 7);
    const plan = monthlyPlans.find(function(p) { return p.shopId === shopId && p.month === monthKey; });
    if (plan) return getTargetForDate(dateStr, plan);

    const kpi = monthlyKPIs.find(function(k) { return k.shopId === shopId && k.month === monthKey; });
    const monthlyTarget = kpi ? kpi.kpiAmount : shop.defaultMonthlyTarget;

    const [yearStr, monthStr] = monthKey.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    const baseDaily = getDailyTarget(monthlyTarget, year, month);

    const dayType = getDayType(dateStr);
    if (dayType === 'sale_double') return Math.round(baseDaily * 3);
    if (dayType === 'sale_fixed') return Math.round(baseDaily * 2);
    return baseDaily;
  }

  function resolveMktMap(costMap: Record<string, number>, orderDates: string[]): Record<string, number> {
    const total = Object.values(costMap).reduce(function(a, b) { return a + b; }, 0);
    if (total <= 0 || orderDates.length === 0) return costMap;
    const hasMatch = Object.keys(costMap).some(function(d) { return orderDates.includes(d); });
    if (hasMatch) return costMap;
    const perDay = Math.round(total / orderDates.length);
    const distributed: Record<string, number> = {};
    orderDates.forEach(function(d) { distributed[d] = perDay; });
    return distributed;
  }

  function buildParsedRows(aggs: DailyAgg[], shopId: string, overrideMkt?: Record<string, number>): ParsedRow[] {
    const shop = shops.find(function(s) { return s.id === shopId; });
    if (!shop) return [];

    const costMap = overrideMkt || mktDataMap;
    const effectiveMkt = resolveMktMap(costMap, aggs.map(function(a) { return a.date; }));

    return aggs.map(function(agg) {
      const target = calcDailyTarget(agg.date, shopId, shop);
      const adCost = effectiveMkt[agg.date] || 0;

      return {
        shopName: shop.name,
        shopId: shopId,
        date: agg.date,
        targetRevenue: target,
        actualRevenue: agg.completedRevenue,
        adSpend: adCost,
        totalOrders: agg.totalOrders,
        cancelledOrders: agg.cancelledOrders,
        returnedOrders: agg.returnedOrders,
        note: '',
        error: agg.completedRevenue <= 0 ? 'Không có doanh thu' : undefined,
      };
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParseError('');
    setSuccess('');
    setParsedRows([]);
    setDetectedPlatform(null);
    setRawData(null);
    setTotalRawOrders(0);
    setCollectedSkuByDate({});

    const reader = new FileReader();
    reader.onload = function(evt) {
      try {
        const arrayBuffer = evt.target?.result as ArrayBuffer;
        const wb = XLSX.read(arrayBuffer, { type: 'array' });

        let ws: XLSX.WorkSheet | undefined;
        let platform: DetectedPlatform = null;

        if (wb.SheetNames.includes('OrderSKUList')) {
          ws = wb.Sheets['OrderSKUList'];
          platform = 'tiktok';
        } else {
          ws = wb.Sheets[wb.SheetNames[0]];
          const jsonData = normalizeKeys(XLSX.utils.sheet_to_json(ws, { range: 0 }) as Record<string, unknown>[]);
          if (jsonData.length > 0) {
            const headers = Object.keys(jsonData[0]);
            platform = detectPlatform(headers);
          }
        }

        if (!ws || !platform) {
          setParseError('Không nhận diện được định dạng file. Hỗ trợ file đơn hàng từ Shopee (header tiếng Việt) hoặc TikTok (header tiếng Anh).');
          return;
        }

        const checkData: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws);
        if (checkData.length === 0) {
          setParseError('File không có dữ liệu');
          return;
        }

        setDetectedPlatform(platform);
        setRawData(ws);

        if (selectedShopId) {
          processWithShop(ws, platform, selectedShopId);
        }
      } catch (err) {
        setParseError('Lỗi đọc file: ' + String(err));
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function processWithShop(ws: XLSX.WorkSheet, platform: DetectedPlatform, shopId: string) {
    if (!platform || !ws) return;
    const aggs = platform === 'shopee' ? aggregateShopee(ws) : aggregateTikTok(ws);
    const rows = buildParsedRows(aggs, shopId);
    setParsedRows(rows);
  }

  function handleShopChange(shopId: string) {
    setSelectedShopId(shopId);
    if (rawData && detectedPlatform) {
      processWithShop(rawData, detectedPlatform, shopId);
    }
  }

  function handleMktFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMktFileName(file.name);
    setMktParseError('');
    setMktDataMap({});

    const reader = new FileReader();
    reader.onload = function(evt) {
      try {
        const text = evt.target?.result as string;
        const lines = text.split(/\r?\n/).filter(function(l) { return l.trim().length > 0; });

        let headerDateStart = '';
        let headerDateEnd = '';
        const dailyCosts: Record<string, number> = {};
        let totalCost = 0;
        let inData = false;
        let dateColIdx = -1;
        let hasPerRowDate = false;

        for (const line of lines) {
          if (!inData) {
            const rangeMatch = line.match(/Khoảng thời gian:\s*,?\s*(\d{2})\/(\d{2})\/(\d{4})\s*-{1,2}\s*(\d{2})\/(\d{2})\/(\d{4})/);
            if (rangeMatch) {
              headerDateStart = rangeMatch[3] + '-' + rangeMatch[2] + '-' + rangeMatch[1];
              headerDateEnd = rangeMatch[6] + '-' + rangeMatch[5] + '-' + rangeMatch[4];
            } else {
              const singleMatch = line.match(/Khoảng thời gian:\s*,?\s*(\d{2})\/(\d{2})\/(\d{4})/);
              if (singleMatch) {
                headerDateStart = singleMatch[3] + '-' + singleMatch[2] + '-' + singleMatch[1];
                headerDateEnd = headerDateStart;
              }
            }
            if (line.startsWith('Thứ tự,') || line.startsWith('Thứ tự\t')) {
              inData = true;
              const headerCols = line.split(',').map(function(c) { return c.trim().toLowerCase(); });
              dateColIdx = headerCols.findIndex(function(c) {
                return c === 'ngày' || c === 'date' || c === 'ngay' || c === 'thời gian' || c === 'thoi gian';
              });
            }
            continue;
          }

          const cols = line.split(',');
          if (cols.length < 4) continue;

          let rowDate = '';
          if (dateColIdx >= 0 && cols[dateColIdx]) {
            const raw = cols[dateColIdx].trim();
            const dm = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
            if (dm) { rowDate = dm[3] + '-' + dm[2] + '-' + dm[1]; hasPerRowDate = true; }
            const ymd = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
            if (ymd) { rowDate = ymd[0]; hasPerRowDate = true; }
          }

          const amountRaw = cols[3].trim();
          const amount = parseInt(amountRaw.replace(/[^\d-]/g, '')) || 0;

          if (amount < 0) {
            const absAmount = Math.abs(amount);
            if (rowDate) {
              dailyCosts[rowDate] = (dailyCosts[rowDate] || 0) + absAmount;
            }
            totalCost += absAmount;
          }
        }

        if (!headerDateStart && Object.keys(dailyCosts).length === 0) {
          setMktParseError('Không tìm thấy ngày trong file');
          return;
        }
        if (totalCost <= 0) {
          setMktParseError('Không tìm thấy chi phí quảng cáo trong file');
          return;
        }

        if (!hasPerRowDate && headerDateStart) {
          const allDays: string[] = [];
          const d = new Date(headerDateStart);
          const end = new Date(headerDateEnd || headerDateStart);
          while (d <= end) {
            allDays.push(d.toISOString().slice(0, 10));
            d.setDate(d.getDate() + 1);
          }
          if (allDays.length === 0) allDays.push(headerDateStart);
          const perDay = Math.round(totalCost / allDays.length);
          allDays.forEach(function(day) { dailyCosts[day] = perDay; });
        }

        setMktDataMap(dailyCosts);
        if (rawData && detectedPlatform && selectedShopId) {
          const aggs = detectedPlatform === 'shopee' ? aggregateShopee(rawData) : aggregateTikTok(rawData);
          const rows = buildParsedRows(aggs, selectedShopId, dailyCosts);
          setParsedRows(rows);
        }
      } catch (err) {
        setMktParseError('Lỗi đọc file: ' + String(err));
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  function handleManualMktApply() {
    const amount = parseInt(manualMktAmount) || 0;
    if (!manualMktDateFrom || amount <= 0) return;
    const dateTo = manualMktDateTo || manualMktDateFrom;
    const days: string[] = [];
    const d = new Date(manualMktDateFrom);
    const end = new Date(dateTo);
    while (d <= end) {
      days.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
    if (days.length === 0) days.push(manualMktDateFrom);
    const perDay = Math.round(amount / days.length);
    const newMap: Record<string, number> = {};
    days.forEach(function(day) { newMap[day] = perDay; });
    setMktDataMap(newMap);
    setMktFileName('');
    setMktParseError('');
    if (mktFileInputRef.current) mktFileInputRef.current.value = '';
    if (rawData && detectedPlatform && selectedShopId) {
      const aggs = detectedPlatform === 'shopee' ? aggregateShopee(rawData) : aggregateTikTok(rawData);
      const rows = buildParsedRows(aggs, selectedShopId, newMap);
      setParsedRows(rows);
    }
  }

  function handleImport() {
    if (!currentUser) return;
    setImporting(true);

    const validRows = parsedRows.filter(function(r) { return !r.error; });
    let added = 0;
    let updated = 0;

    for (const row of validRows) {
      const existing = reports.find(function(r) {
        return r.shopId === row.shopId && r.date === row.date;
      });

      const report: DailyReport = {
        id: existing?.id || ('r-' + row.shopId + '-' + row.date),
        date: row.date,
        shopId: row.shopId,
        targetRevenue: row.targetRevenue,
        actualRevenue: row.actualRevenue,
        adSpend: row.adSpend > 0 ? row.adSpend : (existing?.adSpend || 0),
        totalOrders: row.totalOrders,
        cancelledOrders: row.cancelledOrders,
        returnedOrders: row.returnedOrders,
        note: row.note,
        createdBy: currentUser.id,
        createdAt: existing?.createdAt || new Date().toISOString(),
      };

      if (existing) {
        updateReport(report);
        updated++;
      } else {
        addReport(report);
        added++;
      }
    }

    const mktDates = Object.keys(mktDataMap);
    if (mktDates.length > 0 && selectedShopId && validRows.length === 0) {
      for (const mktDate of mktDates) {
        const existing = reports.find(function(r) {
          return r.shopId === selectedShopId && r.date === mktDate;
        });
        if (existing) {
          updateReport({ ...existing, adSpend: mktDataMap[mktDate] });
          updated++;
        }
      }
    }

    const skuDates = Object.keys(collectedSkuByDate);
    if (skuDates.length > 0 && selectedShopId && validRows.length > 0) {
      const shop = shops.find(function(s) { return s.id === selectedShopId; });
      const sortedDates = skuDates.sort();
      const entry = {
        shopId: selectedShopId,
        shopName: shop?.name || selectedShopId,
        dateFrom: sortedDates[0],
        dateTo: sortedDates[sortedDates.length - 1],
        dailySku: collectedSkuByDate,
        importedAt: new Date().toISOString(),
      };
      try {
        const existing = JSON.parse(localStorage.getItem('amb_sku_imports') || '[]');
        const filtered = existing.filter(function(e: { shopId: string; dateFrom: string; dateTo: string }) {
          if (e.shopId !== entry.shopId) return true;
          return e.dateTo < entry.dateFrom || e.dateFrom > entry.dateTo;
        });
        filtered.push(entry);
        localStorage.setItem('amb_sku_imports', JSON.stringify(filtered));
      } catch (_) {}
    }

    const totalSkuCount = Object.values(collectedSkuByDate).reduce(function(s, arr) { return s + arr.length; }, 0);
    const mktTotal = Object.values(mktDataMap).reduce(function(a, b) { return a + b; }, 0);
    const parts: string[] = [];
    if (added > 0) parts.push(added + ' báo cáo mới');
    if (updated > 0) parts.push('cập nhật ' + updated + ' báo cáo');
    if (mktTotal > 0) parts.push('CP QC ' + formatCurrency(mktTotal));
    if (totalSkuCount > 0) parts.push(totalSkuCount + ' SKU');
    setSuccess('Đã import: ' + parts.join(', '));

    setParsedRows([]);
    setFileName('');
    setImporting(false);
    setDetectedPlatform(null);
    setRawData(null);
    setTotalRawOrders(0);
    setCollectedSkuByDate({});
    setMktFileName('');
    setMktDataMap({});
    setManualMktAmount('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (mktFileInputRef.current) mktFileInputRef.current.value = '';
    setTimeout(function() { setSuccess(''); }, 5000);
  }

  const validCount = parsedRows.filter(function(r) { return !r.error; }).length;
  const errorCount = parsedRows.filter(function(r) { return !!r.error; }).length;
  const allCollectedSkuCodes = useMemo(function() {
    return Object.values(collectedSkuByDate).flat();
  }, [collectedSkuByDate]);
  const productSummary = useMemo(function() {
    if (allCollectedSkuCodes.length === 0) return [];
    return aggregateProducts(allCollectedSkuCodes);
  }, [allCollectedSkuCodes]);

  if (!currentUser) return null;

  const selectedShop = shops.find(s => s.id === selectedShopId);

  return (
    <div className="space-y-6">
      {success && (
        <div className="px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-sm font-medium flex items-center gap-2">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {success}
        </div>
      )}

      {/* Step indicator */}
      <StepIndicator
        currentStep={currentStep}
        steps={[
          { label: 'Chọn shop', desc: 'Shop nhận báo cáo' },
          { label: 'Upload file', desc: 'File đơn hàng .xlsx' },
          { label: 'Chi phí QC', desc: 'Tuỳ chọn' },
          { label: 'Xác nhận', desc: 'Xem trước & import' },
        ]}
      />

      {/* Collapsible guide */}
      <button
        onClick={() => setShowGuide(!showGuide)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-900 border border-slate-700/50 rounded-xl text-sm hover:bg-slate-800/80 transition-colors"
      >
        <span className="flex items-center gap-2 text-gray-400">
          <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Hướng dẫn sử dụng
        </span>
        <svg className={`w-4 h-4 text-gray-500 transition-transform ${showGuide ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {showGuide && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5 -mt-4 border-t-0 rounded-t-none">
          <div className="text-sm text-gray-400 space-y-2.5">
            <p className="flex items-start gap-2"><span className="text-blue-400 font-mono text-xs bg-blue-500/10 px-1.5 py-0.5 rounded">1</span> Export file đơn hàng <span className="font-medium text-gray-200">.xlsx</span> từ Shopee Seller Center hoặc TikTok Shop</p>
            <p className="flex items-start gap-2"><span className="text-blue-400 font-mono text-xs bg-blue-500/10 px-1.5 py-0.5 rounded">2</span> Hệ thống <span className="font-medium text-gray-200">tự nhận diện</span> Shopee (header tiếng Việt) hay TikTok (header tiếng Anh)</p>
            <p className="flex items-start gap-2"><span className="text-blue-400 font-mono text-xs bg-blue-500/10 px-1.5 py-0.5 rounded">3</span> Chọn shop, hệ thống <span className="font-medium text-gray-200">tổng hợp theo ngày</span>: doanh thu, số đơn, huỷ, hoàn</p>
            <p className="flex items-start gap-2"><span className="text-blue-400 font-mono text-xs bg-blue-500/10 px-1.5 py-0.5 rounded">4</span> Xem trước dữ liệu rồi bấm <span className="font-medium text-gray-200">Import</span></p>
          </div>
        </div>
      )}

      {/* Step 1: Shop selector + Step 2: File upload — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Shop selector */}
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-blue-500/15 text-blue-400 flex items-center justify-center text-xs font-bold">1</span>
            <h2 className="font-semibold text-gray-200 text-sm">Chọn shop</h2>
          </div>
          <select
            value={selectedShopId}
            onChange={function(e) { handleShopChange(e.target.value); }}
            className="w-full px-3 py-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">-- Chọn shop --</option>
            {userShops.map(function(shop) {
              return (
                <option key={shop.id} value={shop.id}>
                  {shop.name} ({shop.channel} - {shop.region})
                </option>
              );
            })}
          </select>
          {selectedShop && (
            <div className="mt-3 flex items-center gap-2">
              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                selectedShop.channel === 'Shopee' ? 'bg-orange-500/15 text-orange-400' : 'bg-pink-500/15 text-pink-400'
              }`}>{selectedShop.channel}</span>
              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                selectedShop.region === 'HCM' ? 'bg-blue-500/15 text-blue-400' : 'bg-violet-500/15 text-violet-400'
              }`}>{selectedShop.region}</span>
            </div>
          )}
        </div>

        {/* Upload zone */}
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-blue-500/15 text-blue-400 flex items-center justify-center text-xs font-bold">2</span>
            <h2 className="font-semibold text-gray-200 text-sm">Upload file đơn hàng</h2>
          </div>
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer ${
              fileName ? 'border-blue-500/30 bg-blue-500/5' : 'border-slate-600 hover:border-blue-500/40 hover:bg-slate-800/50'
            }`}
            onClick={function() { fileInputRef.current?.click(); }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
            {fileName ? (
              <div>
                <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-blue-500/15 flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </div>
                <p className="text-sm text-gray-200 font-medium">{fileName}</p>
                {detectedPlatform && (
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <span className={'inline-flex px-2 py-0.5 rounded text-xs font-medium ' + (detectedPlatform === 'shopee' ? 'bg-orange-500/15 text-orange-400' : 'bg-pink-500/15 text-pink-400')}>
                      {detectedPlatform === 'shopee' ? 'Shopee' : 'TikTok'}
                    </span>
                    {totalRawOrders > 0 && <span className="text-xs text-gray-500">{totalRawOrders} đơn hàng</span>}
                  </div>
                )}
                <p className="text-xs text-blue-400 mt-2 hover:underline">Chọn file khác</p>
              </div>
            ) : (
              <>
                <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-slate-800 flex items-center justify-center">
                  <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                </div>
                <p className="text-sm text-gray-300 font-medium">Click để chọn file (.xlsx)</p>
                <p className="text-xs text-gray-500 mt-1">Shopee / TikTok Shop</p>
              </>
            )}
          </div>
        </div>
      </div>

      {parseError && (
        <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm flex items-center gap-2">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {parseError}
        </div>
      )}

      {detectedPlatform && !selectedShopId && (
        <div className="px-4 py-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-sm font-medium flex items-center gap-2">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
          Vui lòng chọn shop ở trên để hệ thống tổng hợp dữ liệu
        </div>
      )}

      {/* Step 3: MKT cost */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-500/15 text-blue-400 flex items-center justify-center text-xs font-bold">3</span>
            <div>
              <h2 className="font-semibold text-gray-200 text-sm">Chi phí quảng cáo (MKT)</h2>
              <p className="text-xs text-gray-500">Tuỳ chọn — bỏ qua nếu không có</p>
            </div>
          </div>
          {Object.keys(mktDataMap).length > 0 && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-blue-400">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" /></svg>
                {Object.keys(mktDataMap).length} ngày — {formatCurrency(Object.values(mktDataMap).reduce(function(a,b){return a+b},0))} VNĐ
              </span>
              <button
                type="button"
                onClick={function() { setMktDataMap({}); setMktFileName(''); setManualMktDateFrom(toDateString(new Date())); setManualMktDateTo(toDateString(new Date())); setManualMktAmount(''); if (mktFileInputRef.current) mktFileInputRef.current.value = ''; }}
                className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                title="Xoá CP QC"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Option 1: File upload */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-orange-500/15 text-orange-400">Shopee Ads</span>
              <span className="text-xs text-gray-500">Upload file CSV</span>
            </div>
            <div
              className={`border-2 border-dashed rounded-lg p-5 text-center transition-all cursor-pointer h-[130px] flex flex-col items-center justify-center ${
                mktFileName ? 'border-blue-500/30 bg-blue-500/5' : 'border-slate-600 hover:border-blue-500/40'
              }`}
              onClick={function() { mktFileInputRef.current?.click(); }}
            >
              <input
                ref={mktFileInputRef}
                type="file"
                accept=".csv"
                onChange={handleMktFileChange}
                className="hidden"
              />
              {mktFileName ? (
                <div>
                  <p className="text-sm text-gray-200 font-medium">{mktFileName}</p>
                  {Object.keys(mktDataMap).length > 0 && (
                    <div className="mt-1.5 text-xs">
                      <span className="text-gray-500">{Object.keys(mktDataMap).length} ngày</span>
                      <span className="mx-1.5 text-gray-600">|</span>
                      <span className="font-semibold text-red-400">{formatCurrency(Object.values(mktDataMap).reduce(function(a,b){return a+b},0))} VNĐ</span>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <svg className="w-8 h-8 mx-auto text-gray-600 mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                  <p className="text-xs text-gray-400">Click để chọn file (.csv)</p>
                </>
              )}
            </div>
          </div>

          {/* Option 2: Manual input for TikTok Ads */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-pink-500/15 text-pink-400">TikTok Ads</span>
              <span className="text-xs text-gray-500">Nhập tay</span>
            </div>
            <div className="border border-slate-600 rounded-lg p-4 space-y-3 bg-slate-800/30">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Từ ngày</label>
                  <input
                    type="date"
                    value={manualMktDateFrom}
                    onChange={function(e) { setManualMktDateFrom(e.target.value); }}
                    className="w-full px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Đến ngày</label>
                  <input
                    type="date"
                    value={manualMktDateTo}
                    onChange={function(e) { setManualMktDateTo(e.target.value); }}
                    className="w-full px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Tổng CP (VNĐ)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={manualMktAmount}
                    onChange={function(e) { setManualMktAmount(e.target.value.replace(/[^\d]/g, '')); }}
                    placeholder="500000"
                    className="w-full px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              {manualMktAmount && (
                <p className="text-xs text-gray-500">{formatCurrency(parseInt(manualMktAmount) || 0)} VNĐ {manualMktDateFrom !== manualMktDateTo && manualMktDateTo ? ' (chia đều ' + (Math.round((new Date(manualMktDateTo).getTime() - new Date(manualMktDateFrom).getTime()) / 86400000) + 1) + ' ngày)' : ''}</p>
              )}
              <button
                type="button"
                onClick={handleManualMktApply}
                disabled={!manualMktDateFrom || !manualMktAmount || parseInt(manualMktAmount) <= 0}
                className="w-full py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Áp dụng CP QC
              </button>
            </div>
          </div>
        </div>

        {mktParseError && (
          <div className="mt-3 px-3 py-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" /></svg>
            {mktParseError}
          </div>
        )}
      </div>

      {/* MKT-only import */}
      {Object.keys(mktDataMap).length > 0 && selectedShopId && parsedRows.length === 0 && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-100">Import chi phí QC</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {Object.keys(mktDataMap).length} ngày | CP QC: {formatCurrency(Object.values(mktDataMap).reduce(function(a,b){return a+b},0))}
            </p>
          </div>
          <button
            onClick={handleImport}
            disabled={importing}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50"
          >
            {importing ? 'Đang import...' : 'Import CP QC'}
          </button>
        </div>
      )}

      {/* Step 4: Preview table */}
      {parsedRows.length > 0 && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-blue-500/15 text-blue-400 flex items-center justify-center text-xs font-bold">4</span>
              <div>
                <h2 className="font-semibold text-gray-100">Xem trước & Import</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {totalRawOrders} đơn gốc &rarr; {parsedRows.length} ngày
                  <span className="mx-1.5 text-gray-600">|</span>
                  <span className="text-emerald-400">{validCount} hợp lệ</span>
                  {errorCount > 0 && <><span className="mx-1 text-gray-600">,</span><span className="text-red-400">{errorCount} lỗi</span></>}
                </p>
              </div>
            </div>
            <button
              onClick={handleImport}
              disabled={validCount === 0 || importing}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {importing ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Đang import...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Import {validCount} ngày
                </>
              )}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800/80 border-b border-slate-700/50">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-400">Ngày</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-400">Target</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-400">Doanh thu</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-400">% Đạt</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-400">CP QC</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-400">% MKT</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-400">Đánh giá</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-400">Đơn</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-400">Huỷ</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-400">Hoàn</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-400">TT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {parsedRows.map(function(row, i) {
                  const pct = row.targetRevenue > 0 ? row.actualRevenue / row.targetRevenue : 0;
                  const pctColor = pct >= 1 ? 'bg-emerald-500/15 text-emerald-400' : pct >= 0.7 ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400';
                  return (
                    <tr key={i} className={row.error ? 'bg-red-500/5' : 'hover:bg-slate-800/50'}>
                      <td className="px-4 py-2.5 font-medium text-gray-200">{row.date}</td>
                      <td className="px-4 py-2.5 text-right text-gray-400">{row.targetRevenue > 0 ? formatCurrency(row.targetRevenue) : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-200">{formatCurrency(row.actualRevenue)}</td>
                      <td className="px-4 py-2.5 text-center">
                        {row.targetRevenue > 0 ? (
                          <span className={'inline-flex px-2 py-0.5 rounded text-xs font-medium ' + pctColor}>
                            {formatPercent(pct)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-400">
                        {row.adSpend > 0 ? formatCurrency(row.adSpend) : '—'}
                      </td>
                      {(() => {
                        const mktRatio = row.actualRevenue > 0 ? row.adSpend / row.actualRevenue : 0;
                        const mktColor = row.adSpend > 0 && row.actualRevenue > 0
                          ? mktRatio > config.adsThresholdYellow ? 'bg-red-500/15 text-red-400'
                            : mktRatio > config.adsThresholdGreen ? 'bg-amber-500/15 text-amber-400'
                            : 'bg-emerald-500/15 text-emerald-400'
                          : '';
                        return (
                          <td className="px-4 py-2.5 text-center">
                            {row.adSpend > 0 && row.actualRevenue > 0 ? (
                              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${mktColor}`}>
                                {formatPercent(mktRatio)}
                              </span>
                            ) : '—'}
                          </td>
                        );
                      })()}
                      <td className="px-4 py-2.5 text-left">
                        {row.adSpend > 0 && row.actualRevenue > 0 ? (
                          <span className={`text-xs font-medium ${
                            (row.adSpend / row.actualRevenue) >= config.adsThresholdYellow ? 'text-red-400'
                            : (row.adSpend / row.actualRevenue) >= config.adsThresholdGreen ? 'text-amber-400'
                            : 'text-emerald-400'
                          }`}>
                            {(row.adSpend / row.actualRevenue) >= config.adsThresholdYellow ? 'CP cao'
                            : (row.adSpend / row.actualRevenue) >= config.adsThresholdGreen ? 'Cho phép'
                            : 'Hiệu quả'}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-400">{row.totalOrders}</td>
                      <td className="px-4 py-2.5 text-right text-gray-400">{row.cancelledOrders}</td>
                      <td className="px-4 py-2.5 text-right text-gray-400">{row.returnedOrders}</td>
                      <td className="px-4 py-2.5 text-center">
                        {row.error ? (
                          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-red-500/15 text-red-400">
                            Lỗi
                          </span>
                        ) : (
                          <span className="inline-flex w-5 h-5 rounded-full bg-emerald-500/15 items-center justify-center">
                            <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SKU Best-seller table */}
      {productSummary.length > 0 && parsedRows.length > 0 && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
              </span>
              <div>
                <h2 className="font-semibold text-gray-100">Sản phẩm bán chạy</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {productSummary.length} sản phẩm từ {allCollectedSkuCodes.length} SKU
                </p>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800/80 border-b border-slate-700/50">
                  <th className="text-center px-4 py-2.5 font-medium text-gray-400 w-12">#</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-400">Tên sản phẩm</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-400">Số lượng</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-400">Số đơn</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-400 w-32">Tỷ trọng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {productSummary.map(function(item, i) {
                  const totalQty = productSummary.reduce(function(sum, p) { return sum + p.totalQuantity; }, 0);
                  const pct = totalQty > 0 ? item.totalQuantity / totalQty : 0;
                  return (
                    <tr key={i} className="hover:bg-slate-800/50">
                      <td className="px-4 py-2.5 text-center">
                        {i < 3 ? (
                          <span className={`inline-flex w-6 h-6 rounded-full items-center justify-center text-xs font-bold ${
                            i === 0 ? 'bg-yellow-500/15 text-yellow-400' :
                            i === 1 ? 'bg-gray-400/15 text-gray-300' :
                            'bg-amber-700/15 text-amber-600'
                          }`}>{i + 1}</span>
                        ) : (
                          <span className="text-gray-500">{i + 1}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-200">{item.product}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-100">{item.totalQuantity.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right text-gray-400">{item.orderCount.toLocaleString()}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: (pct * 100) + '%' }} />
                          </div>
                          <span className="text-xs text-gray-400 w-10 text-right">{(pct * 100).toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
