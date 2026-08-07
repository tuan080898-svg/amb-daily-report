'use client';

import { useState, useCallback, useEffect, ReactNode } from 'react';
import { AppContext, createInitialState } from '@/lib/store';
import { User, Shop, DailyReport, MonthlyKPI, MonthlyPlan, AppConfig } from '@/lib/types';
import { IS_SUPABASE_CONFIGURED } from '@/lib/supabase';
import {
  dbGetUsers, dbAddUser, dbUpdateUser,
  dbGetShops, dbAddShop, dbUpdateShop, dbDeleteShop,
  dbGetReports, dbAddReport, dbUpdateReport,
  dbGetKPIs, dbUpdateKPI,
  dbGetPlans, dbUpdatePlan,
  dbGetConfig, dbUpdateConfig,
} from '@/lib/db';

const IS_SUPABASE = IS_SUPABASE_CONFIGURED;

export default function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(createInitialState);
  const [loading, setLoading] = useState(IS_SUPABASE);

  useEffect(() => {
    if (!IS_SUPABASE) return;
    let cancelled = false;

    async function loadAll() {
      try {
        const [users, shops, reports, kpis, plans, config] = await Promise.all([
          dbGetUsers(), dbGetShops(), dbGetReports(), dbGetKPIs(), dbGetPlans(), dbGetConfig(),
        ]);
        if (cancelled) return;
        setState(s => ({
          ...s,
          users: users.length > 0 ? users : s.users,
          shops: shops.length > 0 ? shops : s.shops,
          reports,
          monthlyKPIs: kpis,
          monthlyPlans: plans,
          config,
        }));
      } catch (err) {
        console.error('Failed to load from Supabase:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAll();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback((email: string, password: string): boolean => {
    const user = state.users.find(u => u.email === email && u.password === password);
    if (user) {
      setState(s => ({ ...s, currentUser: user }));
      try { localStorage.setItem('amb_user_id', user.id); } catch {}
      return true;
    }
    return false;
  }, [state.users]);

  const logout = useCallback(() => {
    setState(s => ({ ...s, currentUser: null }));
    try { localStorage.removeItem('amb_user_id'); } catch {}
  }, []);

  useEffect(() => {
    if (loading) return;
    try {
      const savedId = localStorage.getItem('amb_user_id');
      if (savedId && !state.currentUser) {
        const user = state.users.find(u => u.id === savedId);
        if (user) setState(s => ({ ...s, currentUser: user }));
      }
    } catch {}
  }, [loading]);

  const addReport = useCallback((report: DailyReport) => {
    setState(s => ({ ...s, reports: [...s.reports, report] }));
    if (IS_SUPABASE) dbAddReport(report).catch(err => { console.error(err); alert('Lỗi lưu báo cáo: ' + err.message); });
  }, []);

  const updateReport = useCallback((report: DailyReport) => {
    const updated = { ...report, updatedAt: new Date().toISOString() };
    setState(s => ({
      ...s,
      reports: s.reports.map(r => r.id === report.id ? updated : r),
    }));
    if (IS_SUPABASE) dbUpdateReport(updated).catch(err => { console.error(err); alert('Lỗi cập nhật báo cáo: ' + err.message); });
  }, []);

  const addShop = useCallback((shop: Shop) => {
    setState(s => ({ ...s, shops: [...s.shops, shop] }));
    if (IS_SUPABASE) dbAddShop(shop).catch(err => { console.error(err); alert('Lỗi lưu shop: ' + err.message); });
  }, []);

  const updateShop = useCallback((shop: Shop) => {
    setState(s => ({ ...s, shops: s.shops.map(sh => sh.id === shop.id ? shop : sh) }));
    if (IS_SUPABASE) dbUpdateShop(shop).catch(err => { console.error(err); alert('Lỗi cập nhật shop: ' + err.message); });
  }, []);

  const deleteShop = useCallback((shopId: string) => {
    setState(s => ({ ...s, shops: s.shops.filter(sh => sh.id !== shopId) }));
    if (IS_SUPABASE) dbDeleteShop(shopId).catch(err => { console.error(err); alert('Lỗi xóa shop: ' + err.message); });
  }, []);

  const updateKPI = useCallback((kpi: MonthlyKPI) => {
    setState(s => ({
      ...s,
      monthlyKPIs: s.monthlyKPIs.some(k => k.shopId === kpi.shopId && k.month === kpi.month)
        ? s.monthlyKPIs.map(k => (k.shopId === kpi.shopId && k.month === kpi.month) ? kpi : k)
        : [...s.monthlyKPIs, kpi],
    }));
    if (IS_SUPABASE) dbUpdateKPI(kpi).catch(err => { console.error(err); alert('Lỗi cập nhật KPI: ' + err.message); });
  }, []);

  const updatePlan = useCallback((plan: MonthlyPlan) => {
    setState(s => ({
      ...s,
      monthlyPlans: s.monthlyPlans.some(p => p.shopId === plan.shopId && p.month === plan.month)
        ? s.monthlyPlans.map(p => (p.shopId === plan.shopId && p.month === plan.month) ? plan : p)
        : [...s.monthlyPlans, plan],
    }));
    if (IS_SUPABASE) dbUpdatePlan(plan).catch(err => { console.error(err); alert('Lỗi cập nhật kế hoạch: ' + err.message); });
  }, []);

  const updateConfig = useCallback((config: AppConfig) => {
    setState(s => ({ ...s, config }));
    if (IS_SUPABASE) dbUpdateConfig(config).catch(err => { console.error(err); alert('Lỗi cập nhật cấu hình: ' + err.message); });
  }, []);

  const addUser = useCallback((user: User) => {
    setState(s => ({ ...s, users: [...s.users, user] }));
    if (IS_SUPABASE) dbAddUser(user).catch(err => { console.error(err); alert('Lỗi lưu user: ' + err.message); });
  }, []);

  const updateUser = useCallback((user: User) => {
    setState(s => ({ ...s, users: s.users.map(u => u.id === user.id ? user : u) }));
    if (IS_SUPABASE) {
      dbUpdateUser(user)
        .catch(err => { console.error(err); alert('Lỗi cập nhật user: ' + err.message); });
    }
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
      addUser, updateUser, getUserShops,
    }}>
      {children}
    </AppContext.Provider>
  );
}
