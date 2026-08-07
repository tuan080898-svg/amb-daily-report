'use client';

import { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { aggregateProducts, ProductSummary, getAllSkuCodes } from '@/lib/sku';
import { formatCurrency } from '@/lib/utils';

interface FileEntry {
  name: string;
  platform: 'shopee' | 'tiktok';
  skuCodes: string[];
  orderCount: number;
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

function extractSkuFromShopee(ws: XLSX.WorkSheet): { skuCodes: string[]; orderCount: number } {
  const data = normalizeKeys(XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]);
  const skuCodes: string[] = [];
  const orderSeen = new Set<string>();

  for (const row of data) {
    const orderId = String(row['Mã đơn hàng'] || '').trim();
    if (!orderId) continue;

    const status = String(row['Trạng Thái Đơn Hàng'] || '').trim();
    const isCancelled = status.indexOf('hủy') >= 0 || status.indexOf('Hủy') >= 0;

    if (!orderSeen.has(orderId)) orderSeen.add(orderId);

    if (!isCancelled) {
      const sku = String(row['SKU phân loại hàng'] || '').trim();
      if (sku) {
        const qty = parseNum(row['Số lượng']) || 1;
        for (let i = 0; i < qty; i++) skuCodes.push(sku);
      }
    }
  }

  return { skuCodes, orderCount: orderSeen.size };
}

function extractSkuFromTikTok(ws: XLSX.WorkSheet): { skuCodes: string[]; orderCount: number } {
  const data = normalizeKeys(XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]);
  const skuCodes: string[] = [];
  const orderSeen = new Set<string>();

  for (const row of data) {
    const orderId = String(row['Order ID'] || '').trim();
    if (!orderId) continue;

    const status = String(row['Order Status'] || '').trim();
    const cancelType = String(row['Cancelation/Return Type'] || '').trim();
    const statusLower = status.toLowerCase();
    const isCancelled = statusLower === 'canceled' || statusLower.indexOf('hủy') >= 0 || cancelType === 'Cancel';

    if (!orderSeen.has(orderId)) orderSeen.add(orderId);

    if (!isCancelled) {
      const sku = String(row['Seller SKU'] || '').trim();
      if (sku) {
        const qty = parseNum(row['Quantity']) || 1;
        for (let i = 0; i < qty; i++) skuCodes.push(sku);
      }
    }
  }

  return { skuCodes, orderCount: orderSeen.size };
}

