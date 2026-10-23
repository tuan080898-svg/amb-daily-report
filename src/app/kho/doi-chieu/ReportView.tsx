'use client';

import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  dcFmt, dcFp, dcLoiTong, dcNkey, dcPct, dcR3, dcRating, dcSessionStats, dcStaff, dcSumStats, dcVnDate,
  type DcConfig, type DcCatalog, type DcSession, type DcStat, type DcSum,
} from '@/lib/doichieu';
import { btnCls, cardCls, inputCls } from './shared';

interface Props { cfg: DcConfig; catalog: DcCatalog; sessions: DcSession[]; loadingAll: boolean; allLoaded: boolean; onLoadAll: () => void }

function Kpi(p: { v: string; l: string; s?: string }) {
  return <div className="bg-slate-900 border border-slate-700 rounded-xl p-4"><div className="text-2xl font-bold text-gray-100">{p.v}</div><div className="text-xs text-gray-400 mt-1">{p.l}</div>{p.s ? <div className="text-xs text-gray-500 mt-0.5">{p.s}</div> : null}</div>;
}

var RATE: Record<string, { t: string; c: string }> = {
  none: { t: 'Không xuất', c: 'bg-slate-700 text-gray-400' },
  tot: { t: 'Tốt', c: 'bg-emerald-500/15 text-emerald-300' },
  dat: { t: 'Đạt', c: 'bg-sky-500/15 text-sky-300' },
  xem: { t: 'Cần xem lại', c: 'bg-red-500/15 text-red-300' },
};

