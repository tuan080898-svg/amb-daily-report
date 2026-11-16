'use client';

// Báo cáo booking theo ngày: mỗi nhân sự liên hệ bao nhiêu KOC, bao nhiêu KOC xác nhận hợp tác, đã gửi bao nhiêu sản phẩm theo từng loại hàng.
// Tính theo ngày liên hệ (cột "Ngày" trong bảng của từng nhân sự). Loại hàng lấy từ cột "Sản phẩm theo SKU" quy qua bảng SKU của app.

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { BookingSnapshot, OTHER_PRODUCT, UNKNOWN_STAFF, addDays, buildDayReport, canonicalProduct, todayVn } from '@/lib/booking';
import { getAllSkuCodes, getSkuProducts, subscribeSkuMap } from '@/lib/sku';

function fmt(n: number): string { return n.toLocaleString('vi-VN'); }
function pct(a: number, b: number): string { return b > 0 ? (a / b * 100).toFixed(0) + '%' : '—'; }
function fmtDate(d: string): string { const p = d.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
function weekday(d: string): string {
  const names = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return names[new Date(d + 'T00:00:00Z').getUTCDay()];
}

export default function DayReport(props: { snap: BookingSnapshot }) {
  const snap = props.snap;
  const [date, setDate] = useState(todayVn());
  const [skuVer, setSkuVer] = useState(0);
  useEffect(function() { return subscribeSkuMap(function() { setSkuVer(function(v) { return v + 1; }); }); }, []);

  // Mã SKU (không phân biệt hoa thường) -> loại hàng, theo bảng SKU hiện hành của app
  const codeIndex = useMemo(function() {
    const m = new Map<string, string>();
    getAllSkuCodes().forEach(function(c) { m.set(c.trim().toUpperCase(), c); });
    return m;
  }, [skuVer]); // eslint-disable-line react-hooks/exhaustive-deps

  const catOf = useMemo(function() {
    return function(code: string): string | null {
      const real = codeIndex.get(code.trim().toUpperCase());
      if (!real) return null;
      const items = getSkuProducts(real);
      if (items.length === 0) return null;
      for (let i = 0; i < items.length; i++) {
        const c = canonicalProduct(items[i].product);
        if (c && c !== OTHER_PRODUCT) return c;
      }
      return items[0].product;
    };
  }, [codeIndex]);

  // Nhân sự đang làm (có dòng trong 45 ngày gần đây) để hiện cả khi hôm đó 0 KOC
  const staffIdx = useMemo(function() {
    const since = addDays(todayVn(), -45);
    const set = new Set<number>();
    snap.contacts.forEach(function(r) { if (r[0] >= since) set.add(r[1]); });
    return Array.from(set).filter(function(i) { return snap.staff[i] !== UNKNOWN_STAFF; }).sort(function(a, b) { return a - b; });
  }, [snap]);

  const rep = useMemo(function() { return buildDayReport(snap, date, staffIdx, catOf); }, [snap, date, staffIdx, catOf]);
  const week = useMemo(function() {
    const out = [];
    for (let i = 0; i < 7; i++) out.push(buildDayReport(snap, addDays(date, -i), staffIdx, catOf));
    return out;
  }, [snap, date, staffIdx, catOf]);

  const t = rep.total;
  const today = todayVn();
  const staffCols = rep.staff.map(function(s) { return s.name; });
  const unknownCodes = Object.keys(rep.unknownSku);

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    const a1: Array<Array<string | number>> = [['Báo cáo booking ngày', fmtDate(date)], [], ['Nhân sự', 'KOC liên hệ', 'KOC xác nhận', 'Tỷ lệ xác nhận', 'KOC đã gửi SP', 'Số SP của KOC xác nhận', 'Số SP đã gửi']];
    rep.staff.concat([t]).forEach(function(s) { a1.push([s.name, s.contacted, s.confirmed, pct(s.confirmed, s.contacted), s.sent, s.confirmedSp, s.sentSp]); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a1), 'Theo nhan su');
    const a2: Array<Array<string | number>> = [['Loại hàng', 'Xác nhận (phần SP)', 'Đã gửi (phần SP)', 'Mã SKU đã gửi', 'Theo nhân sự (xác nhận/đã gửi)']];
    rep.cats.forEach(function(c) {
      a2.push([c.name, c.confirmed, c.sent,
        Object.keys(c.skus).map(function(k) { return k + 'x' + c.skus[k]; }).join(', '),
        rep.staff.filter(function(s) { return s.cats[c.name]; }).map(function(s) { return s.name + ' ' + s.cats[c.name].confirmed + '/' + s.cats[c.name].sent; }).join(' · ')]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a2), 'Theo loai hang');
    const a3: Array<Array<string | number>> = [['Ngày', 'Thứ'].concat(staffCols.map(function(n) { return n + ' (liên hệ/xác nhận/đã gửi)'; })).concat(['Tổng liên hệ', 'Tổng xác nhận', 'Tổng đã gửi'])];
    week.forEach(function(w) {
      a3.push([fmtDate(w.date), weekday(w.date)].concat(w.staff.map(function(s) { return s.contacted + '/' + s.confirmed + '/' + s.sent; })).concat([w.total.contacted, w.total.confirmed, w.total.sent] as unknown as string[]));
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a3), '7 ngay');
    XLSX.writeFile(wb, 'booking-ngay-' + date + '.xlsx');
  }

  const btn = 'px-3 py-1.5 text-sm rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800';

  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-100">Báo cáo theo ngày</h2>
          <p className="text-xs text-slate-500 mt-0.5">Theo ngày liên hệ KOC trong bảng của từng nhân sự. Số của hôm nay là số tạm, đọc trực tiếp từ Lark.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={btn} onClick={function() { setDate(addDays(date, -1)); }} aria-label="Ngày trước">◀</button>
          <input type="date" value={date} max={today} onChange={function(e) { if (e.target.value) setDate(e.target.value > today ? today : e.target.value); }}
            className="bg-slate-800 border border-slate-700 text-sm text-slate-200 rounded px-3 py-1.5" />
          <button className={btn} disabled={date >= today} onClick={function() { setDate(addDays(date, 1) > today ? today : addDays(date, 1)); }} aria-label="Ngày sau">▶</button>
          <button className={btn} onClick={function() { setDate(today); }}>Hôm nay</button>
          <button className={btn} onClick={function() { setDate(addDays(today, -1)); }}>Hôm qua</button>
          <button className={btn} onClick={exportExcel}>Tải Excel</button>
        </div>
      </div>

      <p className="text-sm text-slate-300">{weekday(date)} {fmtDate(date)}</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/30">
          <p className="text-slate-400 text-xs mb-1">KOC đã liên hệ</p>
          <p className="text-2xl font-bold text-blue-400">{fmt(t.contacted)}</p>
        </div>
        <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/30">
          <p className="text-slate-400 text-xs mb-1">KOC xác nhận hợp tác</p>
          <p className="text-2xl font-bold text-emerald-400">{fmt(t.confirmed)}</p>
          <p className="text-xs text-slate-500 mt-0.5">{pct(t.confirmed, t.contacted)} trên đã liên hệ</p>
        </div>
        <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/30">
          <p className="text-slate-400 text-xs mb-1">KOC đã gửi sản phẩm</p>
          <p className="text-2xl font-bold text-amber-400">{fmt(t.sent)}</p>
          <p className="text-xs text-slate-500 mt-0.5">{pct(t.sent, t.confirmed)} trên xác nhận</p>
        </div>
        <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/30">
          <p className="text-slate-400 text-xs mb-1">Số sản phẩm đã gửi</p>
          <p className="text-2xl font-bold text-pink-400">{fmt(t.sentSp)}</p>
          <p className="text-xs text-slate-500 mt-0.5">{fmt(t.confirmedSp)} sản phẩm của KOC đã xác nhận</p>
        </div>
      </div>

      {/* Theo nhân sự */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 text-xs border-b border-slate-700/50">
              <th className="text-left py-2 pr-3 font-medium">Nhân sự</th>
              <th className="text-right px-3 font-medium">KOC liên hệ</th>
              <th className="text-right px-3 font-medium">Xác nhận</th>
              <th className="text-right px-3 font-medium">Tỷ lệ</th>
              <th className="text-right px-3 font-medium">KOC đã gửi SP</th>
              <th className="text-right px-3 font-medium">Số SP xác nhận</th>
              <th className="text-right pl-3 font-medium">Số SP đã gửi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rep.staff.map(function(s) {
              return (
                <tr key={s.name} className={'hover:bg-slate-800/50 ' + (s.contacted === 0 ? 'text-slate-600' : '')}>
                  <td className="py-2 pr-3 text-gray-200">{s.name}{s.contacted === 0 && <span className="ml-2 text-xs text-slate-500">không có dòng nào trong bảng Lark</span>}</td>
                  <td className="px-3 text-right text-slate-300">{fmt(s.contacted)}</td>
                  <td className="px-3 text-right text-emerald-400 font-medium">{fmt(s.confirmed)}</td>
                  <td className="px-3 text-right text-slate-400">{pct(s.confirmed, s.contacted)}</td>
                  <td className="px-3 text-right text-amber-300">{fmt(s.sent)}</td>
                  <td className="px-3 text-right text-slate-300">{fmt(s.confirmedSp)}</td>
                  <td className="pl-3 text-right text-pink-300 font-medium">{fmt(s.sentSp)}</td>
                </tr>
              );
            })}
            <tr className="font-semibold border-t border-slate-600">
              <td className="py-2 pr-3 text-gray-100">Tổng</td>
              <td className="px-3 text-right text-slate-100">{fmt(t.contacted)}</td>
              <td className="px-3 text-right text-emerald-400">{fmt(t.confirmed)}</td>
              <td className="px-3 text-right text-slate-300">{pct(t.confirmed, t.contacted)}</td>
              <td className="px-3 text-right text-amber-300">{fmt(t.sent)}</td>
              <td className="px-3 text-right text-slate-100">{fmt(t.confirmedSp)}</td>
              <td className="pl-3 text-right text-pink-300">{fmt(t.sentSp)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Theo loại hàng */}
      <div>
        <h3 className="text-sm font-semibold text-gray-200 mb-2">Sản phẩm theo từng loại hàng</h3>
        {rep.cats.length === 0 ? <p className="text-sm text-slate-500">Ngày này chưa có KOC xác nhận hợp tác.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs border-b border-slate-700/50">
                  <th className="text-left py-2 pr-3 font-medium">Loại hàng</th>
                  <th className="text-right px-3 font-medium">Xác nhận</th>
                  <th className="text-right px-3 font-medium">Đã gửi</th>
                  <th className="text-left px-3 font-medium">Theo nhân sự (xác nhận / đã gửi)</th>
                  <th className="text-left pl-3 font-medium">Mã SKU đã gửi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {rep.cats.map(function(c) {
                  return (
                    <tr key={c.name} className="hover:bg-slate-800/50">
                      <td className="py-2 pr-3 text-gray-200">{c.name}</td>
                      <td className="px-3 text-right text-emerald-400">{fmt(c.confirmed)}</td>
                      <td className="px-3 text-right text-pink-300 font-medium">{fmt(c.sent)}</td>
                      <td className="px-3 text-xs text-slate-400">
                        {rep.staff.filter(function(s) { return s.cats[c.name]; }).map(function(s) { return s.name + ' ' + s.cats[c.name].confirmed + '/' + s.cats[c.name].sent; }).join(' · ')}
                      </td>
                      <td className="pl-3 text-xs text-slate-500">{Object.keys(c.skus).map(function(k) { return k + '×' + c.skus[k]; }).join(', ') || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 7 ngày gần nhất */}
      <div>
        <h3 className="text-sm font-semibold text-gray-200 mb-2">7 ngày tính đến {fmtDate(date)} <span className="font-normal text-xs text-slate-500">(liên hệ / xác nhận / đã gửi)</span></h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-xs border-b border-slate-700/50">
                <th className="text-left py-2 pr-3 font-medium">Ngày</th>
                {staffCols.map(function(n) { return <th key={n} className="text-right px-3 font-medium">{n}</th>; })}
                <th className="text-right pl-3 font-medium">Tổng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {week.map(function(w) {
                return (
                  <tr key={w.date} onClick={function() { setDate(w.date); }} className={'cursor-pointer hover:bg-slate-800/50 ' + (w.date === date ? 'bg-slate-800/70' : '')}>
                    <td className="py-2 pr-3 text-gray-200 whitespace-nowrap">{weekday(w.date)} {fmtDate(w.date).slice(0, 5)}</td>
                    {w.staff.map(function(s) {
                      return <td key={s.name} className={'px-3 text-right whitespace-nowrap ' + (s.contacted === 0 ? 'text-slate-600' : 'text-slate-300')}>{s.contacted === 0 ? '—' : s.contacted + ' / ' + s.confirmed + ' / ' + s.sent}</td>;
                    })}
                    <td className="pl-3 text-right text-gray-100 whitespace-nowrap font-medium">{w.total.contacted === 0 ? '—' : w.total.contacted + ' / ' + w.total.confirmed + ' / ' + w.total.sent}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-slate-500 space-y-1">
        <p><span className="text-slate-400">Cách tính:</span> “KOC liên hệ” là KOC khác nhau của từng nhân sự trong ngày (KOC ghi trùng dòng chỉ tính 1). “Xác nhận” là trạng thái hiện tại từ Xác nhận hợp tác trở lên. “Đã gửi” là từ Gửi SP trở lên (gồm hẹn lịch, on air, hoàn trả, bùng, không hiệu quả). Lark không có cột ngày xác nhận / ngày gửi nên các số này tính theo ngày liên hệ và có thể tăng thêm ở các ngày đã qua.</p>
        <p>Mỗi mã SKU (hoặc mỗi tên sản phẩm nếu không có SKU) là một sản phẩm gửi cho KOC; bộ nhiều món như bộ vệ sinh sofa tính là 1.
          {t.confirmed > 0 && ' Ngày này có ' + fmt(rep.confirmedWithSku) + '/' + fmt(t.confirmed) + ' KOC xác nhận ghi mã SKU; số còn lại tính theo tên sản phẩm nhân sự ghi (bảng Yến Chi và Chi chưa có cột “Sản phẩm theo SKU”).'}
        </p>
        {rep.confirmedNoProduct > 0 && <p className="text-amber-400">{rep.confirmedNoProduct} KOC xác nhận chưa ghi sản phẩm, cần nhân sự bổ sung trên Lark.</p>}
        {unknownCodes.length > 0 && <p className="text-amber-400">Mã SKU chưa có trong bảng SKU của app: {unknownCodes.join(', ')}. Cần bổ sung ở trang quản lý SKU để gom đúng loại hàng.</p>}
      </div>
    </div>
  );
}
