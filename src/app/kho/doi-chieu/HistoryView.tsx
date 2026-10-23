'use client';

import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  dcBoMap, dcComboName, dcCompute, dcCounts, dcLuyKe, dcNkey, dcNorm, dcNum, dcParseProductList, dcRowsOf, dcStaff, dcVnDate, dcFmtD, dcR3,
  type DcBo, type DcCatalog, type DcConfig, type DcSession, type DcSettings,
} from '@/lib/doichieu';
import { btnCls, btnPrimaryCls, cardCls, inputCls } from './shared';

interface Props {
  cfg: DcConfig;
  catalog: DcCatalog;
  sessions: DcSession[];
  allLoaded: boolean;
  loadingAll: boolean;
  onLoadAll: () => void;
  onOpenDay: (d: string) => void;
  onDelete: (days: string[]) => Promise<void>;
  onSaveSettings: (s: DcSettings) => Promise<void>;
  onSaveBo: (bo: DcBo[], combos?: Array<[string, string]>) => Promise<void>;
  onBackup: () => void;
  onRestore: (file: File) => Promise<string>;
  toast: (m: string) => void;
}

// Bấm lần 1 để "lên đạn", lần 2 mới thực hiện (tự hủy sau 4 giây)
function useConfirm() {
  var [armed, setArmed] = useState('');
  return {
    armed: armed,
    ask: function(key: string, fn: () => void) {
      if (armed === key) { setArmed(''); fn(); return; }
      setArmed(key);
      setTimeout(function() { setArmed(function(a) { return a === key ? '' : a; }); }, 4000);
    },
  };
}

function parseParts(t: string, catalog: DcCatalog, boMap: Map<string, DcBo>, combos: Array<[string, string]>): Array<[string, number]> {
  var known = function(c: string) { return !!catalog[dcNorm(c)] || boMap.has(dcNorm(c)) || combos.some(function(x) { return dcNorm(x[0]) === dcNorm(c); }); };
  var parts: Array<[string, number]> = [];
  String(t).split(/[,;+\n]/).map(function(x) { return x.trim(); }).filter(Boolean).forEach(function(seg0) {
    var seg = seg0.replace(/\s+/g, ' ');
    var ma = seg;
    var sl = 1;
    var m: RegExpExecArray | null;
    if (!/\s/.test(seg) && known(seg)) { ma = seg; }
    else if ((m = /^(\d+(?:[.,]\d+)?)\s*[x×*]\s+(\S+)$/i.exec(seg)) || (m = /^(\d+(?:[.,]\d+)?)\s*[×*]\s*(\S+)$/.exec(seg))) { ma = m[2]; sl = dcNum(m[1]); }
    else if ((m = /^(\S+)\s+[x×*]?\s*(\d+(?:[.,]\d+)?)$/i.exec(seg)) || (m = /^(\S+?)\s*[×*]\s*(\d+(?:[.,]\d+)?)$/.exec(seg))) { ma = m[1]; sl = dcNum(m[2]); }
    else if ((m = /^(\S+?)[xX](\d+(?:[.,]\d+)?)$/.exec(seg)) && known(m[1])) { ma = m[1]; sl = dcNum(m[2]); }
    parts.push([ma.toUpperCase(), sl || 1]);
  });
  return parts.map(function(x): [string, number] { var c = catalog[dcNorm(x[0])]; return [c ? c.ma : x[0], x[1]]; });
}

