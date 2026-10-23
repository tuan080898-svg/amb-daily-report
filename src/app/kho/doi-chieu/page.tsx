'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAppState } from '@/lib/store';
import {
  dbDeleteDoiChieuSessions, dbGetDoiChieuConfig, dbGetDoiChieuMonth, dbSaveDoiChieuConfig, dbSaveDoiChieuSessions,
} from '@/lib/db';
import {
  dcAddDays, dcCompute, dcCounts, dcDefaultConfig, dcMissingDays, dcNkey, dcParseSapo, dcRowsOf, dcStaff, dcToday, dcVnDate,
  type DcBo, type DcCatalog, type DcConfig, type DcSapo, type DcSession, type DcSettings,
} from '@/lib/doichieu';
import DayView from './DayView';
import HistoryView from './HistoryView';
import ReportView from './ReportView';
import GuideView from './GuideView';
import { allSessions, catalogFromConfig, inputCls, monthOf, newUiRow, type UiRow } from './shared';

type Tab = 'ngay' | 'ls' | 'bc' | 'hd';
var DRAFT = 'dc-nhap:';
var TABS: Array<[Tab, string]> = [['ngay', 'Đối chiếu trong ngày'], ['ls', 'Lịch sử và cài đặt'], ['bc', 'Báo cáo'], ['hd', 'Hướng dẫn']];

function monthBefore(m: string): string {
  var p = m.split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 2, 1));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

