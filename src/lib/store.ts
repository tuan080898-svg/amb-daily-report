'use client';

import { createContext, useContext } from 'react';
import { User, Shop, DailyReport, MonthlyKPI, MonthlyPlan, AppConfig, SkuImport, AnalyticsImport, CskhReview, CskhIssue } from './types';
import { DEFAULT_CONFIG } from './utils';
import { MOCK_SHOPS, MOCK_USERS, MOCK_REPORTS, MOCK_KPIS, MOCK_PLANS } from './mock-data';

export interface AppState {
  currentUser: User | null;
  users: User[];
  shops: Shop[];
  reports: DailyReport[];
  monthlyKPIs: MonthlyKPI[];
  monthlyPlans: MonthlyPlan[];
  skuImports: SkuImport[];
  analyticsImports: AnalyticsImport[];
  cskhReviews: CskhReview[];
  cskhIssues: CskhIssue[];
  config: AppConfig;
  login: (email: string, password: string) => boolean;
  logout: () => void;
  addReport: (report: DailyReport) => void;
  updateReport: (report: DailyReport) => void;
  addShop: (shop: Shop) => void;
  updateShop: (shop: Shop) => void;
  deleteShop: (shopId: string) => void;
  updateKPI: (kpi: MonthlyKPI) => void;
  updatePlan: (plan: MonthlyPlan) => void;
  updateConfig: (config: AppConfig) => void;
  addUser: (user: User) => void;
  updateUser: (user: User) => void;
  getUserShops: (userId: string) => Shop[];
  addSkuImport: (imp: SkuImport) => void;
  deleteSkuImport: (id: string) => void;
  addAnalytics: (imp: AnalyticsImport) => void;
  deleteAnalytics: (id: string) => void;
  addCskhReview: (review: CskhReview) => void;
  updateCskhReview: (review: CskhReview) => void;
  addCskhIssue: (issue: CskhIssue) => void;
  updateCskhIssue: (issue: CskhIssue) => void;
}

export function createInitialState(): Omit<AppState, 'login' | 'logout' | 'addReport' | 'updateReport' | 'addShop' | 'updateShop' | 'deleteShop' | 'updateKPI' | 'updatePlan' | 'updateConfig' | 'addUser' | 'updateUser' | 'getUserShops' | 'addSkuImport' | 'deleteSkuImport' | 'addAnalytics' | 'deleteAnalytics' | 'addCskhReview' | 'updateCskhReview' | 'addCskhIssue' | 'updateCskhIssue'> {
  return {
    currentUser: null,
    users: [...MOCK_USERS],
    shops: [...MOCK_SHOPS],
    reports: [...MOCK_REPORTS],
    monthlyKPIs: [...MOCK_KPIS],
    monthlyPlans: [...MOCK_PLANS],
    skuImports: [],
    analyticsImports: [],
    cskhReviews: [],
    cskhIssues: [],
    config: { ...DEFAULT_CONFIG },
  };
}

export const AppContext = createContext<AppState | null>(null);

export function useAppState(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppState must be used within AppProvider');
  return ctx;
}
