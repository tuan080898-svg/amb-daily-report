import { supabase } from './supabase';
import { User, Shop, DailyReport, MonthlyKPI, MonthlyPlan, AppConfig } from './types';
import { DEFAULT_CONFIG } from './utils';

function db() {
  if (!supabase) throw new Error('Supabase not configured');
  return supabase;
}

// ==================== Users ====================

export async function dbGetUsers(): Promise<User[]> {
  const { data } = await db().from('users').select('*');
  if (!data) return [];
  return data.map(r => ({
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    assignedShops: r.assigned_shops || [],
    password: r.password,
  }));
}

export async function dbAddUser(user: User): Promise<void> {
  const { error } = await db().from('users').insert({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    assigned_shops: user.assignedShops,
    password: user.password || '123456',
  });
  if (error) throw new Error('Thêm user thất bại: ' + error.message);
}

export async function dbUpdateUser(user: User): Promise<void> {
  const updateData: Record<string, unknown> = {
    email: user.email,
    name: user.name,
    role: user.role,
    assigned_shops: user.assignedShops,
  };
  if (user.password) {
    updateData.password = user.password;
  }
  const { error } = await db().from('users').update(updateData).eq('id', user.id);
  if (error) throw new Error('Cập nhật user thất bại: ' + error.message);
}

// ==================== Shops ====================

export async function dbGetShops(): Promise<Shop[]> {
  const { data } = await db().from('shops').select('*');
  if (!data) return [];
  return data.map(r => ({
    id: r.id,
    name: r.name,
    channel: r.channel,
    region: r.region,
    assignedTo: r.assigned_to || [],
    defaultMonthlyTarget: r.default_monthly_target || 0,
  }));
}

export async function dbAddShop(shop: Shop): Promise<void> {
  await db().from('shops').insert({
    id: shop.id,
    name: shop.name,
    channel: shop.channel,
    region: shop.region,
    assigned_to: shop.assignedTo,
    default_monthly_target: shop.defaultMonthlyTarget,
  });
}

export async function dbUpdateShop(shop: Shop): Promise<void> {
  const { error } = await db().from('shops').update({
    name: shop.name,
    channel: shop.channel,
    region: shop.region,
    assigned_to: shop.assignedTo,
    default_monthly_target: shop.defaultMonthlyTarget,
  }).eq('id', shop.id);
  if (error) throw new Error('Cập nhật shop thất bại: ' + error.message);
}

export async function dbDeleteShop(shopId: string): Promise<void> {
  await db().from('shops').delete().eq('id', shopId);
}

// ==================== Reports ====================

export async function dbGetReports(): Promise<DailyReport[]> {
  const { data } = await db().from('daily_reports').select('*').order('date', { ascending: false });
  if (!data) return [];
  return data.map(r => ({
    id: r.id,
    date: r.date,
    shopId: r.shop_id,
    targetRevenue: r.target_revenue || 0,
    actualRevenue: r.actual_revenue || 0,
    adSpend: r.ad_spend || 0,
    totalOrders: r.total_orders || 0,
    cancelledOrders: r.cancelled_orders || 0,
    returnedOrders: r.returned_orders || 0,
    note: r.note || '',
    createdBy: r.created_by || '',
    createdAt: r.created_at || '',
    updatedAt: r.updated_at || undefined,
  }));
}

export async function dbAddReport(report: DailyReport): Promise<void> {
  const { error } = await db().from('daily_reports').insert({
    id: report.id,
    date: report.date,
    shop_id: report.shopId,
    target_revenue: report.targetRevenue,
    actual_revenue: report.actualRevenue,
    ad_spend: report.adSpend,
    total_orders: report.totalOrders,
    cancelled_orders: report.cancelledOrders,
    returned_orders: report.returnedOrders,
    note: report.note,
    created_by: report.createdBy,
    created_at: report.createdAt,
  });
  if (error) throw new Error('Lưu báo cáo thất bại: ' + error.message);
}

