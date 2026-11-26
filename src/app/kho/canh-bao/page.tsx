'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAppState } from '@/lib/store';
import { dbCanhBaoAction, dbCanhBaoLark, dbGetCanhBao } from '@/lib/db';
import { CB_KHO, CB_KHO_LABEL, CB_STATUS_LABEL, cbAddDays, type CbKho, type CbReport, type CbRow, type CbStatus } from '@/lib/canhbao';

var inputCls = 'px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none';
var cardCls = 'bg-slate-900 border border-slate-700 rounded-xl p-4 mb-4';
var btnCls = 'px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-gray-200 text-sm rounded-lg disabled:opacity-50';
var btnPrimaryCls = 'px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50';

var BADGE: Record<CbStatus, string> = {
  'het': 'bg-red-600 text-white', 'gap': 'bg-red-500/25 text-red-300', 'dat': 'bg-orange-500/25 text-orange-300', 'sap': 'bg-yellow-500/20 text-yellow-200',
  'cho': 'bg-blue-500/20 text-blue-300', 'chua-ton': 'bg-fuchsia-500/20 text-fuchsia-300', 'du': 'bg-green-500/20 text-green-300', 'khong-ban': 'bg-slate-700 text-gray-300', 'ngung': 'bg-slate-700 text-gray-400',
};

type Filter = 'can-nhap' | CbStatus | 'tat-ca';
var NEED: CbStatus[] = ['het', 'gap', 'dat'];

var fmt = function(n: number, d = 0) { return n.toLocaleString('vi-VN', { maximumFractionDigits: d }); };
var dm = function(d: string) { return d.slice(8, 10) + '/' + d.slice(5, 7); };
// Tìm không phân biệt dấu và hoa thường
var fold = function(s: string) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase(); };

