'use client';

import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  DC_CH, DC_LOI_TEN, dcBoMap, dcBuildPrompt, dcCompute, dcComboName, dcCounts, dcFmt, dcFmtD, dcIsKnown, dcNkey, dcNorm, dcNum, dcNsGet, dcParsePasted, dcStaff, dcSuggest, dcVnDate,
  type DcCatalog, type DcConfig, type DcResult, type DcSapo, type DcSession, type DcStatus,
} from '@/lib/doichieu';
import { btnCls, btnPrimaryCls, cardCls, inputCls, newUiRow, type UiRow } from './shared';

export interface DayProps {
  date: string;
  setDate: (d: string) => void;
  cfg: DcConfig;
  catalog: DcCatalog;
  sapo: DcSapo | null;
  rows: UiRow[];
  setRows: (rows: UiRow[]) => void;
  current: DcSession | null;
  dirty: boolean;
  nguoi: string;
  setNguoi: (s: string) => void;
  saving: boolean;
  missing: string[];
  onSapoFile: (f: File) => Promise<void>;
  onStaffNew: (names: string[]) => void;
  onSave: () => void;
  onDirty: () => void;
}

var STL: Record<DcStatus, string> = { lech: 'Lệch số', thieu: 'Thiếu trong sổ', la: 'Mã không có trên Sapo', khop: 'Khớp' };
var TAG: Record<DcStatus, string> = {
  lech: 'bg-red-500/15 text-red-300', thieu: 'bg-amber-500/15 text-amber-300', la: 'bg-purple-500/15 text-purple-300', khop: 'bg-emerald-500/15 text-emerald-300',
};

function dCell(d: number) {
  var cls = d > 0 ? 'text-amber-300' : d < 0 ? 'text-red-300' : 'text-gray-500';
  return <span className={'font-mono ' + cls}>{d ? dcFmtD(d) : '0'}</span>;
}