export async function dbUpdateReport(report: DailyReport): Promise<void> {
  const { error } = await db().from('daily_reports').update({
    date: report.date,
    shop_id: report.shopId,
    target_revenue: report.targetRevenue,
    actual_revenue: report.actualRevenue,
    ad_spend: report.adSpend,
    total_orders: report.totalOrders,
    cancelled_orders: report.cancelledOrders,
    returned_orders: report.returnedOrders,
    note: report.note,
    updated_at: new Date().toISOString(),
  }).eq('id', report.id);
  if (error) throw new Error('Cập nhật báo cáo thất bại: ' + error.message);
}

// ==================== KPIs ====================

export async function dbGetKPIs(): Promise<MonthlyKPI[]> {
  const { data } = await db().from('monthly_kpis').select('*');
  if (!data) return [];
  return data.map(r => ({
    shopId: r.shop_id,
    month: r.month,
    kpiAmount: r.kpi_amount || 0,
  }));
}

export async function dbUpdateKPI(kpi: MonthlyKPI): Promise<void> {
  await db().from('monthly_kpis').upsert({
    shop_id: kpi.shopId,
    month: kpi.month,
    kpi_amount: kpi.kpiAmount,
  }, { onConflict: 'shop_id,month' });
}

// ==================== Plans ====================

export async function dbGetPlans(): Promise<MonthlyPlan[]> {
  const { data } = await db().from('monthly_plans').select('*');
  if (!data) return [];
  return data.map(r => ({
    shopId: r.shop_id,
    month: r.month,
    regularDayTarget: r.regular_day_target || 0,
    saleDoubleDayTarget: r.sale_double_day_target || 0,
    saleFixedDayTarget: r.sale_fixed_day_target || 0,
    totalMktBudget: r.total_mkt_budget || 0,
    regularDayMkt: r.regular_day_mkt || 0,
    saleDayMkt: r.sale_day_mkt || 0,
    dailyOverrides: (r.daily_overrides as Record<string, number>) || {},
  }));
}

export async function dbUpdatePlan(plan: MonthlyPlan): Promise<void> {
  await db().from('monthly_plans').upsert({
    shop_id: plan.shopId,
    month: plan.month,
    regular_day_target: plan.regularDayTarget,
    sale_double_day_target: plan.saleDoubleDayTarget,
    sale_fixed_day_target: plan.saleFixedDayTarget,
    total_mkt_budget: plan.totalMktBudget,
    regular_day_mkt: plan.regularDayMkt,
    sale_day_mkt: plan.saleDayMkt,
    daily_overrides: plan.dailyOverrides,
  }, { onConflict: 'shop_id,month' });
}

// ==================== Config ====================

export async function dbGetConfig(): Promise<AppConfig> {
  const { data } = await db().from('app_config').select('*').eq('id', 1).single();
  if (!data) return DEFAULT_CONFIG;
  return {
    adsThresholdGreen: Number(data.ads_threshold_green) || DEFAULT_CONFIG.adsThresholdGreen,
    adsThresholdYellow: Number(data.ads_threshold_yellow) || DEFAULT_CONFIG.adsThresholdYellow,
    cancelReturnThresholdYellow: Number(data.cancel_return_threshold_yellow) || DEFAULT_CONFIG.cancelReturnThresholdYellow,
    cancelReturnThresholdRed: Number(data.cancel_return_threshold_red) || DEFAULT_CONFIG.cancelReturnThresholdRed,
  };
}

export async function dbUpdateConfig(config: AppConfig): Promise<void> {
  await db().from('app_config').update({
    ads_threshold_green: config.adsThresholdGreen,
    ads_threshold_yellow: config.adsThresholdYellow,
    cancel_return_threshold_yellow: config.cancelReturnThresholdYellow,
    cancel_return_threshold_red: config.cancelReturnThresholdRed,
  }).eq('id', 1);
}