export default function ReportView(p: Props) {
  var staffNames = dcStaff(p.cfg.settings);
  var ctx = useMemo(function() { return { bo: p.cfg.bo, combos: p.cfg.combos, catalog: p.catalog, settings: p.cfg.settings }; }, [p.cfg, p.catalog]);
  var stats: DcStat[] = useMemo(function() {
    return p.sessions.map(function(s) { return dcSessionStats(s, ctx); }).sort(function(a, b) { return a.ngay.localeCompare(b.ngay); });
  }, [p.sessions, ctx]);
  var months = useMemo(function() { return Array.from(new Set(stats.map(function(s) { return s.ngay.slice(0, 7); }))).sort().reverse(); }, [stats]);
  var [pick, setPick] = useState('');
  var cur = months.indexOf(pick) >= 0 ? pick : months[0];
  var ms = stats.filter(function(s) { return s.ngay.indexOf(cur) === 0; });
  var z: DcSum = dcSumStats(ms, staffNames);
  var totQ = z.staffList.reduce(function(a, x) { return a + x.qty; }, 0);
  var maxQ = Math.max.apply(null, [1].concat(z.staffList.map(function(x) { return x.qty; })));

  if (!stats.length) {
    return <div className={cardCls + ' text-sm text-gray-400'}>Chưa có ngày nào được lưu. Đối chiếu và bấm “Lưu phiên đối chiếu” để có báo cáo.{!p.allLoaded && <button className={btnCls + ' ml-3'} onClick={p.onLoadAll} disabled={p.loadingAll}>{p.loadingAll ? 'Đang tải…' : 'Tải các tháng trước'}</button>}</div>;
  }

  function rowT(lab: string, s: DcSum | DcStat) {
    return (
      <tr key={lab} className="border-t border-slate-800">
        <td className="p-2 font-semibold text-gray-100">{lab}</td>
        <td className="p-2 text-right font-mono">{dcFmt(s.xuatSo)}</td><td className="p-2 text-right font-mono">{dcFmt(s.xuatSapo)}</td>
        <td className="p-2 text-right font-mono">{dcFmt(dcR3(s.lech))}</td><td className="p-2 text-right font-mono">{dcFp(dcPct(s.lech, s.xuatSapo))}</td>
        <td className="p-2 text-right font-mono">{s.maLech}/{s.maPs}</td>
        <td className="p-2 text-right font-mono">{dcFmt(s.loiNhap)}</td><td className="p-2 text-right font-mono">{dcFmt(s.loiTra)}</td><td className="p-2 text-right font-mono">{dcFmt(s.loiNs)}</td>
        <td className="p-2 text-right font-mono">{dcFp(dcPct(dcLoiTong(s), s.xuatSo))}</td>
      </tr>
    );
  }
  function head(first: string) {
    return <thead><tr className="text-xs text-gray-400"><th className="p-2 text-left">{first}</th><th className="p-2 text-right">Sổ xuất</th><th className="p-2 text-right">Sapo xuất</th><th className="p-2 text-right">Lệch</th><th className="p-2 text-right">Tỷ lệ lệch</th><th className="p-2 text-right">Mã lệch</th><th className="p-2 text-right">Lỗi nhập</th><th className="p-2 text-right">Lỗi trả</th><th className="p-2 text-right">Lỗi NS</th><th className="p-2 text-right">Tỷ lệ hỏng</th></tr></thead>;
  }

  function exportExcel() {
    var H = ['Kỳ', 'Sổ xuất', 'Sapo xuất', 'Lệch', 'Tỷ lệ lệch %', 'Mã lệch', 'Lượt mã', 'Lỗi nhập', 'Lỗi trả', 'Lỗi NS', 'Tỷ lệ hỏng %'];
    var R = function(lab: string, s: DcSum | DcStat) { return [lab, s.xuatSo, s.xuatSapo, dcR3(s.lech), +dcPct(s.lech, s.xuatSapo).toFixed(2), s.maLech, s.maPs, s.loiNhap, s.loiTra, s.loiNs, +dcPct(dcLoiTong(s), s.xuatSo).toFixed(2)]; };
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Nhân sự', 'Sản lượng', 'Tỷ trọng %', 'Ngày làm', 'TB/ngày', 'Mã xuất', 'Mã lệch', 'Lệch ước tính', 'Tỷ lệ lệch %', 'Lỗi NS']].concat(
      z.staffList.map(function(x) { return [x.ten, x.qty, +dcPct(x.qty, totQ).toFixed(2), x.ngay || 0, x.ngay ? Math.round(x.qty / x.ngay) : 0, x.ma, x.maLech, Math.round(x.lech * 10) / 10, +dcPct(x.lech, x.qty).toFixed(2), x.loiNs] as unknown as string[]; }))), 'Nhan su ' + cur);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([H].concat(ms.map(function(s) { return R(dcVnDate(s.ngay), s) as unknown as string[]; }))), 'Theo ngay ' + cur);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([H].concat(months.slice().reverse().map(function(m) { return R(m, dcSumStats(stats.filter(function(s) { return s.ngay.indexOf(m) === 0; }), staffNames)) as unknown as string[]; }))), 'Theo thang');
    XLSX.writeFile(wb, 'bao-cao-kho-' + cur + '.xlsx');
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="text-sm text-gray-400">Tháng</label>
        <select value={cur} onChange={function(e) { setPick(e.target.value); }} className={inputCls}>
          {months.map(function(m) { return <option key={m} value={m}>Tháng {m.slice(5)}/{m.slice(0, 4)}</option>; })}
        </select>
        <button className={btnCls} onClick={exportExcel}>Tải Excel báo cáo</button>
        {!p.allLoaded && <button className={btnCls} onClick={p.onLoadAll} disabled={p.loadingAll}>{p.loadingAll ? 'Đang tải…' : 'Tải các tháng trước'}</button>}
        <span className="text-xs text-gray-500">{z.n} ngày đã lưu trong tháng.</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <Kpi v={dcFp(dcPct(z.lech, z.xuatSapo))} l="Tỷ lệ lệch xuất" s={dcFmt(dcR3(z.lech)) + ' cái lệch / ' + dcFmt(z.xuatSapo) + ' Sapo xuất'} />
        <Kpi v={dcFp(dcPct(z.maLech, z.maPs))} l="Tỷ lệ mã lệch" s={z.maLech + ' / ' + z.maPs + ' lượt mã phát sinh'} />
        <Kpi v={dcFp(dcPct(dcLoiTong(z), z.xuatSo))} l="Tỷ lệ hàng hỏng" s={dcFmt(dcLoiTong(z)) + ' cái lỗi / ' + dcFmt(z.xuatSo) + ' sổ xuất'} />
        <Kpi v={dcFmt(z.loiNhap)} l="Lỗi hàng nhập" s={z.nhap ? dcFp(dcPct(z.loiNhap, z.nhap)) + ' trên tổng nhập' : ''} />
        <Kpi v={dcFmt(z.loiTra)} l="Lỗi hàng trả" />
        <Kpi v={dcFmt(z.loiNs)} l="Lỗi nhân sự" s={z.loiNsKhongTen ? dcFmt(z.loiNsKhongTen) + ' cái chưa ghi tên người' : ''} />
      </div>

      <div className={cardCls}>
        <h2 className="text-sm font-semibold text-gray-200 mb-1">Đánh giá nhân sự trong tháng</h2>
        <p className="text-xs text-gray-500 mb-3">Sản lượng tính theo số ghi ở cột của từng người. Lệch ước tính: lệch của mỗi mã chia cho những người đã xuất mã đó theo tỷ trọng số lượng, nên chỉ là chỉ báo, không phải kết luận lỗi. Lỗi nhân sự được gán cho người có tên trong cột Ghi chú của dòng đó. Tốt: lệch ≤ 1% và lỗi ≤ 0,5%; Đạt: ≤ 3% và ≤ 1%; còn lại Cần xem lại.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-gray-400"><th className="p-2 text-left">Nhân sự</th><th className="p-2 text-right">Sản lượng</th><th className="p-2 text-right">Tỷ trọng</th><th className="p-2 text-right">Ngày làm</th><th className="p-2 text-right">TB/ngày</th><th className="p-2 text-right">Mã xuất</th><th className="p-2 text-right">Mã lệch</th><th className="p-2 text-right">Lệch ước tính</th><th className="p-2 text-right">Tỷ lệ lệch</th><th className="p-2 text-right">Lỗi NS</th><th className="p-2 text-left">Đánh giá</th></tr></thead>
            <tbody>
              {z.staffList.map(function(x) {
                var rt = RATE[dcRating(x)];
                return (
                  <tr key={x.ten} className="border-t border-slate-800">
                    <td className="p-2 font-semibold text-gray-100">{x.ten}{staffNames.some(function(n) { return dcNkey(n) === dcNkey(x.ten); }) ? '' : <span className="ml-1 text-xs font-normal text-gray-500">(không còn trong danh sách)</span>}</td>
                    <td className="p-2 text-right font-mono">{dcFmt(x.qty)}<span className="inline-block h-1.5 ml-2 rounded bg-blue-500/60 align-middle" style={{ width: Math.round(x.qty / maxQ * 60) }}></span></td>
                    <td className="p-2 text-right font-mono">{dcFp(dcPct(x.qty, totQ))}</td>
                    <td className="p-2 text-right font-mono">{x.ngay || 0}</td>
                    <td className="p-2 text-right font-mono">{x.ngay ? dcFmt(Math.round(x.qty / (x.ngay as number))) : '—'}</td>
                    <td className="p-2 text-right font-mono">{x.ma}</td><td className="p-2 text-right font-mono">{x.maLech}</td>
                    <td className="p-2 text-right font-mono">{dcFmt(Math.round(x.lech * 10) / 10)}</td>
                    <td className="p-2 text-right font-mono">{x.qty ? dcFp(dcPct(x.lech, x.qty)) : '—'}</td>
                    <td className="p-2 text-right font-mono">{dcFmt(x.loiNs)}</td>
                    <td className="p-2"><span className={'px-2 py-0.5 rounded text-xs ' + rt.c}>{rt.t}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className={cardCls}>
        <h2 className="text-sm font-semibold text-gray-200 mb-2">Theo ngày</h2>
        <div className="overflow-x-auto"><table className="w-full text-sm">{head('Ngày')}<tbody>{ms.slice().reverse().map(function(s) { return rowT(dcVnDate(s.ngay), s); })}</tbody></table></div>
      </div>
      <div className={cardCls}>
        <h2 className="text-sm font-semibold text-gray-200 mb-2">Theo tháng</h2>
        <div className="overflow-x-auto"><table className="w-full text-sm">{head('Tháng')}<tbody>{months.map(function(m) { return rowT(m.slice(5) + '/' + m.slice(0, 4), dcSumStats(stats.filter(function(s) { return s.ngay.indexOf(m) === 0; }), staffNames)); })}</tbody></table></div>
      </div>
    </div>
  );
}
