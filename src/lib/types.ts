export type Channel = 'Shopee' | 'TikTok';
export type UserRole = 'admin' | 'employee';
export type AlertColor = 'green' | 'yellow' | 'red';

export type Region = 'HCM' | 'HN';

export interface Shop {
  id: string;
  name: string;
  channel: Channel;
  region: Region;
  assignedTo: string[];
  defaultMonthlyTarget: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  assignedShops: string[];
  password?: string;
}

export interface DailyReport {
  id: string;
  date: string;
  shopId: string;
  targetRevenue: number;
  actualRevenue: number;
  adSpend: number;
  totalOrders: number;
  cancelledOrders: number;
  returnedOrders: number;
  note: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export type DayType = 'regular' | 'sale_double' | 'sale_fixed';

export interface MonthlyKPI {
  shopId: string;
  month: string;
  kpiAmount: number;
}

export interface MonthlyPlan {
  shopId: string;
  month: string;
  regularDayTarget: number;
  saleDoubleDayTarget: number;
  saleFixedDayTarget: number;
  totalMktBudget: number;
  regularDayMkt: number;
  saleDayMkt: number;
  dailyOverrides: Record<string, number>;
}

export interface SkuImport {
  id: string;
  shopId: string;
  shopName: string;
  dateFrom: string;
  dateTo: string;
  dailySku: Record<string, string[]>;
  importedAt: string;
}

export interface AnalyticsImport {
  id: string;
  shopId: string;
  shopName: string;
  dateFrom: string;
  dateTo: string;
  hourlyData: { hour: number; revenue: number; orders: number }[];
  provinceData: { province: string; revenue: number; orders: number }[];
  importedAt: string;
}

export interface AppConfig {
  adsThresholdGreen: number;
  adsThresholdYellow: number;
  cancelReturnThresholdYellow: number;
  cancelReturnThresholdRed: number;
}

export interface CalculatedMetrics {
  targetAchievement: number;
  adsToRevenueRatio: number;
  cancelReturnRate: number;
  revenueAlert: AlertColor;
  adsAlert: AlertColor;
  cancelReturnAlert: AlertColor;
}

export interface CskhReview {
  id: string;
  date: string;
  reporterId: string;
  shopId: string;
  orderCode: string;
  customerInfo: string;
  product: string;
  initialStars: number;
  reviewContent: string;
  resolutionMethod: string;
  status: string;
  result: string;
  note: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CskhIssue {
  id: string;
  date: string;
  reporterId: string;
  shopId: string;
  orderCode: string;
  issueType: string;
  description: string;
  resolution: string;
  urgency: string;
  status: string;
  needsIntervention: boolean;
  interventionNote: string;
  createdAt: string;
  updatedAt?: string;
}