export default function DayView(p: DayProps) {
  var [filter, setFilter] = useState<'van-de' | DcStatus | 'tat-ca'>('van-de');
  var [pasteOpen, setPasteOpen] = useState(false);
  var [pasteText, setPasteText] = useState('');
  var [pasteMsg, setPasteMsg] = useState('');
  var [msg, setMsg] = useState('');
  var [undo, setUndo] = useState<UiRow[] | null>(null);
  var fileRef = useRef<HTMLInputElement>(null);

  var staff = dcStaff(p.cfg.settings);
  var ctx = useMemo(function() { return { bo: p.cfg.bo, combos: p.cfg.combos, catalog: p.catalog, settings: p.cfg.settings }; }, [p.cfg, p.catalog]);
  var boMap = useMemo(function() { return dcBoMap(p.cfg.bo); }, [p.cfg.bo]);
  var ready = !!p.sapo && p.rows.length > 0;
  var res: DcResult[] = useMemo(function() { return ready && p.sapo ? dcCompute(p.sapo.rows, p.rows, ctx) : []; }, [ready, p.sapo, p.rows, ctx]);
  var counts = dcCounts(res);
  var problems = counts.lech + counts.thieu + counts.la;
  var catalogEmpty = Object.keys(p.catalog).length === 0;

  // Cột người: danh sách nhân sự + tên lạ có số trong ngày (đánh dấu *)
  var cols = useMemo(function() {
    var c = staff.slice();
    p.rows.forEach(function(r) { Object.keys(r.ns).forEach(function(n) { if (dcNum(r.ns[n]) && !c.some(function(x) { return dcNkey(x) === dcNkey(n); })) c.push(n); }); });
    return c;
  }, [staff, p.rows]);

  function upd(id: number, fn: (r: UiRow) => UiRow) {
    p.setRows(p.rows.map(function(r) { return r.id === id ? fn(r) : r; }));
    p.onDirty();
  }
  function addRow() { p.setRows(p.rows.concat([newUiRow()])); p.onDirty(); }

  function doPaste() {
    var known = function(ma: string) { return dcIsKnown(ma, { catalog: p.catalog, bo: p.cfg.bo }); };
    var r = dcParsePasted(pasteText, staff, known);
    if (r.moi.length) p.onStaffNew(r.moi);
    if (r.add.length) { p.setRows(p.rows.concat(r.add.map(function(x) { return newUiRow(x); }))); p.onDirty(); }
    setPasteMsg('Đã thêm ' + r.add.length + ' dòng có số liệu.' +
      (r.moi.length ? ' Đã tự thêm nhân sự mới vào danh sách: ' + r.moi.join(', ') + '.' : '') +
      (r.khongTieuDe && r.add.length ? ' Bảng không có dòng tiêu đề nên đã xếp số theo thứ tự danh sách hiện tại (' + staff.join(', ') + '); nên copy kèm dòng tiêu đề để không gán nhầm người.' : '') +
      (r.bad.length ? ' Bỏ qua ' + r.bad.length + ' dòng không đọc được: ' + r.bad.slice(0, 3).join(' / ') : ''));
    if (!r.bad.length) setPasteText('');
  }

  function exportExcel() {
    var aoa: Array<Array<string | number>> = [['Ngày', dcVnDate(p.date)], [], ['Kết quả', 'Mã', 'Tên', 'Đọc chưa chắc', 'Ghi chú', 'Sổ xuất', 'Sapo xuất', 'Lệch xuất', 'Sổ nhập', 'Sapo nhập', 'Lệch nhập']];
    res.forEach(function(r) { aoa.push([STL[r.st], r.ma, r.ten, r.unsure ? 'x' : '', r.why, r.sBan, r.pBan, r.dBan, r.sNhap, r.pNhap, r.dNhap]); });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Doi chieu');
    var so: Array<Array<string | number>> = [['Mã'].concat(cols, ['Nhập'], DC_LOI_TEN, ['Ghi chú'])];
    p.rows.forEach(function(r) { so.push(([r.ma] as Array<string | number>).concat(cols.map(function(n) { return dcNsGet(r.ns, n); }), DC_CH.map(function(c) { return r.v[c]; }), [r.note || ''])); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(so), 'So kho');
    XLSX.writeFile(wb, 'doi-chieu-kho-' + p.date + '.xlsx');
  }

  async function copyPrompt() {
    try { await navigator.clipboard.writeText(dcBuildPrompt(staff)); setMsg('Đã sao chép câu lệnh. Gửi kèm ảnh sổ vào Claude (claude.ai) rồi copy bảng trả về.'); }
    catch { setMsg('Không sao chép được, hãy bôi đen câu lệnh trong ô rồi copy.'); }
  }

  var shown = res.filter(function(r) { return filter === 'tat-ca' ? true : filter === 'van-de' ? r.st !== 'khop' : r.st === filter; });
  var sapoBanner: string[] = [];
  if (p.sapo && p.sapo.to && p.sapo.to !== p.date) sapoBanner.push('File Sapo là ngày ' + dcVnDate(p.sapo.from) + (p.sapo.from !== p.sapo.to ? ' – ' + dcVnDate(p.sapo.to) : '') + ', khác ngày đang đối chiếu ' + dcVnDate(p.date) + '.');
  if (p.sapo && p.sapo.from && p.sapo.to && p.sapo.from !== p.sapo.to) sapoBanner.push('Báo cáo Sapo đang lọc nhiều ngày. Hãy xuất lại với “Từ ngày” và “Đến ngày” trùng nhau.');

  return (
    <div>
      {p.missing.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">
          Chưa lưu đối chiếu các ngày: {p.missing.map(function(d, i) {
            return <button key={d} className="underline mx-1 hover:text-amber-100" onClick={function() { p.setDate(d); }}>{dcVnDate(d).slice(0, 5)}{i < p.missing.length - 1 ? ',' : ''}</button>;
          })} (bỏ qua Chủ nhật).
        </div>
      )}
      {sapoBanner.map(function(t, i) {
        return <div key={i} className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">
          {t} {i === 0 && p.sapo && p.sapo.to && p.sapo.to !== p.date && <button className={btnCls + ' ml-2'} onClick={function() { p.setDate((p.sapo as DcSapo).to as string); }}>Chuyển sang {dcVnDate(p.sapo.to)}</button>}
        </div>;
      })}
      {p.dirty && p.current && <div className="mb-3 p-3 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sm text-sky-200">Có thay đổi chưa lưu so với bản đã lưu của ngày này.</div>}

      <div className="grid md:grid-cols-2 gap-4">
        <div className={cardCls + ' !mb-0'}>
          <h2 className="text-sm font-semibold text-gray-200 mb-1"><span className="inline-flex w-5 h-5 mr-2 rounded-full bg-blue-600 text-white text-xs items-center justify-center">1</span>Báo cáo xuất nhập tồn Sapo</h2>
          <p className="text-xs text-gray-500 mb-3">File Excel tải từ Sapo, lọc đúng 1 ngày (Từ ngày = Đến ngày).</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={function(e) { var f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) p.onSapoFile(f); }} />
          <div className="border-2 border-dashed border-slate-600 hover:border-blue-500 rounded-xl p-5 text-center cursor-pointer"
            onClick={function() { if (fileRef.current) fileRef.current.click(); }}
            onDragOver={function(e) { e.preventDefault(); }}
            onDrop={function(e) { e.preventDefault(); var f = e.dataTransfer.files[0]; if (f) p.onSapoFile(f); }}>
            <div className="text-sm text-gray-300">{p.sapo ? 'Đã có báo cáo. Chọn file khác để thay.' : 'Chọn hoặc kéo file .xlsx vào đây'}</div>
          </div>
          {p.sapo && (
            <div className="text-xs text-gray-400 mt-2">
              Ngày <b className="text-gray-200">{dcVnDate(p.sapo.from)}{p.sapo.to !== p.sapo.from ? ' – ' + dcVnDate(p.sapo.to) : ''}</b>, <b className="text-gray-200">{p.sapo.rows.length}</b> mã có phát sinh, tổng bán ra <b className="text-gray-200">{dcFmt(p.sapo.rows.reduce(function(a, r) { return a + dcNum(r.f.banRa); }, 0))}</b>.
            </div>
          )}
        </div>
        <div className={cardCls + ' !mb-0'}>
          <h2 className="text-sm font-semibold text-gray-200 mb-1"><span className="inline-flex w-5 h-5 mr-2 rounded-full bg-blue-600 text-white text-xs items-center justify-center">2</span>Chép sổ kho thành bảng</h2>
          <p className="text-xs text-gray-500 mb-2">Gửi ảnh sổ vào Claude (claude.ai) kèm câu lệnh dưới đây, copy bảng Claude trả về rồi bấm “Dán bảng” ở bước 3. Hoặc “Thêm dòng” để gõ tay.</p>
          <textarea readOnly rows={5} value={dcBuildPrompt(staff)} className={inputCls + ' w-full text-xs'} />
          <div className="flex gap-2 mt-2">
            <button className={btnCls} onClick={copyPrompt}>Sao chép câu lệnh</button>
            <button className={btnCls} onClick={function() { setPasteOpen(true); }}>Mở ô Dán bảng</button>
          </div>
          {msg && <div className="text-xs text-emerald-300 mt-2">{msg}</div>}
        </div>
      </div>

      <div className={cardCls + ' mt-4 !p-0 overflow-hidden'}>
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-gray-200"><span className="inline-flex w-5 h-5 mr-2 rounded-full bg-blue-600 text-white text-xs items-center justify-center">3</span>Sổ kho ngày {dcVnDate(p.date)}</h2>
          <div className="flex gap-2">
            <button className={btnCls} onClick={function() { setPasteOpen(!pasteOpen); }}>Dán bảng</button>
            <button className={btnCls} onClick={addRow}>Thêm dòng</button>
            <button className={btnCls} disabled={!p.rows.length} onClick={function() { var prev = p.rows; p.setRows([]); p.onDirty(); setUndo(prev); }}>Xóa bảng</button>
          </div>
        </div>
        {undo && <div className="px-4 py-2 text-xs text-gray-300 border-b border-slate-700">Đã xóa {undo.length} dòng. <button className="underline text-blue-300" onClick={function() { p.setRows(undo as UiRow[]); p.onDirty(); setUndo(null); }}>Hoàn tác</button></div>}
        {pasteOpen && (
          <div className="p-4 border-b border-slate-700">
            <p className="text-xs text-gray-500 mb-2">Mỗi dòng một mã: Mã, {staff.join(', ')}, Nhập, Hàng nhập, Hàng trả, Nhân sự (lỗi), Ghi chú. Dán thẳng từ Google Sheet/Excel được, copy kèm dòng tiêu đề để tự nhận cột.</p>
            <textarea rows={6} value={pasteText} onChange={function(e) { setPasteText(e.target.value); }} className={inputCls + ' w-full'} placeholder={'SKU\t' + staff.join('\t') + '\tNhập\tGhi chú\tHàng nhập\tHàng trả\tNhân sự\nGH040-1\t500\t300\t…'} />
            <div className="flex items-center gap-2 mt-2">
              <button className={btnPrimaryCls + ' !py-1.5'} onClick={doPaste} disabled={!pasteText.trim()}>Thêm vào bảng</button>
              <button className={btnCls} onClick={function() { setPasteOpen(false); }}>Đóng</button>
              {pasteMsg && <span className="text-xs text-gray-300">{pasteMsg}</span>}
            </div>
          </div>
        )}
        {p.rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">Chưa có dòng nào. Bấm “Dán bảng” để dán bảng chép từ ảnh sổ, hoặc “Thêm dòng” để nhập tay.</div>
        ) : (
          <div className="overflow-x-auto">
            <datalist id="dc-sku-list">
              {Object.keys(p.catalog).map(function(k) { return <option key={k} value={p.catalog[k].ma}>{p.catalog[k].ten.slice(0, 50)}</option>; })}
              {p.cfg.bo.filter(function(b) { return !p.catalog[dcNorm(b.bo)]; }).map(function(b) { return <option key={'b' + b.bo} value={b.bo}>Bộ/combo</option>; })}
            </datalist>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 bg-slate-800/60">
                  <th className="p-2 text-left min-w-[170px]">Mã hàng</th>
                  {cols.map(function(n) { return <th key={n} className="p-2 text-right">{n}{staff.some(function(c) { return dcNkey(c) === dcNkey(n); }) ? '' : <span title="Tên không có trong danh sách nhân sự" className="text-amber-400"> *</span>}</th>; })}
                  <th className="p-2 text-right">Nhập</th>
                  <th className="p-2 text-right text-red-300">Lỗi: hàng nhập</th>
                  <th className="p-2 text-right text-red-300">Lỗi: hàng trả</th>
                  <th className="p-2 text-right text-red-300">Lỗi: nhân sự</th>
                  <th className="p-2 text-left min-w-[160px]">Ghi chú</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {p.rows.map(function(r) {
                  var known = !r.ma || dcIsKnown(r.ma, { catalog: p.catalog, bo: p.cfg.bo }) || catalogEmpty;
                  var hint: React.ReactNode = null;
                  if (!known) {
                    var sg = Array.from(new Set(([r.goiY] as Array<string | null>).concat(dcSuggest(r.ma, p.catalog)).filter(Boolean))) as string[];
                    var cn = dcComboName(p.cfg.combos, r.ma);
                    hint = cn ? <div className="text-xs text-purple-300">Mã combo “{cn.slice(0, 40)}”, chưa khai báo thành phần.</div>
                      : <div className="text-xs text-purple-300">Mã không có trên Sapo. {sg.map(function(x) { return <button key={x} className="ml-1 px-1.5 rounded bg-purple-500/20 hover:bg-purple-500/40" onClick={function() { upd(r.id, function(o) { return Object.assign({}, o, { ma: x, goiY: null }); }); }}>{x}</button>; })}</div>;
                  } else if (r.ma && p.catalog[dcNorm(r.ma)]) hint = <div className="text-xs text-gray-500">{p.catalog[dcNorm(r.ma)].ten.slice(0, 60)}</div>;
                  else if (r.ma && boMap.has(dcNorm(r.ma))) hint = <div className="text-xs text-gray-500">Bộ: {(boMap.get(dcNorm(r.ma)) as { parts: Array<[string, number]> }).parts.map(function(x) { return x[0] + ' ×' + x[1]; }).join(' + ')}</div>;
                  return (
                    <tr key={r.id} className={'border-t border-slate-800 align-top ' + (r.unsure ? 'bg-amber-500/10' : '')}>
                      <td className="p-1">
                        <input list="dc-sku-list" value={r.ma} autoComplete="off" aria-label="Mã hàng"
                          onChange={function(e) { var v = e.target.value; upd(r.id, function(o) { return Object.assign({}, o, { ma: v.trim() }); }); }}
                          className={inputCls + ' w-full font-mono !py-1 ' + (known ? '' : '!border-purple-500')} />
                        {hint}
                      </td>
                      {cols.map(function(n) {
                        var q = dcNsGet(r.ns, n);
                        return <td key={n} className="p-1"><input inputMode="decimal" aria-label={n} value={q ? String(q) : ''} className={inputCls + ' w-16 text-right !py-1'}
                          onChange={function(e) {
                            var v = e.target.value;
                            upd(r.id, function(o) {
                              var ns = Object.assign({}, o.ns);
                              var key = Object.keys(ns).find(function(x) { return dcNkey(x) === dcNkey(n); }) || n;
                              if (dcNum(v)) ns[key] = dcNum(v); else delete ns[key];
                              return Object.assign({}, o, { ns: ns });
                            });
                          }} /></td>;
                      })}
                      {DC_CH.map(function(c, i) {
                        return <td key={c} className="p-1"><input inputMode="decimal" aria-label={i === 0 ? 'Nhập' : DC_LOI_TEN[i - 1]} value={r.v[c] ? String(r.v[c]) : ''}
                          className={inputCls + ' w-16 text-right !py-1 ' + (i > 0 ? '!text-red-300' : '')}
                          onChange={function(e) { var v = dcNum(e.target.value); upd(r.id, function(o) { return Object.assign({}, o, { v: Object.assign({}, o.v, { [c]: v }) }); }); }} /></td>;
                      })}
                      <td className="p-1"><input value={r.note || ''} aria-label="Ghi chú" className={inputCls + ' w-full !py-1'}
                        onChange={function(e) { var v = e.target.value; upd(r.id, function(o) { return Object.assign({}, o, { note: v }); }); }} /></td>
                      <td className="p-1"><button aria-label="Xóa dòng" className="text-gray-500 hover:text-red-400 px-2" onClick={function() { p.setRows(p.rows.filter(function(x) { return x.id !== r.id; })); p.onDirty(); }}>×</button></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-700 text-xs text-gray-300 bg-slate-800/40">
                  <td className="p-2">Tổng {p.rows.length} dòng</td>
                  {cols.map(function(n) { return <td key={n} className="p-2 text-right font-mono">{dcFmt(p.rows.reduce(function(a, r) { return a + dcNsGet(r.ns, n); }, 0))}</td>; })}
                  {DC_CH.map(function(c) { return <td key={c} className="p-2 text-right font-mono">{dcFmt(p.rows.reduce(function(a, r) { return a + dcNum(r.v[c]); }, 0))}</td>; })}
                  <td></td><td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div className={cardCls}>
        <h2 className="text-sm font-semibold text-gray-200 mb-1"><span className="inline-flex w-5 h-5 mr-2 rounded-full bg-blue-600 text-white text-xs items-center justify-center">4</span>Kết quả đối chiếu</h2>
        <p className="text-xs text-gray-400 mb-3">
          {!ready
            ? (!p.sapo && !p.rows.length ? 'Cần đủ báo cáo Sapo và số liệu sổ kho.' : !p.sapo ? 'Còn thiếu báo cáo Sapo ở bước 1.' : 'Còn thiếu số liệu sổ kho ở bước 3.')
            : (problems ? problems + ' mã cần xem lại.' + (counts.unsure ? ' ' + counts.unsure + ' mã có ô đọc chưa chắc, hãy so lại với ảnh.' : '') : 'Sổ kho khớp với Sapo.' + (counts.unsure ? ' Vẫn còn ' + counts.unsure + ' mã có ô đọc chưa chắc.' : ''))}
        </p>
        {ready && (
          <>
            <div className="flex flex-wrap gap-2 mb-3">
              {([['van-de', 'Cần xem lại', problems], ['lech', 'Lệch số', counts.lech], ['thieu', 'Thiếu trong sổ', counts.thieu], ['la', 'Mã không có trên Sapo', counts.la], ['khop', 'Khớp', counts.khop], ['tat-ca', 'Tất cả', res.length]] as Array<[typeof filter, string, number]>).map(function(c) {
                return <button key={c[0]} onClick={function() { setFilter(c[0]); }} aria-pressed={filter === c[0]}
                  className={'px-3 py-1 rounded-full text-xs border ' + (filter === c[0] ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-600 text-gray-300 hover:bg-slate-700')}>{c[1]} <b>{c[2]}</b></button>;
              })}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500"><th colSpan={3}></th><th colSpan={3} className="text-center border-b border-slate-700">Xuất (Sapo: {p.cfg.settings.xuatKhac ? 'bán ra + xuất khác' : 'SL bán ra'})</th><th colSpan={3} className="text-center border-b border-slate-700">Nhập</th></tr>
                  <tr className="text-xs text-gray-400"><th className="p-2 text-left">Kết quả</th><th className="p-2 text-left">Mã</th><th className="p-2 text-left">Tên trên Sapo</th><th className="p-2 text-right">Sổ</th><th className="p-2 text-right">Sapo</th><th className="p-2 text-right">Lệch</th><th className="p-2 text-right">Sổ</th><th className="p-2 text-right">Sapo</th><th className="p-2 text-right">Lệch</th></tr>
                </thead>
                <tbody>
                  {shown.map(function(r) {
                    return (
                      <tr key={r.k} className="border-t border-slate-800 align-top">
                        <td className="p-2"><span className={'px-2 py-0.5 rounded text-xs ' + TAG[r.st]}>{STL[r.st]}</span>{r.unsure && <span className="ml-1 px-2 py-0.5 rounded text-xs bg-amber-500/15 text-amber-300">đọc chưa chắc</span>}{r.why && <div className="text-xs text-gray-500 mt-1 max-w-[260px]">{r.why}</div>}</td>
                        <td className="p-2 font-mono font-semibold text-gray-100">{r.ma}</td>
                        <td className="p-2 text-xs text-gray-400 max-w-[220px]">{r.ten}</td>
                        <td className="p-2 text-right font-mono">{dcFmt(r.sBan)}</td><td className="p-2 text-right font-mono text-gray-400">{dcFmt(r.pBan)}</td><td className="p-2 text-right">{dCell(r.dBan)}</td>
                        <td className="p-2 text-right font-mono">{dcFmt(r.sNhap)}</td><td className="p-2 text-right font-mono text-gray-400">{dcFmt(r.pNhap)}</td><td className="p-2 text-right">{dCell(r.dNhap)}</td>
                      </tr>
                    );
                  })}
                  {shown.length === 0 && <tr><td colSpan={9} className="p-4 text-gray-500 text-sm">Không có mã nào trong nhóm này.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2 mt-4 pt-3 border-t border-slate-700">
          <span className="text-xs text-gray-400 mr-auto">
            {p.current ? 'Đã lưu' + (p.current.nguoiLuu ? ' bởi ' + p.current.nguoiLuu : '') + (p.current.luuLuc ? ' lúc ' + new Date(p.current.luuLuc).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '') + '.' + (p.dirty ? ' Có thay đổi chưa lưu.' : '') : 'Ngày này chưa lưu.'}
          </span>
          <input value={p.nguoi} onChange={function(e) { p.setNguoi(e.target.value); }} placeholder="Tên người lưu" className={inputCls + ' w-40'} />
          {ready && <button className={btnCls} onClick={exportExcel}>Tải Excel kết quả</button>}
          <button className={btnPrimaryCls} disabled={!ready || p.saving} onClick={p.onSave}>{p.saving ? 'Đang lưu…' : 'Lưu phiên đối chiếu'}</button>
        </div>
      </div>
    </div>
  );
}
