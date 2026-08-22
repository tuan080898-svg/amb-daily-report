'use client';

import { useState, useCallback, useEffect, ReactNode } from 'react';
import { AppContext, createInitialState } from '@/lib/store';
import { User, Shop, DailyReport, MonthlyKPI, MonthlyPlan, AppConfig, SkuImport, AnalyticsImport, CskhReview, CskhIssue, CogsEntry, PnlConfig, PnlImport, ChecklistTask, ChecklistEntry } from '@/lib/types';
import { IS_SUPABASE_CONFIGURED } from '@/lib/supabase';
import {
  dbGetUsers, dbAddUser, dbUpdateUser, dbDeleteUser,
  dbGetShops, dbAddShop, dbUpdateShop, dbDeleteShop,
  dbGetReports, dbAddReport, dbUpdateReport,
  dbGetKPIs, dbUpdateKPI,
  dbGetPlans, dbUpdatePlan,
  dbGetConfig, dbUpdateConfig,
  dbGetSkuImports, dbAddSkuImport, dbDeleteSkuImport,
  dbGetAnalytics, dbAddAnalytics, dbDeleteAnalytics,
  dbGetCskhReviews, dbAddCskhReview, dbUpdateCskhReview,
  dbGetCskhIssues, dbAddCskhIssue, dbUpdateCskhIssue,
  dbGetCogs, dbSaveCogs, dbGetPnlConfig, dbSavePnlConfig,
  dbGetPnlImports, dbSavePnlImports, dbAddPnlImport,
  dbGetChecklistTasks, dbSaveChecklistTasks,
  dbGetChecklistEntries, dbSaveChecklistEntries,
  dbGetInventory,
} from '@/lib/db';
import { hydrateInventory } from '@/lib/inventory';

const IS_SUPABASE = IS_SUPABASE_CONFIGURED;