export default function DoiChieuPage() {
  var { currentUser } = useAppState();
  var allowed = !!currentUser && currentUser.role === 'admin';

  var [cfg, setCfg] = useState<DcConfig>(dcDefaultConfig());
  var [catalog, setCatalog] = useState<DcCatalog>({});
  var [byMonth, setByMonth] = useState<Record<string, DcSession[]>>({});
  var [loading, setLoading] = useState(true);
  var [loadErr, setLoadErr] = useState('');
  var [tab, setTab] = useState<Tab>('ngay');
  var [date, setDateState] = useState(dcToday());
  var [sapo, setSapo] = useState<DcSapo | null>(null);
  var [rows, setRows] = useState<UiRow[]>([]);
  var [dirty, setDirty] = useState(false);
  var [nguoi, setNguoi] = useState('');
  var [saving, setSaving] = useState(false);
  var [loadingAll, setLoadingAll] = useState(false);
  var [allLoaded, setAllLoaded] = useState(false);
  var [toastMsg, setToastMsg] = useState('');

  var byMonthRef = useRef<Record<string, DcSession[]>>({});
  var dateRef = useRef(dcToday());
  var toastT = useRef<ReturnType<typeof setTimeout> | null>(null);

  var toast = useCallback(function(m: string) {
    setToastMsg(m);
    if (toastT.current) clearTimeout(toastT.current);
    toastT.current = setTimeout(function() { setToastMsg(''); }, 3500);
  }, []);

  var sessions = useMemo(function() { return allSessions(byMonth); }, [byMonth]);
  var current: DcSession | null = useMemo(function() {
    var l = byMonth[monthOf(date)] || [];
    return l.find(function(s) { return s.ngay === date; }) || null;
  }, [byMonth, date]);

  // ----- tải dữ liệu -----
  async function fetchMonth(m: string): Promise<DcSession[]> {
    if (byMonthRef.current[m]) return byMonthRef.current[m];
    var list = await dbGetDoiChieuMonth(m);
    byMonthRef.current = Object.assign({}, byMonthRef.current, { [m]: list });
    setByMonth(byMonthRef.current);
    return list;
  }

  function applyDay(d: string, list: DcSession[], keepSapo?: DcSapo | null) {
    var cur = list.find(function(s) { return s.ngay === d; }) || null;
    var draft: { t: number; sapo: DcSapo | null; so: Array<Record<string, unknown>> } | null = null;
    try { draft = JSON.parse(localStorage.getItem(DRAFT + d) || 'null'); } catch { draft = null; }
    var savedT = cur && cur.luuLuc ? Date.parse(cur.luuLuc) : 0;
    if (draft && draft.t > savedT) {
      setSapo(draft.sapo);
      setRows((draft.so || []).map(function(r) { return newUiRow(r as never); }));
      setDirty(!!cur || (draft.so || []).length > 0);
    } else if (cur) {
      setSapo(cur.sapo ? { from: cur.sapo.from, to: cur.sapo.to, rows: cur.sapo.rows || [] } : null);
      setRows(dcRowsOf(cur).map(function(r) { return newUiRow(r); }));
      setDirty(false);
    } else {
      setSapo(keepSapo || null);
      setRows([]);
      setDirty(false);
    }
  }

  async function openDay(d: string, keepSapo?: DcSapo | null) {
    try {
      var list = await fetchMonth(monthOf(d));
      setDateState(d);
      dateRef.current = d;
      applyDay(d, list, keepSapo);
    } catch (e) { toast(e instanceof Error ? e.message : 'Không mở được ngày này.'); }
  }

  useEffect(function() {
    if (!allowed) return;
    var alive = true;
    (async function() {
      try {
        var c = await dbGetDoiChieuConfig();
        if (!alive) return;
        setCfg(c);
        setCatalog(catalogFromConfig(c));
        var today = dcToday();
        var m0 = monthOf(today);
        var m1 = monthBefore(m0);
        var both = await Promise.all([dbGetDoiChieuMonth(m0), dbGetDoiChieuMonth(m1)]);
        if (!alive) return;
        var bm: Record<string, DcSession[]> = {};
        bm[m0] = both[0];
        bm[m1] = both[1];
        byMonthRef.current = bm;
        setByMonth(bm);
        try { setNguoi(localStorage.getItem('dc-nguoi') || ''); } catch { /* không đọc được */ }
        applyDay(dcToday(), both[0]);
      } catch (e) {
        if (alive) setLoadErr(e instanceof Error ? e.message : 'Không tải được dữ liệu');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return function() { alive = false; };
  }, [allowed]);

  // Bản nháp tự lưu trong trình duyệt để không mất khi tải lại trang
  useEffect(function() {
    if (!dirty || loading) return;
    try { localStorage.setItem(DRAFT + date, JSON.stringify({ t: Date.now(), sapo: sapo, so: rows.map(function(r) { return { ma: r.ma, ns: r.ns, v: r.v, unsure: r.unsure, note: r.note, goiY: r.goiY }; }) })); } catch { /* đầy bộ nhớ */ }
  }, [rows, sapo, dirty, date, loading]);

  useEffect(function() {
    if (!dirty) return;
    function warn(e: BeforeUnloadEvent) { e.preventDefault(); }
    window.addEventListener('beforeunload', warn);
    return function() { window.removeEventListener('beforeunload', warn); };
  }, [dirty]);

  async function loadAllMonths() {
    setLoadingAll(true);
    try {
      var todo = cfg.months.filter(function(m) { return !byMonthRef.current[m]; });
      var got = await Promise.all(todo.map(function(m) { return dbGetDoiChieuMonth(m).then(function(l) { return [m, l] as [string, DcSession[]]; }); }));
      var next = Object.assign({}, byMonthRef.current);
      got.forEach(function(g) { next[g[0]] = g[1]; });
      byMonthRef.current = next;
      setByMonth(next);
      setAllLoaded(true);
    } catch (e) { toast(e instanceof Error ? e.message : 'Không tải được các tháng trước.'); }
    setLoadingAll(false);
  }

  function goTab(t: Tab) {
    setTab(t);
    if ((t === 'bc' || t === 'ls') && !allLoaded && !loadingAll && !loading) loadAllMonths();
  }

  // ----- thao tác -----
  async function saveConfigPatch(patch: { settings?: DcSettings; bo?: DcBo[]; combos?: Array<[string, string]>; catalog?: Array<[string, string]> }, okMsg?: string) {
    try {
      var c = await dbSaveDoiChieuConfig(patch);
      setCfg(c);
      if (patch.catalog) setCatalog(catalogFromConfig(c));
      if (okMsg) toast(okMsg);
    } catch (e) { toast(e instanceof Error ? e.message : 'Không lưu được.'); throw e; }
  }

  async function onSapoFile(file: File) {
    try {
      var wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      var aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
      var r = dcParseSapo(aoa);
      var merged: DcCatalog = Object.assign({}, catalog, r.catalog);
      var hasNew = Object.keys(r.catalog).some(function(k) { return !catalog[k]; });
      setCatalog(merged);
      var next: DcSapo = { from: r.from, to: r.to, rows: r.rows };
      if (r.to && r.to !== dateRef.current && rows.length === 0 && !current) {
        await openDay(r.to, next);
        setDirty(true);
      } else {
        setSapo(next);
        setDirty(true);
      }
      toast('Đã đọc báo cáo Sapo.');
      if (hasNew) {
        var arr = Object.keys(merged).map(function(k) { return [merged[k].ma, merged[k].ten] as [string, string]; });
        saveConfigPatch({ catalog: arr }).catch(function() { /* đã báo lỗi */ });
      }
    } catch (e) { toast(e instanceof Error ? e.message : 'Không đọc được file này.'); }
  }

  function onStaffNew(names: string[]) {
    var cur = dcStaff(cfg.settings);
    var them = names.filter(function(n) { return n && !cur.some(function(c) { return dcNkey(c) === dcNkey(n); }); });
    if (!them.length) return;
    saveConfigPatch({ settings: Object.assign({}, cfg.settings, { cot: cur.concat(them) }) }).catch(function() { /* đã báo lỗi */ });
  }

  async function onSave() {
    if (!sapo || !rows.length) return;
    setSaving(true);
    try {
      var staff = dcStaff(cfg.settings);
      var cols = staff.slice();
      rows.forEach(function(r) { Object.keys(r.ns).forEach(function(n) { if (r.ns[n] && !cols.some(function(c) { return dcNkey(c) === dcNkey(n); })) cols.push(n); }); });
      var ctx = { bo: cfg.bo, combos: cfg.combos, catalog: catalog, settings: cfg.settings };
      var doc: DcSession = {
        ngay: date,
        sapo: { from: sapo.from, to: sapo.to, rows: sapo.rows },
        so: rows.map(function(r) { return { ma: r.ma, ns: r.ns, v: r.v, unsure: !!r.unsure, note: r.note || '', goiY: r.goiY || null }; }),
        cot: cols,
        tomTat: dcCounts(dcCompute(sapo.rows, rows, ctx)),
        nguoiLuu: nguoi.trim() || null,
        luuLuc: new Date().toISOString(),
      };
      try { localStorage.setItem('dc-nguoi', nguoi); } catch { /* không đọc được */ }
      await dbSaveDoiChieuSessions([doc]);
      var m = monthOf(date);
      var list = (byMonthRef.current[m] || []).filter(function(s) { return s.ngay !== date; }).concat([doc]).sort(function(a, b) { return b.ngay.localeCompare(a.ngay); });
      byMonthRef.current = Object.assign({}, byMonthRef.current, { [m]: list });
      setByMonth(byMonthRef.current);
      setCfg(function(c) { return Object.assign({}, c, { months: Array.from(new Set(c.months.concat([m]))).sort() }); });
      setDirty(false);
      try { localStorage.removeItem(DRAFT + date); } catch { /* không đọc được */ }
      toast('Đã lưu phiên ngày ' + dcVnDate(date) + '.');
    } catch (e) { toast(e instanceof Error ? 'Lưu không thành công: ' + e.message : 'Lưu không thành công.'); }
    setSaving(false);
  }

  async function onDelete(days: string[]) {
    try {
      var n = await dbDeleteDoiChieuSessions(days);
      var next: Record<string, DcSession[]> = {};
      Object.keys(byMonthRef.current).forEach(function(m) { next[m] = byMonthRef.current[m].filter(function(s) { return days.indexOf(s.ngay) < 0; }); });
      byMonthRef.current = next;
      setByMonth(next);
      days.forEach(function(d) { try { localStorage.removeItem(DRAFT + d); } catch { /* không đọc được */ } });
      if (days.indexOf(dateRef.current) >= 0) applyDay(dateRef.current, next[monthOf(dateRef.current)] || []);
      toast('Đã xóa ' + n + ' phiên.');
    } catch (e) { toast(e instanceof Error ? e.message : 'Không xóa được.'); }
  }

  function onBackup() {
    (async function() {
      await loadAllMonths();
      var data = { app: 'doi-chieu-so-kho-amb', phienBan: 2, xuatLuc: new Date().toISOString(), config: cfg, sessions: allSessions(byMonthRef.current) };
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
      a.download = 'sao-luu-doi-chieu-kho-' + dcToday() + '.json';
      document.body.appendChild(a); a.click();
      setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast('Đã xuất file sao lưu.');
    })();
  }

  async function onRestore(file: File): Promise<string> {
    try {
      var d = JSON.parse(await file.text());
      var conf: Partial<DcConfig> = {};
      var sess: DcSession[] = [];
      if (d && d.app === 'doi-chieu-so-kho-amb' && d.docs) {
        // file của bản offline cũ
        var docs = d.docs as Record<string, Record<string, unknown>>;
        var base = dcDefaultConfig().settings;
        conf = {
          settings: Object.assign({}, base, (docs['config/caidat'] || {}) as Partial<DcSettings>),
          bo: ((docs['config/bo'] || {}).items || []) as DcBo[],
          combos: ((docs['config/combos'] || {}).items || []) as Array<[string, string]>,
          catalog: ((docs['danhmuc/sku'] || {}).items || []) as Array<[string, string]>,
        };
        Object.keys(docs).filter(function(k) { return k.indexOf('phien/') === 0; }).forEach(function(k) {
          var s = Object.assign({ ngay: k.slice(6) }, docs[k]) as unknown as DcSession;
          sess.push({
            ngay: s.ngay, sapo: s.sapo || null,
            so: dcRowsOf(s).map(function(r) { return { ma: r.ma, ns: r.ns, v: r.v, unsure: !!r.unsure, note: r.note || '', goiY: r.goiY || null }; }),
            cot: s.cot || dcStaff({ hoanVaoNhap: true, xuatKhac: false, cot: [] }), tomTat: s.tomTat, nguoiLuu: s.nguoiLuu || null, luuLuc: s.luuLuc,
          });
        });
      } else if (d && d.app === 'doi-chieu-so-kho-amb' && d.phienBan === 2) {
        conf = d.config || {};
        sess = d.sessions || [];
      } else throw new Error('x');
      var coCauHinh = !!(conf.settings || (conf.bo && conf.bo.length));
      if (!window.confirm('Khôi phục ' + sess.length + ' ngày đối chiếu' + (coCauHinh ? ' và cài đặt (nhân sự, bộ/combo, danh mục mã)' : '') + ' từ file này? Dữ liệu cùng ngày trên hệ thống sẽ bị ghi đè; các ngày khác giữ nguyên.')) return 'Đã hủy.';
      if (coCauHinh) await saveConfigPatch({ settings: conf.settings, bo: conf.bo, combos: conf.combos, catalog: conf.catalog });
      if (sess.length) await dbSaveDoiChieuSessions(sess);
      var fresh = await dbGetDoiChieuConfig();
      setCfg(fresh);
      setCatalog(catalogFromConfig(fresh));
      byMonthRef.current = {};
      setByMonth({});
      var m0 = monthOf(dcToday());
      var ms = Array.from(new Set([m0, monthBefore(m0)].concat(sess.map(function(s) { return monthOf(s.ngay); }))));
      var got = await Promise.all(ms.map(function(m) { return dbGetDoiChieuMonth(m).then(function(l) { return [m, l] as [string, DcSession[]]; }); }));
      var next: Record<string, DcSession[]> = {};
      got.forEach(function(g) { next[g[0]] = g[1]; });
      byMonthRef.current = next;
      setByMonth(next);
      setAllLoaded(false);
      applyDay(dateRef.current, next[monthOf(dateRef.current)] || []);
      return 'Đã khôi phục ' + sess.length + ' ngày.';
    } catch (e) {
      return e instanceof Error && e.message !== 'x' ? 'Khôi phục không thành công: ' + e.message : 'File không đúng định dạng sao lưu của trang này.';
    }
  }

  // Các ngày (trừ Chủ nhật) trong 7 ngày gần đây chưa lưu đối chiếu, tính từ ngày đầu tiên đã có dữ liệu
  var missing = useMemo(function() {
    if (!sessions.length) return [];
    var today = dcToday();
    var earliest = sessions[sessions.length - 1].ngay;
    var from = dcAddDays(today, -7);
    if (from < earliest) from = earliest;
    return dcMissingDays(sessions.map(function(s) { return s.ngay; }), from, dcAddDays(today, -1));
  }, [sessions]);

  if (!allowed) return <div className="p-6 text-red-400">Trang này chỉ dành cho admin.</div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Đối chiếu sổ kho</h1>
          <p className="text-sm text-gray-500 mt-1">Sổ ghi tay tại kho so với báo cáo xuất nhập tồn trên Sapo, theo từng ngày. Dữ liệu lưu chung trên hệ thống.</p>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1" htmlFor="dc-ngay">Ngày đối chiếu</label>
          <input id="dc-ngay" type="date" value={date} onChange={function(e) {
            var v = e.target.value;
            if (!v) return;
            if (dirty && !window.confirm('Ngày đang mở có thay đổi chưa lưu (bản nháp vẫn được giữ trong trình duyệt này). Chuyển sang ngày khác?')) return;
            openDay(v);
          }} className={inputCls} />
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-700 mb-4" role="tablist">
        {TABS.map(function(t) {
          return <button key={t[0]} role="tab" aria-selected={tab === t[0]} onClick={function() { goTab(t[0]); }}
            className={'px-4 py-2 text-sm rounded-t-lg ' + (tab === t[0] ? 'bg-slate-800 text-white border border-slate-700 border-b-slate-800 -mb-px' : 'text-gray-400 hover:text-gray-200')}>{t[1]}</button>;
        })}
      </div>

      {loadErr && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">Không tải được dữ liệu đối chiếu: {loadErr}. Chưa nên lưu ngày nào cho đến khi hết lỗi (có thể đè dữ liệu).</div>}
      {loading && !loadErr && <div className="p-6 text-gray-400 text-sm">Đang tải dữ liệu…</div>}

      {!loading && !loadErr && tab === 'ngay' && (
        <DayView date={date} setDate={function(d) { openDay(d); }} cfg={cfg} catalog={catalog} sapo={sapo} rows={rows} setRows={setRows}
          current={current} dirty={dirty} nguoi={nguoi} setNguoi={setNguoi} saving={saving} missing={missing}
          onSapoFile={onSapoFile} onStaffNew={onStaffNew} onSave={onSave} onDirty={function() { setDirty(true); }} />
      )}
      {!loading && !loadErr && tab === 'ls' && (
        <HistoryView cfg={cfg} catalog={catalog} sessions={sessions} allLoaded={allLoaded} loadingAll={loadingAll} onLoadAll={loadAllMonths}
          onOpenDay={function(d) { setTab('ngay'); openDay(d); }} onDelete={onDelete}
          onSaveSettings={function(s) { return saveConfigPatch({ settings: s }, 'Đã lưu cài đặt.'); }}
          onSaveBo={function(bo, combos) { return saveConfigPatch({ bo: bo, combos: combos }, 'Đã lưu danh sách bộ.'); }}
          onBackup={onBackup} onRestore={onRestore} toast={toast} />
      )}
      {!loading && !loadErr && tab === 'bc' && <ReportView cfg={cfg} catalog={catalog} sessions={sessions} loadingAll={loadingAll} allLoaded={allLoaded} onLoadAll={loadAllMonths} />}
      {tab === 'hd' && <GuideView />}

      {toastMsg && <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-slate-700 border border-slate-500 text-sm text-gray-100 shadow-lg">{toastMsg}</div>}
    </div>
  );
}