export default function SkuReportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [parseError, setParseError] = useState('');
  const [loading, setLoading] = useState(false);

  const allSkuCodes = useMemo(function() {
    return files.flatMap(function(f) { return f.skuCodes; });
  }, [files]);

  const productSummary = useMemo(function() {
    if (allSkuCodes.length === 0) return [];
    return aggregateProducts(allSkuCodes);
  }, [allSkuCodes]);

  const totalQty = useMemo(function() {
    return productSummary.reduce(function(sum, p) { return sum + p.totalQuantity; }, 0);
  }, [productSummary]);

  const totalOrders = useMemo(function() {
    return files.reduce(function(sum, f) { return sum + f.orderCount; }, 0);
  }, [files]);

  const unmatchedCount = useMemo(function() {
    const knownSkus = new Set(getAllSkuCodes());
    return allSkuCodes.filter(function(c) { return !knownSkus.has(c); }).length;
  }, [allSkuCodes]);

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setParseError('');
    setLoading(true);

    const newFiles: FileEntry[] = [...files];
    let processed = 0;

    for (let fi = 0; fi < fileList.length; fi++) {
      const file = fileList[fi];
      const reader = new FileReader();
      reader.onload = function(evt) {
        try {
          const arrayBuffer = evt.target?.result as ArrayBuffer;
          const wb = XLSX.read(arrayBuffer, { type: 'array' });

          let ws: XLSX.WorkSheet | undefined;
          let platform: 'shopee' | 'tiktok' | null = null;

          if (wb.SheetNames.includes('OrderSKUList')) {
            ws = wb.Sheets['OrderSKUList'];
            platform = 'tiktok';
          } else {
            ws = wb.Sheets[wb.SheetNames[0]];
            const jsonData = normalizeKeys(XLSX.utils.sheet_to_json(ws, { range: 0 }) as Record<string, unknown>[]);
            if (jsonData.length > 0) {
              const h0 = String(Object.keys(jsonData[0])[0] || '').trim();
              if (h0 === 'Order ID') platform = 'tiktok';
              else if (h0 === 'Mã đơn hàng') platform = 'shopee';
            }
          }

          if (!ws || !platform) {
            setParseError('Không nhận diện được file: ' + file.name);
          } else {
            const result = platform === 'shopee' ? extractSkuFromShopee(ws) : extractSkuFromTikTok(ws);
            newFiles.push({
              name: file.name,
              platform,
              skuCodes: result.skuCodes,
              orderCount: result.orderCount,
            });
          }
        } catch (err) {
          setParseError('Lỗi đọc file ' + file.name + ': ' + String(err));
        }

        processed++;
        if (processed === fileList.length) {
          setFiles([...newFiles]);
          setLoading(false);
        }
      };
      reader.readAsArrayBuffer(file);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeFile(idx: number) {
    setFiles(function(prev) { return prev.filter(function(_, i) { return i !== idx; }); });
  }

  function clearAll() {
    setFiles([]);
    setParseError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Sản phẩm bán chạy</h1>
        <p className="text-sm text-gray-500 mt-1">Phân tích SKU từ file đơn hàng Shopee / TikTok</p>
      </div>

      <div className="space-y-6">
        {/* Upload zone */}
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-200 text-sm">Upload file đơn hàng</h2>
            {files.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2 py-1 rounded transition-colors"
              >
                Xoá tất cả
              </button>
            )}
          </div>

          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer ${
              loading ? 'border-blue-500/50 bg-blue-500/5' : 'border-slate-600 hover:border-blue-500/40 hover:bg-slate-800/50'
            }`}
            onClick={function() { if (!loading) fileInputRef.current?.click(); }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              multiple
              onChange={handleFiles}
              className="hidden"
            />
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                <span className="text-sm text-blue-400">Đang phân tích...</span>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-slate-800 flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                </div>
                <p className="text-sm text-gray-300 font-medium">Click để chọn file (.xlsx)</p>
                <p className="text-xs text-gray-500 mt-1">Hỗ trợ chọn nhiều file cùng lúc — Shopee &amp; TikTok</p>
              </>
            )}
          </div>

          {parseError && (
            <div className="mt-3 px-3 py-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" /></svg>
              {parseError}
            </div>
          )}

          {/* Uploaded files list */}
          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              {files.map(function(f, i) {
                return (
                  <div key={i} className="flex items-center justify-between px-3 py-2 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className={'inline-flex px-2 py-0.5 rounded text-xs font-medium ' + (f.platform === 'shopee' ? 'bg-orange-500/15 text-orange-400' : 'bg-pink-500/15 text-pink-400')}>
                        {f.platform === 'shopee' ? 'Shopee' : 'TikTok'}
                      </span>
                      <span className="text-sm text-gray-300">{f.name}</span>
                      <span className="text-xs text-gray-500">{f.orderCount} đơn | {f.skuCodes.length} SKU</span>
                    </div>
                    <button
                      onClick={function() { removeFile(i); }}
                      className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Summary stats */}
        {files.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Tổng file</p>
              <p className="text-2xl font-bold text-gray-100">{files.length}</p>
            </div>
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Tổng đơn hàng</p>
              <p className="text-2xl font-bold text-gray-100">{totalOrders.toLocaleString()}</p>
            </div>
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Tổng sản phẩm bán</p>
              <p className="text-2xl font-bold text-emerald-400">{totalQty.toLocaleString()}</p>
            </div>
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Loại sản phẩm</p>
              <p className="text-2xl font-bold text-blue-400">{productSummary.length}</p>
              {unmatchedCount > 0 && (
                <p className="text-xs text-amber-400 mt-1">{unmatchedCount} SKU chưa mapping</p>
              )}
            </div>
          </div>
        )}

        {/* Product best-seller table */}
        {productSummary.length > 0 && (
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/50">
              <h2 className="font-semibold text-gray-100">Bảng xếp hạng sản phẩm</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Top {productSummary.length} sản phẩm — tổng {totalQty.toLocaleString()} sản phẩm bán ra
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800/80 border-b border-slate-700/50">
                    <th className="text-center px-4 py-2.5 font-medium text-gray-400 w-14">#</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-400">Tên sản phẩm</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-400">Số lượng</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-400">Số đơn chứa SP</th>
                    <th className="text-center px-4 py-2.5 font-medium text-gray-400 w-40">Tỷ trọng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {productSummary.map(function(item, i) {
                    const pct = totalQty > 0 ? item.totalQuantity / totalQty : 0;
                    return (
                      <tr key={i} className="hover:bg-slate-800/50">
                        <td className="px-4 py-3 text-center">
                          {i < 3 ? (
                            <span className={'inline-flex w-7 h-7 rounded-full items-center justify-center text-xs font-bold ' + (
                              i === 0 ? 'bg-yellow-500/15 text-yellow-400' :
                              i === 1 ? 'bg-gray-400/15 text-gray-300' :
                              'bg-amber-700/15 text-amber-600'
                            )}>{i + 1}</span>
                          ) : (
                            <span className="text-gray-500">{i + 1}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={'font-medium ' + (i < 3 ? 'text-gray-100' : 'text-gray-300')}>{item.product}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={'font-semibold ' + (i < 3 ? 'text-emerald-400 text-base' : 'text-gray-200')}>{item.totalQuantity.toLocaleString()}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400">{item.orderCount.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={'h-full rounded-full ' + (i === 0 ? 'bg-yellow-500' : i < 3 ? 'bg-emerald-500' : 'bg-blue-500')}
                                style={{ width: Math.max(pct * 100, 1) + '%' }}
                              />
                            </div>
                            <span className="text-xs text-gray-400 w-12 text-right">{(pct * 100).toFixed(1)}%</span>
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

        {/* Empty state */}
        {files.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-800 flex items-center justify-center">
              <span className="text-3xl">🏆</span>
            </div>
            <p className="text-gray-400 font-medium">Chưa có dữ liệu</p>
            <p className="text-sm text-gray-500 mt-1">Upload file đơn hàng (.xlsx) để xem báo cáo sản phẩm bán chạy</p>
          </div>
        )}
      </div>
    </div>
  );
}