export default function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(createInitialState);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      let savedId: string | null = null;
      try { savedId = localStorage.getItem('amb_user_id'); } catch {}

      if (!IS_SUPABASE) {
        if (savedId) {
          setState(s => {
            const user = s.users.find(u => u.id === savedId);
            return user ? { ...s, currentUser: user } : s;
          });
        }
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const [users, shops, reports, kpis, plans, config, skuImps, analyticsImps, cskhRevs, cskhIss, cogsData, pnlCfg, pnlImps, clTasks, clEntries, invData] = await Promise.all([
          dbGetUsers(), dbGetShops(), dbGetReports(), dbGetKPIs(), dbGetPlans(), dbGetConfig(), dbGetSkuImports(), dbGetAnalytics(),
          dbGetCskhReviews(), dbGetCskhIssues(), dbGetCogs(), dbGetPnlConfig(), dbGetPnlImports(),
          dbGetChecklistTasks(), dbGetChecklistEntries(), dbGetInventory(),
        ]);
        if (invData && (invData.transactions.length > 0 || Object.keys(invData.products).length > 0)) {
          hydrateInventory(invData);
        }
        if (cancelled) return;
        let savedUser = null;
        if (savedId && users.length > 0) {
          savedUser = users.find(u => u.id === savedId) || null;
        }
        let finalSkuImps = skuImps;
        if (skuImps.length === 0) {
          try {
            const raw = localStorage.getItem('amb_sku_imports');
            if (raw) {
              const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
              const migrated: SkuImport[] = parsed.map((item, i) => {
                const dailySku = item.dailySku
                  ? (item.dailySku as Record<string, string[]>)
                  : (() => {
                      const codes = (item.skuCodes || []) as string[];
                      const d: Record<string, string[]> = {};
                      if (codes.length > 0 && item.dateFrom) d[item.dateFrom as string] = codes;
                      return d;
                    })();
                return {
                  id: 'sku-' + (item.shopId as string) + '-' + (item.dateFrom as string) + '-' + i,
                  shopId: item.shopId as string,
                  shopName: item.shopName as string,
                  dateFrom: item.dateFrom as string,
                  dateTo: item.dateTo as string,
                  dailySku,
                  importedAt: (item.importedAt as string) || new Date().toISOString(),
                };
              });
              if (migrated.length > 0) {
                finalSkuImps = migrated;
                Promise.all(migrated.map(imp => dbAddSkuImport(imp)))
                  .then(() => { try { localStorage.removeItem('amb_sku_imports'); } catch {} })
                  .catch(() => {});
              }
            }
          } catch {}
        }

        setState(s => ({
          ...s,
          users: users.length > 0 ? users : s.users,
          shops: shops.length > 0 ? shops : s.shops,
          reports,
          monthlyKPIs: kpis,
          monthlyPlans: plans,
          skuImports: finalSkuImps,
          analyticsImports: analyticsImps,
          cskhReviews: cskhRevs,
          cskhIssues: cskhIss,
          cogsEntries: cogsData,
          pnlConfig: pnlCfg,
          pnlImports: pnlImps,
          checklistTasks: clTasks,
          checklistEntries: clEntries,
          config,
          currentUser: savedUser,
        }));
      } catch (err) {
        console.error('Failed to load from Supabase:', err);
        if (savedId && !cancelled) {
          setState(s => {
            const user = s.users.find(u => u.id === savedId);
            return user ? { ...s, currentUser: user } : s;
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) return false;
      const { user } = await res.json();
      if (user) {
        setState(s => ({ ...s, currentUser: user }));
        try { localStorage.setItem('amb_user_id', user.id); } catch {}
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    setState(s => ({ ...s, currentUser: null }));
    try { localStorage.removeItem('amb_user_id'); } catch {}
  }, []);


  const addReport = useCallback((report: DailyReport) => {
    let prev: DailyReport[] | null = null;
    setState(s => {
      prev = s.reports;
      const exists = s.reports.some(r => r.id === report.id);
      return {
        ...s,
        reports: exists
          ? s.reports.map(r => r.id === report.id ? report : r)
          : [...s.reports, report],
      };
    });
    if (IS_SUPABASE) dbAddReport(report).catch(err => { console.error(err); alert('Lỗi lưu báo cáo: ' + err.message); if (prev) setState(s => ({ ...s, reports: prev! })); });
  }, []);

  const updateReport = useCallback((report: DailyReport) => {
    const updated = { ...report, updatedAt: new Date().toISOString() };
    let prev: DailyReport[] | null = null;
    setState(s => {
      prev = s.reports;
      return { ...s, reports: s.reports.map(r => r.id === report.id ? updated : r) };
    });
    if (IS_SUPABASE) dbUpdateReport(updated).catch(err => { console.error(err); alert('Lỗi cập nhật báo cáo: ' + err.message); if (prev) setState(s => ({ ...s, reports: prev! })); });
  }, []);

  const addShop = useCallback((shop: Shop) => {
    setState(s => ({ ...s, shops: [...s.shops, shop] }));
    if (IS_SUPABASE) dbAddShop(shop).catch(err => { console.error(err); alert('Lỗi lưu shop: ' + err.message); setState(s => ({ ...s, shops: s.shops.filter(sh => sh.id !== shop.id) })); });
  }, []);

  const updateShop = useCallback((shop: Shop) => {
    let prev: Shop[] | null = null;
    setState(s => { prev = s.shops; return { ...s, shops: s.shops.map(sh => sh.id === shop.id ? shop : sh) }; });
    if (IS_SUPABASE) dbUpdateShop(shop).catch(err => { console.error(err); alert('Lỗi cập nhật shop: ' + err.message); if (prev) setState(s => ({ ...s, shops: prev! })); });
  }, []);

  const deleteShop = useCallback((shopId: string) => {
    let prev: Shop[] | null = null;
    setState(s => { prev = s.shops; return { ...s, shops: s.shops.filter(sh => sh.id !== shopId) }; });
    if (IS_SUPABASE) dbDeleteShop(shopId).catch(err => { console.error(err); alert('Lỗi xóa shop: ' + err.message); if (prev) setState(s => ({ ...s, shops: prev! })); });
  }, []);

  const updateKPI = useCallback((kpi: MonthlyKPI) => {
    let prev: MonthlyKPI[] | null = null;
    setState(s => {
      prev = s.monthlyKPIs;
      return { ...s, monthlyKPIs: s.monthlyKPIs.some(k => k.shopId === kpi.shopId && k.month === kpi.month) ? s.monthlyKPIs.map(k => (k.shopId === kpi.shopId && k.month === kpi.month) ? kpi : k) : [...s.monthlyKPIs, kpi] };
    });
    if (IS_SUPABASE) dbUpdateKPI(kpi).catch(err => { console.error(err); alert('Lỗi cập nhật KPI: ' + err.message); if (prev) setState(s => ({ ...s, monthlyKPIs: prev! })); });
  }, []);

  const updatePlan = useCallback((plan: MonthlyPlan) => {
    let prev: MonthlyPlan[] | null = null;
    setState(s => {
      prev = s.monthlyPlans;
      return { ...s, monthlyPlans: s.monthlyPlans.some(p => p.shopId === plan.shopId && p.month === plan.month) ? s.monthlyPlans.map(p => (p.shopId === plan.shopId && p.month === plan.month) ? plan : p) : [...s.monthlyPlans, plan] };
    });
    if (IS_SUPABASE) dbUpdatePlan(plan).catch(err => { console.error(err); alert('Lỗi cập nhật kế hoạch: ' + err.message); if (prev) setState(s => ({ ...s, monthlyPlans: prev! })); });
  }, []);

  const updateConfig = useCallback((config: AppConfig) => {
    let prev: AppConfig | null = null;
    setState(s => { prev = s.config; return { ...s, config }; });
    if (IS_SUPABASE) dbUpdateConfig(config).catch(err => { console.error(err); alert('Lỗi cập nhật cấu hình: ' + err.message); if (prev) setState(s => ({ ...s, config: prev! })); });
  }, []);

  const addUser = useCallback((user: User) => {
    setState(s => ({ ...s, users: [...s.users, user] }));
    if (IS_SUPABASE) dbAddUser(user).catch(err => { console.error(err); alert('Lỗi lưu user: ' + err.message); setState(s => ({ ...s, users: s.users.filter(u => u.id !== user.id) })); });
  }, []);

  const updateUser = useCallback((user: User) => {
    let prev: User[] | null = null;
    setState(s => { prev = s.users; return { ...s, users: s.users.map(u => u.id === user.id ? user : u) }; });
    if (IS_SUPABASE) dbUpdateUser(user).catch(err => { console.error(err); alert('Lỗi cập nhật user: ' + err.message); if (prev) setState(s => ({ ...s, users: prev! })); });
  }, []);

  const deleteUser = useCallback((userId: string) => {
    let prev: User[] | null = null;
    setState(s => { prev = s.users; return { ...s, users: s.users.filter(u => u.id !== userId) }; });
    if (IS_SUPABASE) dbDeleteUser(userId).catch(err => { console.error(err); alert('Lỗi xóa user: ' + err.message); if (prev) setState(s => ({ ...s, users: prev! })); });
  }, []);

  const addSkuImportCb = useCallback((imp: SkuImport) => {
    let prev: SkuImport[] | null = null;
    setState(s => {
      prev = s.skuImports;
      const filtered = s.skuImports.filter(e => {
        if (e.shopId !== imp.shopId) return true;
        return e.dateTo < imp.dateFrom || e.dateFrom > imp.dateTo;
      });
      return { ...s, skuImports: [...filtered, imp] };
    });
    if (IS_SUPABASE) dbAddSkuImport(imp).then(() => console.log('[SKU] save complete')).catch(err => { console.error('[SKU] save failed:', err); alert('Lỗi lưu SKU: ' + err.message); if (prev) setState(s => ({ ...s, skuImports: prev! })); });
  }, []);

  const deleteSkuImportCb = useCallback((id: string) => {
    let prev: SkuImport[] | null = null;
    setState(s => { prev = s.skuImports; return { ...s, skuImports: s.skuImports.filter(e => e.id !== id) }; });
    if (IS_SUPABASE) dbDeleteSkuImport(id).catch(err => { console.error(err); alert('Lỗi xoá SKU: ' + err.message); if (prev) setState(s => ({ ...s, skuImports: prev! })); });
  }, []);

  const addAnalyticsCb = useCallback((imp: AnalyticsImport) => {
    let prev: AnalyticsImport[] | null = null;
    setState(s => {
      prev = s.analyticsImports;
      const filtered = s.analyticsImports.filter(function(e) {
        if (e.shopId !== imp.shopId) return true;
        return e.dateTo < imp.dateFrom || e.dateFrom > imp.dateTo;
      });
      return { ...s, analyticsImports: [...filtered, imp] };
    });
    if (IS_SUPABASE) dbAddAnalytics(imp).then(() => console.log('[Analytics] save complete')).catch(err => { console.error('[Analytics] save failed:', err); alert('Lỗi lưu Analytics: ' + err.message); if (prev) setState(s => ({ ...s, analyticsImports: prev! })); });
  }, []);

  const deleteAnalyticsCb = useCallback((id: string) => {
    let prev: AnalyticsImport[] | null = null;
    setState(s => { prev = s.analyticsImports; return { ...s, analyticsImports: s.analyticsImports.filter(e => e.id !== id) }; });
    if (IS_SUPABASE) dbDeleteAnalytics(id).catch(err => { console.error(err); alert('Lỗi xoá Analytics: ' + err.message); if (prev) setState(s => ({ ...s, analyticsImports: prev! })); });
  }, []);

  const addCskhReviewCb = useCallback(function(review: CskhReview) {
    let prev: CskhReview[] | null = null;
    setState(function(s) {
      prev = s.cskhReviews;
      const exists = s.cskhReviews.some(function(r) { return r.id === review.id; });
      return {
        ...s,
        cskhReviews: exists
          ? s.cskhReviews.map(function(r) { return r.id === review.id ? review : r; })
          : [...s.cskhReviews, review],
      };
    });
    if (IS_SUPABASE) dbAddCskhReview(review).catch(function(err) { console.error(err); alert('Lỗi lưu đánh giá CSKH: ' + err.message); if (prev) setState(function(s) { return { ...s, cskhReviews: prev! }; }); });
  }, []);

  const updateCskhReviewCb = useCallback(function(review: CskhReview) {
    const updated = { ...review, updatedAt: new Date().toISOString() };
    let prev: CskhReview[] | null = null;
    setState(function(s) {
      prev = s.cskhReviews;
      return { ...s, cskhReviews: s.cskhReviews.map(function(r) { return r.id === review.id ? updated : r; }) };
    });
    if (IS_SUPABASE) dbUpdateCskhReview(updated).catch(function(err) { console.error(err); alert('Lỗi cập nhật đánh giá CSKH: ' + err.message); if (prev) setState(function(s) { return { ...s, cskhReviews: prev! }; }); });
  }, []);

  const addCskhIssueCb = useCallback(function(issue: CskhIssue) {
    let prev: CskhIssue[] | null = null;
    setState(function(s) {
      prev = s.cskhIssues;
      const exists = s.cskhIssues.some(function(i) { return i.id === issue.id; });
      return {
        ...s,
        cskhIssues: exists
          ? s.cskhIssues.map(function(i) { return i.id === issue.id ? issue : i; })
          : [...s.cskhIssues, issue],
      };
    });
    if (IS_SUPABASE) dbAddCskhIssue(issue).catch(function(err) { console.error(err); alert('Lỗi lưu vấn đề CSKH: ' + err.message); if (prev) setState(function(s) { return { ...s, cskhIssues: prev! }; }); });
  }, []);

  const updateCskhIssueCb = useCallback(function(issue: CskhIssue) {
    const updated = { ...issue, updatedAt: new Date().toISOString() };
    let prev: CskhIssue[] | null = null;
    setState(function(s) {
      prev = s.cskhIssues;
      return { ...s, cskhIssues: s.cskhIssues.map(function(i) { return i.id === issue.id ? updated : i; }) };
    });
    if (IS_SUPABASE) dbUpdateCskhIssue(updated).catch(function(err) { console.error(err); alert('Lỗi cập nhật vấn đề CSKH: ' + err.message); if (prev) setState(function(s) { return { ...s, cskhIssues: prev! }; }); });
  }, []);

  const saveCogsCb = useCallback(function(entries: CogsEntry[]) {
    let prev: CogsEntry[] | null = null;
    setState(function(s) { prev = s.cogsEntries; return { ...s, cogsEntries: entries }; });
    if (IS_SUPABASE) dbSaveCogs(entries).catch(function(err) { console.error(err); alert('Lỗi lưu giá vốn: ' + err.message); if (prev) setState(function(s) { return { ...s, cogsEntries: prev! }; }); });
  }, []);

  const savePnlConfigCb = useCallback(function(cfg: PnlConfig) {
    let prev: PnlConfig | null = null;
    setState(function(s) { prev = s.pnlConfig; return { ...s, pnlConfig: cfg }; });
    if (IS_SUPABASE) dbSavePnlConfig(cfg).catch(function(err) { console.error(err); alert('Lỗi lưu cấu hình PnL: ' + err.message); if (prev) setState(function(s) { return { ...s, pnlConfig: prev! }; }); });
  }, []);

  const savePnlImportsCb = useCallback(function(imports: PnlImport[]) {
    let prev: PnlImport[] | null = null;
    setState(function(s) { prev = s.pnlImports; return { ...s, pnlImports: imports }; });
    if (IS_SUPABASE) dbSavePnlImports(imports).catch(function(err) { console.error(err); alert('Lỗi lưu PnL: ' + err.message); if (prev) setState(function(s) { return { ...s, pnlImports: prev! }; }); });
  }, []);

  const addPnlImportCb = useCallback(function(imp: PnlImport) {
    let prev: PnlImport[] | null = null;
    setState(function(s) {
      prev = s.pnlImports;
      var filtered = s.pnlImports.filter(function(existing) {
        return existing.id !== imp.id && !(existing.shopId === imp.shopId && existing.dateFrom <= imp.dateTo && existing.dateTo >= imp.dateFrom);
      });
      return { ...s, pnlImports: filtered.concat([imp]) };
    });
    if (IS_SUPABASE) dbAddPnlImport(imp).catch(function(err) { console.error(err); alert('Lỗi lưu PnL import: ' + err.message); if (prev) setState(function(s) { return { ...s, pnlImports: prev! }; }); });
  }, []);

  const saveChecklistTasksCb = useCallback(function(tasks: ChecklistTask[]) {
    let prev: ChecklistTask[] | null = null;
    setState(function(s) { prev = s.checklistTasks; return { ...s, checklistTasks: tasks }; });
    if (IS_SUPABASE) dbSaveChecklistTasks(tasks).catch(function(err) { console.error(err); alert('Lỗi lưu checklist: ' + err.message); if (prev) setState(function(s) { return { ...s, checklistTasks: prev! }; }); });
  }, []);

  const saveChecklistEntriesCb = useCallback(function(entries: ChecklistEntry[]) {
    let prev: ChecklistEntry[] | null = null;
    setState(function(s) { prev = s.checklistEntries; return { ...s, checklistEntries: entries }; });
    if (IS_SUPABASE) dbSaveChecklistEntries(entries).catch(function(err) { console.error(err); alert('Lỗi lưu checklist: ' + err.message); if (prev) setState(function(s) { return { ...s, checklistEntries: prev! }; }); });
  }, []);

  const getUserShops = useCallback((userId: string): Shop[] => {
    const user = state.users.find(u => u.id === userId);
    if (!user) return [];
    if (user.role === 'admin') return state.shops;
    return state.shops.filter(s => s.assignedTo.includes(userId));
  }, [state.users, state.shops]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{
      ...state,
      login, logout, addReport, updateReport,
      addShop, updateShop, deleteShop,
      updateKPI, updatePlan, updateConfig,
      addUser, updateUser, deleteUser, getUserShops,
      addSkuImport: addSkuImportCb, deleteSkuImport: deleteSkuImportCb,
      addAnalytics: addAnalyticsCb, deleteAnalytics: deleteAnalyticsCb,
      addCskhReview: addCskhReviewCb, updateCskhReview: updateCskhReviewCb,
      addCskhIssue: addCskhIssueCb, updateCskhIssue: updateCskhIssueCb,
      saveCogs: saveCogsCb, savePnlConfig: savePnlConfigCb, savePnlImports: savePnlImportsCb, addPnlImport: addPnlImportCb,
      saveChecklistTasks: saveChecklistTasksCb, saveChecklistEntries: saveChecklistEntriesCb,
    }}>
      {children}
    </AppContext.Provider>
  );
}