export default function HistoryView(p: Props) {
  var staff = dcStaff(p.cfg.settings);
  var ctx = useMemo(function() { return { bo: p.cfg.bo, combos: p.cfg.combos, catalog: p.catalog, settings: p.cfg.settings }; }, [p.cfg, p.catalog]);
  var boMap = useMemo(function() { return dcBoMap(p.cfg.bo); }, [p.cfg.bo]);
  var conf = useConfirm();
  var [staffDraft, setStaffDraft] = useState<string | null>(null);
  var staffText = staffDraft !== null ? staffDraft : staff.join('\n');
  var [delBefore, setDelBefore] = useState('');
  var [lkDays, setLkDays] = useState(7);
  var [boCode, setBoCode] = useState('');
  var [boParts, setBoParts] = useState('');
  var [boMsg, setBoMsg] = useState('');
  var [dsspMsg, setDsspMsg] = useState('');
  var [restoreMsg, setRestoreMsg] = useState('');
  var dsspRef = useRef<HTMLInputElement>(null);
  var restoreRef = useRef<HTMLInputElement>(null);

  var rowsHist = useMemo(function() {
    return p.sessions.map(function(s) { return { s: s, c: dcCounts(dcCompute(s.sapo ? s.sapo.rows : [], dcRowsOf(s), ctx)) }; });
  }, [p.sessions, ctx]);
  var lk = useMemo(function() { return dcLuyKe(p.sessions, lkDays, ctx); }, [p.sessions, lkDays, ctx]);
  var manual = p.cfg.bo.filter(function(b) { return !b.auto; });
  var auto = p.cfg.bo.filter(function(b) { return b.auto; });

  async function saveStaff() {
    var seen = new Set<string>();
    var list = staffText.split(/[\n,;]/).map(function(x) { return x.trim(); }).filter(function(x) { if (!x || seen.has(dcNkey(x))) return false; seen.add(dcNkey(x)); return true; });
    if (!list.length) { p.toast('Cần ít nhất 1 tên.'); return; }
    await p.onSaveSettings(Object.assign({}, p.cfg.settings, { cot: list }));
    setStaffDraft(null);
  }

  async function addBo() {
    var bo = boCode.trim().toUpperCase();
    var parts = parseParts(boParts, p.catalog, boMap, p.cfg.combos);
    if (!bo || !parts.length) { p.toast('Nhập mã bộ và các mã lẻ.'); return; }
    if (parts.some(function(x) { return dcNorm(x[0]) === dcNorm(bo); })) { p.toast('Mã bộ không được nằm trong chính nó.'); return; }
    var miss = parts.filter(function(x) { return Object.keys(p.catalog).length && !p.catalog[dcNorm(x[0])]; }).map(function(x) { return x[0]; });
    var next = p.cfg.bo.filter(function(x) { return dcNorm(x.bo) !== dcNorm(bo); }).concat([{ bo: bo, parts: parts, auto: false }]);
    await p.onSaveBo(next);
    setBoMsg('Đã lưu ' + bo + ' = ' + parts.map(function(x) { return x[0] + ' ×' + x[1]; }).join(' + ') + '.' + (miss.length ? ' Lưu ý: ' + miss.join(', ') + ' không có trong báo cáo Sapo.' : ''));
    setBoCode(''); setBoParts('');
  }

  async function onDssp(f: File) {
    try {
      var wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      var rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      var r = dcParseProductList(rows, p.cfg.bo);
      if (!r.combos.length) throw new Error('x');
      await p.onSaveBo(p.cfg.bo.concat(r.autoBo), r.combos);
      var miss = r.combos.filter(function(c) { return !boMap.has(dcNorm(c[0])) && !r.autoBo.some(function(a) { return dcNorm(a.bo) === dcNorm(c[0]); }); }).length;
      setDsspMsg('Đã nhận ' + r.combos.length + ' mã combo, tự thêm ' + r.autoBo.length + ' combo theo số lượng mới. ' + miss + ' combo/bộ chưa có thành phần: chỉ cần khai báo khi kho ghi mã đó vào sổ.');
    } catch { setDsspMsg('Không đọc được file. Hãy dùng file Xuất danh sách sản phẩm của Sapo (.xlsx).'); }
  }

  function boRow(b: DcBo) {
    return (
      <tr key={b.bo} className="border-t border-slate-800 align-top">
        <td className="p-2 font-mono font-semibold text-gray-100">{b.bo}</td>
        <td className="p-2 text-xs text-gray-500">{dcComboName(p.cfg.combos, b.bo).slice(0, 50)}</td>
        <td className="p-2 text-gray-300">{b.parts.map(function(x) { return x[0] + ' ×' + x[1]; }).join(' + ')}{b.parts.some(function(x) { return Object.keys(p.catalog).length > 0 && !p.catalog[dcNorm(x[0])]; }) && <span className="ml-2 text-xs text-purple-300">có mã không có trên Sapo</span>}</td>
        <td className="p-2 text-right whitespace-nowrap">
          <button className={btnCls} onClick={function() { setBoCode(b.bo); setBoParts(b.parts.map(function(x) { return x[0] + ' x' + x[1]; }).join(', ')); }}>Sửa</button>{' '}
          <button className={btnCls} onClick={function() { p.onSaveBo(p.cfg.bo.filter(function(x) { return dcNorm(x.bo) !== dcNorm(b.bo); })); }}>Bỏ</button>
        </td>
      </tr>
    );
  }

  function printSo() {
    var n = 28;
    var colsH = staff.map(function(x) { return '<th>' + x.replace(/</g, '&lt;') + '</th>'; }).join('');
    var empty = '<tr>' + '<td></td>'.repeat(staff.length + 6) + '</tr>';
    var html = '<html><head><meta charset="utf-8"><title>Sổ kho AMB</title><style>body{font:13px Arial,sans-serif;margin:14mm}table{border-collapse:collapse;width:100%}th,td{border:1px solid #444;padding:4px;height:22px;text-align:center}th{background:#eee}@page{size:A4 landscape;margin:10mm}</style></head><body>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:8px"><b style="font-size:16px">SỔ KHO AMB</b><span>Ngày: ____/____/________ &nbsp; Trang: ____</span></div>' +
      '<table><thead><tr><th style="width:16%">Mã hàng</th>' + colsH + '<th>Nhập</th><th style="width:18%">Ghi chú</th><th>Lỗi: hàng nhập</th><th>Lỗi: hàng trả</th><th>Lỗi: nhân sự</th></tr></thead><tbody>' + empty.repeat(n) + '</tbody></table>' +
      '<div style="display:flex;justify-content:space-between;margin-top:14px"><span>Người ghi: ____________________</span><span>Người kiểm: ____________________</span></div></body></html>';
    var w = window.open('', '_blank');
    if (!w) { p.toast('Trình duyệt chặn cửa sổ in, hãy cho phép cửa sổ bật lên.'); return; }
    w.document.write(html); w.document.close(); w.focus(); setTimeout(function() { if (w) w.print(); }, 300);
  }

  return (
    <div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className={cardCls + ' !mb-0'}>
          <h2 className="text-sm font-semibold text-gray-200 mb-1">Các ngày đã lưu</h2>
          <p className="text-xs text-gray-500 mb-3">Bấm vào một ngày để mở lại. Dữ liệu lưu chung trên hệ thống, mở ở máy nào cũng thấy.</p>
          <div className="overflow-auto max-h-[420px]">
            {rowsHist.length === 0 ? <div className="text-sm text-gray-500">Chưa lưu ngày nào. Đối chiếu xong một ngày rồi bấm “Lưu phiên đối chiếu”.</div> : (
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-400"><th className="p-2 text-left">Ngày</th><th className="p-2 text-right">Lệch số</th><th className="p-2 text-right">Thiếu</th><th className="p-2 text-right">Mã lạ</th><th className="p-2 text-right">Khớp</th><th className="p-2 text-left">Người lưu</th><th></th></tr></thead>
                <tbody>
                  {rowsHist.map(function(x) {
                    return (
                      <tr key={x.s.ngay} className="border-t border-slate-800 cursor-pointer hover:bg-slate-800/60" onClick={function() { p.onOpenDay(x.s.ngay); }}>
                        <td className="p-2 font-semibold text-gray-100">{dcVnDate(x.s.ngay)}</td>
                        <td className={'p-2 text-right font-mono ' + (x.c.lech ? 'text-red-300' : '')}>{x.c.lech}</td>
                        <td className={'p-2 text-right font-mono ' + (x.c.thieu ? 'text-red-300' : '')}>{x.c.thieu}</td>
                        <td className="p-2 text-right font-mono">{x.c.la}</td><td className="p-2 text-right font-mono">{x.c.khop}</td>
                        <td className="p-2 text-xs text-gray-400">{x.s.nguoiLuu || ''}</td>
                        <td className="p-2 text-right"><button className={btnCls + (conf.armed === 'd' + x.s.ngay ? ' !border-red-500 !text-red-300' : '')} onClick={function(e) { e.stopPropagation(); conf.ask('d' + x.s.ngay, function() { p.onDelete([x.s.ngay]); }); }}>{conf.armed === 'd' + x.s.ngay ? 'Bấm lần nữa để xóa' : 'Xóa'}</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {!p.allLoaded && <button className={btnCls + ' mt-3'} onClick={p.onLoadAll} disabled={p.loadingAll}>{p.loadingAll ? 'Đang tải…' : 'Tải các tháng trước'}</button>}
          <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-slate-700">
            <label className="text-sm text-gray-400">Xóa các ngày trước</label>
            <input type="date" value={delBefore} onChange={function(e) { setDelBefore(e.target.value); }} className={inputCls} />
            <button className={btnCls + (conf.armed === 'old' ? ' !border-red-500 !text-red-300' : '')} onClick={function() {
              if (!delBefore) { p.toast('Chọn ngày trước đã.'); return; }
              var olds = p.sessions.filter(function(x) { return x.ngay < delBefore; }).map(function(x) { return x.ngay; });
              if (!olds.length) { p.toast('Không có phiên nào trước ngày ' + dcVnDate(delBefore) + '.'); return; }
              conf.ask('old', function() { p.onDelete(olds); });
            }}>{conf.armed === 'old' ? 'Bấm lần nữa để xóa' : 'Xóa'}</button>
          </div>
        </div>

        <div className={cardCls + ' !mb-0'}>
          <h2 className="text-sm font-semibold text-gray-200 mb-1">Cách tính</h2>
          <p className="text-xs text-gray-500 mb-3">Áp dụng cho mọi ngày, kể cả các ngày đã lưu.</p>
          <label className="flex gap-2 items-start text-sm text-gray-300 mb-3 cursor-pointer">
            <input type="checkbox" className="mt-1" checked={p.cfg.settings.hoanVaoNhap} onChange={function(e) { p.onSaveSettings(Object.assign({}, p.cfg.settings, { hoanVaoNhap: e.target.checked })); }} />
            <span>Cột Nhập trên sổ gồm cả hàng hoàn và hủy giao quay về kho
              <span className="block text-xs text-gray-500">Bật: so với tổng nhập NCC, kiểm kê tăng, nhận từ kho khác, hàng trả lại và hủy giao trên Sapo. Tắt: bỏ hàng trả lại và hủy giao.</span></span>
          </label>
          <label className="flex gap-2 items-start text-sm text-gray-300 mb-4 cursor-pointer">
            <input type="checkbox" className="mt-1" checked={p.cfg.settings.xuatKhac} onChange={function(e) { p.onSaveSettings(Object.assign({}, p.cfg.settings, { xuatKhac: e.target.checked })); }} />
            <span>Tính cả xuất khác của Sapo vào xuất
              <span className="block text-xs text-gray-500">Bật: so tổng xuất trên sổ (các cột người xuất + 3 cột lỗi) với SL bán ra cộng kiểm kê giảm, chuyển kho, trả NCC. Tắt: chỉ so các cột người xuất với SL bán ra; hàng lỗi chỉ ghi nhận.</span></span>
          </label>
          <h3 className="text-sm font-semibold text-gray-200 mb-1">Danh sách nhân sự kho</h3>
          <p className="text-xs text-gray-500 mb-2">Mỗi dòng một tên, thứ tự là thứ tự cột trên sổ. Dán bảng có tên người mới thì tự thêm vào cuối danh sách, không ghi đè cột của người cũ. Xóa tên ở đây chỉ ẩn cột trên bảng nhập, dữ liệu cũ của người đó vẫn giữ.</p>
          <textarea rows={5} value={staffText} onChange={function(e) { setStaffDraft(e.target.value); }} className={inputCls + ' w-full max-w-xs'} />
          <div className="mt-2"><button className={btnPrimaryCls + ' !py-1.5'} onClick={saveStaff}>Lưu danh sách</button></div>
        </div>
      </div>

      <div className={cardCls + ' mt-4'}>
        <h2 className="text-sm font-semibold text-gray-200 mb-1">Sao lưu dữ liệu</h2>
        <p className="text-xs text-gray-500 mb-3">Dữ liệu đã nằm trên hệ thống, không mất khi đổi máy. File sao lưu chỉ để giữ thêm một bản hoặc nhập lại dữ liệu từ bản offline cũ.</p>
        <input ref={restoreRef} type="file" accept=".json,application/json" className="hidden" onChange={async function(e) {
          var f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
          setRestoreMsg('Đang khôi phục…'); setRestoreMsg(await p.onRestore(f));
        }} />
        <div className="flex flex-wrap items-center gap-2">
          <button className={btnPrimaryCls + ' !py-1.5'} onClick={p.onBackup}>Xuất file sao lưu (.json)</button>
          <button className={btnCls} onClick={function() { if (restoreRef.current) restoreRef.current.click(); }}>Khôi phục từ file (kể cả file của bản offline cũ)</button>
          <button className={btnCls} onClick={printSo}>In mẫu trang sổ kho</button>
          {restoreMsg && <span className="text-xs text-gray-300">{restoreMsg}</span>}
        </div>
      </div>

      <div className={cardCls}>
        <h2 className="text-sm font-semibold text-gray-200 mb-1">Combo và bộ: tách ra mã lẻ</h2>
        <p className="text-xs text-gray-500 mb-3">Sapo tự tách combo thành mã lẻ khi trừ kho, nên trang cũng tách mã combo, mã bộ trên sổ ra mã lẻ trước khi so. Biến thể màu, phân loại vẫn so riêng từng mã. Bộ (vd GH043-1) cần khai báo gồm những mã lẻ nào.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input value={boCode} onChange={function(e) { setBoCode(e.target.value); }} placeholder="Mã bộ (vd GH048-2)" className={inputCls + ' w-44'} />
          <span className="text-gray-400 text-sm">gồm</span>
          <input value={boParts} onChange={function(e) { setBoParts(e.target.value); }} placeholder="GH048 x1, GH048-1 x1" className={inputCls + ' flex-1 min-w-[220px]'} />
          <button className={btnPrimaryCls + ' !py-1.5'} onClick={addBo}>Lưu bộ</button>
        </div>
        {boMsg && <div className="text-xs text-emerald-300 mt-2">{boMsg}</div>}
        <div className="flex items-center gap-2 mt-3">
          <input ref={dsspRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={function(e) { var f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) onDssp(f); }} />
          <button className={btnCls} onClick={function() { if (dsspRef.current) dsspRef.current.click(); }}>Cập nhật mã combo từ file Danh sách sản phẩm Sapo</button>
          {dsspMsg && <span className="text-xs text-gray-300">{dsspMsg}</span>}
        </div>
        <div className="overflow-x-auto mt-3">
          {manual.length ? (
            <table className="w-full text-sm"><thead><tr className="text-xs text-gray-400"><th className="p-2 text-left">Mã bộ</th><th className="p-2 text-left">Tên combo</th><th className="p-2 text-left">Gồm</th><th></th></tr></thead><tbody>{manual.map(boRow)}</tbody></table>
          ) : <div className="text-sm text-gray-500">Chưa khai báo bộ nào. Ví dụ: mã bộ GH048-2, gồm “GH048 x1, GH048-1 x1”.</div>}
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-gray-400">{auto.length} combo theo số lượng, đã nạp sẵn từ danh sách sản phẩm (vd GH083-5 = 5 × GH083-1)</summary>
          <div className="overflow-x-auto mt-2 max-h-72 overflow-y-auto">{auto.length > 0 && <table className="w-full text-sm"><tbody>{auto.map(boRow)}</tbody></table>}</div>
        </details>
      </div>

      <div className={cardCls}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-200">Lũy kế lệch theo mã</h2>
          <select value={lkDays} onChange={function(e) { setLkDays(+e.target.value); }} className={inputCls}>
            <option value={7}>7 ngày gần nhất</option><option value={14}>14 ngày gần nhất</option><option value={30}>30 ngày gần nhất</option>
          </select>
        </div>
        <p className="text-xs text-gray-500 mt-1 mb-3">Một mã lệch hôm trước rồi bù lại hôm sau thường là do đơn ghi nhận lệch ngày, chưa chắc mất hàng.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-gray-400"><th className="p-2 text-left">Mã</th><th className="p-2 text-left">Tên</th><th className="p-2 text-right">Số ngày lệch</th><th className="p-2 text-right">Lũy kế xuất</th><th className="p-2 text-right">Lũy kế nhập</th><th className="p-2 text-left">Nhận xét</th></tr></thead>
            <tbody>
              {lk.rows.map(function(a) {
                return (
                  <tr key={a.ma} className="border-t border-slate-800">
                    <td className="p-2 font-mono font-semibold text-gray-100">{a.ma}</td><td className="p-2 text-xs text-gray-400">{a.ten}</td>
                    <td className="p-2 text-right font-mono">{a.days}/{lk.soNgay}</td>
                    <td className="p-2 text-right font-mono">{dcFmtD(dcR3(a.dBan))}</td><td className="p-2 text-right font-mono">{dcFmtD(dcR3(a.dNhap))}</td>
                    <td className="p-2">{a.tot === 0 ? <span className="px-2 py-0.5 rounded text-xs bg-emerald-500/15 text-emerald-300">Đã tự bù</span> : <span className="px-2 py-0.5 rounded text-xs bg-red-500/15 text-red-300">Còn lệch</span>}</td>
                  </tr>
                );
              })}
              {lk.rows.length === 0 && <tr><td colSpan={6} className="p-4 text-gray-500">Không có mã nào lệch trong {lk.soNgay} ngày đã lưu.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