export default function CanhBaoPage() {
  var { currentUser } = useAppState();
  var isAdmin = !!currentUser && currentUser.role === 'admin';
  var allowed = isAdmin || (!!currentUser && currentUser.role === 'warehouse');

  var [r, setR] = useState<CbReport | null>(null);
  var [err, setErr] = useState('');
  var [busy, setBusy] = useState(false);
  var [toast, setToast] = useState('');
  var [kho, setKho] = useState<CbKho>('HN');
  var [flt, setFlt] = useState<Filter>('can-nhap');
  var [q, setQ] = useState('');
  var [open, setOpen] = useState('');
  var [form, setForm] = useState({ qty: '', eta: '', lead: '' });
  var [cfg, setCfg] = useState<{ leadDays: string; safetyDays: string; cycleDays: string } | null>(null);
  var [preview, setPreview] = useState('');

  useEffect(function() {
    if (!allowed) return;
    dbGetCanhBao().then(setR).catch(function(e) { setErr(e instanceof Error ? e.message : String(e)); });
  }, [allowed]);

  var khoRows = useMemo(function() { return r ? r.rows.filter(function(x) { return x.kho === kho; }) : []; }, [r, kho]);
  var count = function(st: CbStatus) { return khoRows.filter(function(x) { return x.status === st; }).length; };
  var rows = useMemo(function() {
    var term = fold(q.trim());
    return khoRows.filter(function(x) {
      if (term) return fold(x.product).indexOf(term) >= 0;
      if (flt === 'tat-ca') return true;
      if (flt === 'can-nhap') return NEED.indexOf(x.status) >= 0;
      return x.status === flt;
    });
  }, [khoRows, flt, q]);

  function say(m: string) { setToast(m); setTimeout(function() { setToast(''); }, 5000); }

  async function run(fn: () => Promise<CbReport>, done: string) {
    setBusy(true);
    try { setR(await fn()); say(done); return true; }
    catch (e) { say(e instanceof Error ? e.message : String(e)); return false; }
    finally { setBusy(false); }
  }

  function openRow(x: CbRow) {
    var k = x.product + '|' + x.kho;
    if (open === k) { setOpen(''); return; }
    var ps = r && r.productSettings[x.product];
    setOpen(k);
    setForm({ qty: x.suggest ? String(x.suggest) : '', eta: r ? cbAddDays(r.today, x.leadDays) : '', lead: ps && ps.leadDays ? String(ps.leadDays) : '' });
  }

  function exportExcel() {
    if (!r) return;
    var wb = XLSX.utils.book_new();
    CB_KHO.forEach(function(k) {
      var list = r!.rows.filter(function(x) { return x.kho === k && (x.suggest > 0 || NEED.indexOf(x.status) >= 0 || x.status === 'chua-ton'); });
      var data = list.map(function(x) {
        return {
          'Trạng thái': CB_STATUS_LABEL[x.status], 'Sản phẩm': x.product, 'Tồn có thể bán': x.stock === null ? '' : Math.round(x.stock),
          'Bán 7 ngày': x.sold7, 'Bán 30 ngày': x.sold30, 'Bán/ngày': Math.round(x.daily * 10) / 10, 'Còn đủ (ngày)': x.daysLeft === null ? '' : Math.floor(x.daysLeft),
          'Đang về': x.incoming, 'Ngày về': x.nextEta || '', 'Thời gian hàng về (ngày)': x.leadDays, 'Đề xuất nhập': x.status === 'chua-ton' ? '' : x.suggest,
        };
      });
      var ws = XLSX.utils.json_to_sheet(data.length ? data : [{ 'Sản phẩm': 'Không có mã nào cần nhập' }]);
      ws['!cols'] = [{ wch: 16 }, { wch: 44 }].concat(Array(9).fill({ wch: 14 }));
      XLSX.utils.book_append_sheet(wb, ws, CB_KHO_LABEL[k]);
    });
    XLSX.writeFile(wb, 'De-xuat-nhap-hang-' + r.today + (r.stockStale ? '-TON-CU' : '') + '.xlsx');
  }

  async function lark(send: boolean) {
    setBusy(true);
    try {
      var res = await dbCanhBaoLark(send);
      setPreview(res.text);
      if (res.sent) say('Đã gửi tin vào nhóm Lark');
    } catch (e) { say(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }

  if (!currentUser) return null;
  if (!allowed) return <p className="text-gray-400">Trang này dành cho admin và nhân sự kho.</p>;
  if (err) return <div className="bg-red-500/10 border border-red-500/40 text-red-300 rounded-xl p-4">Không tải được cảnh báo: {err}</div>;
  if (!r) return <p className="text-gray-400">Đang tính cảnh báo tồn kho…</p>;

  var cards: Array<{ key: Filter; label: string; n: number; color: string }> = [
    { key: 'het', label: 'Hết hàng', n: count('het'), color: 'text-red-400' },
    { key: 'gap', label: 'Khẩn: hết trước khi hàng mới về', n: count('gap'), color: 'text-red-300' },
    { key: 'dat', label: 'Đặt ngay', n: count('dat'), color: 'text-orange-300' },
    { key: 'sap', label: 'Sắp đến hạn', n: count('sap'), color: 'text-yellow-200' },
    { key: 'cho', label: 'Chờ hàng về', n: count('cho'), color: 'text-blue-300' },
    { key: 'chua-ton', label: 'Chưa có số tồn', n: count('chua-ton'), color: 'text-fuchsia-300' },
  ];

  return (
    <div className="pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Cảnh báo nhập hàng</h1>
          <p className="text-sm text-gray-400 mt-1">
            Tồn đồng bộ Sapo: {r.stockAt ? dm(r.stockAt) : 'chưa có'} · Bán hàng: {r.salesTo && r.salesFrom ? dm(r.salesFrom) + ' đến ' + dm(r.salesTo) + ' (' + r.salesDays + ' ngày)' : 'chưa có dữ liệu'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btnCls} onClick={exportExcel}>Tải Excel đề xuất nhập</button>
          {isAdmin && <button className={btnCls} disabled={busy} onClick={function() { lark(false); }}>Xem tin Lark</button>}
          {isAdmin && <button className={btnCls} onClick={function() { setCfg(cfg ? null : { leadDays: String(r!.settings.leadDays), safetyDays: String(r!.settings.safetyDays), cycleDays: String(r!.settings.cycleDays) }); }}>Cài đặt</button>}
        </div>
      </div>

      {r.stockStale && (
        <div className="bg-red-500/15 border border-red-500/50 text-red-200 rounded-xl p-4 mb-4">
          <b>Số tồn đã cũ{r.stockAgeDays !== null ? ' ' + r.stockAgeDays + ' ngày' : ''}.</b> Chưa nên đặt hàng theo bảng dưới. Hãy đăng nhập Sapo rồi đồng bộ tồn kho, sau đó tải lại trang.
        </div>
      )}
      {r.lateShops.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/40 text-yellow-100 rounded-xl p-3 mb-4 text-sm">
          Thiếu file bán hàng mới (tốc độ bán có thể thấp hơn thật): {r.lateShops.map(function(x) { return x.name + (x.last ? ' (đến ' + dm(x.last) + ')' : ' (chưa có)'); }).join(', ')}
        </div>
      )}

      {cfg && (
        <div className={cardCls}>
          <div className="flex flex-wrap items-end gap-3">
            {([['leadDays', 'Đặt đến khi hàng về (ngày)'], ['safetyDays', 'Dự phòng (ngày)'], ['cycleDays', 'Mỗi lần nhập đủ bán thêm (ngày)']] as const).map(function(f) {
              return (
                <label key={f[0]} className="text-xs text-gray-400 flex flex-col gap-1">{f[1]}
                  <input type="number" min={0} max={365} className={inputCls + ' w-48'} value={cfg![f[0]]} onChange={function(e) { setCfg({ ...cfg!, [f[0]]: e.target.value }); }} />
                </label>
              );
            })}
            <button className={btnPrimaryCls} disabled={busy} onClick={async function() {
              if (await run(function() { return dbCanhBaoAction('settings', { leadDays: Number(cfg!.leadDays), safetyDays: Number(cfg!.safetyDays), cycleDays: Number(cfg!.cycleDays) }); }, 'Đã lưu cài đặt')) setCfg(null);
            }}>Lưu</button>
          </div>
        </div>
      )}

      {preview && (
        <div className={cardCls}>
          <pre className="whitespace-pre-wrap text-sm text-gray-200 font-sans max-h-80 overflow-auto">{preview}</pre>
          <div className="flex gap-2 mt-3">
            <button className={btnPrimaryCls} disabled={busy} onClick={function() { lark(true); }}>Gửi vào nhóm Lark ngay</button>
            <button className={btnCls} onClick={function() { setPreview(''); }}>Đóng</button>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-3">
        {CB_KHO.map(function(k) {
          return <button key={k} onClick={function() { setKho(k); setOpen(''); }} className={'px-4 py-2 rounded-lg text-sm font-medium ' + (kho === k ? 'bg-blue-600 text-white' : 'bg-slate-800 text-gray-300')}>{CB_KHO_LABEL[k]}</button>;
        })}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        {cards.map(function(c) {
          return (
            <button key={c.key} onClick={function() { setFlt(flt === c.key ? 'can-nhap' : c.key); setQ(''); }} className={'text-left bg-slate-900 border rounded-xl p-3 ' + (flt === c.key ? 'border-blue-500' : 'border-slate-700')}>
              <div className={'text-2xl font-bold ' + c.color}>{c.n}</div>
              <div className="text-xs text-gray-400">{c.label}</div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <input className={inputCls + ' flex-1 min-w-48'} placeholder="Tìm sản phẩm…" value={q} onChange={function(e) { setQ(e.target.value); }} />
        <select className={inputCls} value={flt} onChange={function(e) { setFlt(e.target.value as Filter); setQ(''); }}>
          <option value="can-nhap">Cần nhập (hết, khẩn, đặt ngay)</option>
          <option value="tat-ca">Tất cả</option>
          {(Object.keys(CB_STATUS_LABEL) as CbStatus[]).map(function(s) { return <option key={s} value={s}>{CB_STATUS_LABEL[s]}</option>; })}
        </select>
      </div>

      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-xs border-b border-slate-700">
              <th className="text-left px-3 py-2">Sản phẩm</th>
              <th className="text-right px-3 py-2">Tồn</th>
              <th className="text-right px-3 py-2">Bán/ngày</th>
              <th className="text-right px-3 py-2">Còn đủ</th>
              <th className="text-right px-3 py-2">Đang về</th>
              <th className="text-right px-3 py-2">Đề xuất nhập</th>
            </tr>
          </thead>
          {rows.map(function(x) {
            var k = x.product + '|' + x.kho;
            var ps = r!.productSettings[x.product];
            return (
              <tbody key={k}>
                <tr className="border-b border-slate-800 cursor-pointer hover:bg-slate-800/60" onClick={function() { openRow(x); }}>
                  <td className="px-3 py-2 min-w-56">
                    <div className="text-gray-100">{x.product}</div>
                    <span className={'inline-block mt-1 px-2 py-0.5 rounded text-[11px] ' + BADGE[x.status]}>{CB_STATUS_LABEL[x.status]}</span>
                    {x.gapBeforeEta && <span className="ml-2 text-[11px] text-red-300">hết trước khi lô đang về tới</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-100">{x.stock === null ? '?' : fmt(x.stock)}</td>
                  <td className="px-3 py-2 text-right text-gray-300">{fmt(x.daily, 1)}</td>
                  <td className="px-3 py-2 text-right text-gray-300 whitespace-nowrap">{x.daysLeft === null ? '—' : fmt(Math.floor(x.daysLeft)) + ' ngày'}</td>
                  <td className="px-3 py-2 text-right text-blue-300 whitespace-nowrap">{x.incoming ? fmt(x.incoming) + (x.nextEta ? ' (' + dm(x.nextEta) + ')' : '') : '—'}</td>
                  <td className="px-3 py-2 text-right font-semibold text-white">{x.suggest ? fmt(x.suggest) : '—'}</td>
                </tr>
                {open === k && (
                  <tr className="bg-slate-950/60">
                    <td colSpan={6} className="px-3 py-3">
                      <p className="text-xs text-gray-400 mb-2">
                        Bán 7 ngày: {fmt(x.sold7)} · 30 ngày: {fmt(x.sold30)} · Hàng về sau {x.leadDays} ngày · Điểm đặt hàng: {fmt(x.reorderPoint)}
                      </p>
                      {r!.incoming.filter(function(i) { return i.product === x.product && i.kho === x.kho; }).map(function(i) {
                        return (
                          <div key={i.id} className="flex flex-wrap items-center gap-2 text-sm text-gray-200 mb-2">
                            <span>Đang về {fmt(i.qty)} · dự kiến {dm(i.eta)}{i.eta < r!.today ? ' (đã quá hẹn)' : ''}</span>
                            {isAdmin && <button className={btnCls} disabled={busy} onClick={function() { if (confirm('Bỏ lô này khỏi "đang về" (hàng đã về kho hoặc đã hủy đặt)?')) run(function() { return dbCanhBaoAction('doneIncoming', { id: i.id }); }, 'Đã cập nhật. Tồn kho sẽ đổi sau lần đồng bộ Sapo.'); }}>Đã về / hủy</button>}
                          </div>
                        );
                      })}
                      {isAdmin && (
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="text-xs text-gray-400 flex flex-col gap-1">Số lượng đã đặt
                            <input type="number" min={1} className={inputCls + ' w-36'} value={form.qty} onChange={function(e) { setForm({ ...form, qty: e.target.value }); }} />
                          </label>
                          <label className="text-xs text-gray-400 flex flex-col gap-1">Dự kiến về
                            <input type="date" className={inputCls} value={form.eta} onChange={function(e) { setForm({ ...form, eta: e.target.value }); }} />
                          </label>
                          <button className={btnPrimaryCls} disabled={busy || !(Number(form.qty) > 0) || !form.eta} onClick={async function() {
                            if (await run(function() { return dbCanhBaoAction('addIncoming', { product: x.product, kho: x.kho, qty: Number(form.qty), eta: form.eta, by: currentUser!.name }); }, 'Đã ghi nhận hàng đang về')) setOpen('');
                          }}>Ghi đã đặt hàng</button>
                          <label className="text-xs text-gray-400 flex flex-col gap-1">Ngày hàng về riêng (trống = chung)
                            <input type="number" min={1} max={365} className={inputCls + ' w-44'} value={form.lead} onChange={function(e) { setForm({ ...form, lead: e.target.value }); }} />
                          </label>
                          <button className={btnCls} disabled={busy} onClick={function() { run(function() { return dbCanhBaoAction('product', { product: x.product, leadDays: Number(form.lead) || 0, stop: !!(ps && ps.stop) }); }, 'Đã lưu (áp dụng cả hai kho)'); }}>Lưu số ngày</button>
                          <button className={btnCls} disabled={busy} onClick={function() { run(function() { return dbCanhBaoAction('product', { product: x.product, leadDays: Number(form.lead) || 0, stop: !(ps && ps.stop) }); }, 'Đã cập nhật (áp dụng cả hai kho)'); }}>{ps && ps.stop ? 'Theo dõi lại' : 'Ngừng nhập mã này'}</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
        {rows.length === 0 && <p className="p-4 text-sm text-gray-400">Không có sản phẩm nào trong nhóm này.</p>}
      </div>

      <p className="text-xs text-gray-500">
        Đặt hàng khi tồn + hàng đang về đủ bán không quá {r.settings.leadDays} + {r.settings.safetyDays} ngày (hoặc số ngày riêng của mã). Đề xuất nhập = đủ bán thêm {r.settings.cycleDays} ngày sau đó. Bán/ngày = trung bình giữa mức 30 ngày và 7 ngày gần nhất, tính theo khu vực của shop.
        {r.unmapped.length > 0 && ' Mã chưa quy đổi (không được tính): ' + r.unmapped.slice(0, 8).map(function(u) { return u.code + ' (' + u.qty + ')'; }).join(', ') + '.'}
      </p>

      {toast && <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-slate-600 text-white text-sm px-4 py-2 rounded-lg shadow-xl">{toast}</div>}
    </div>
  );
}
