import { supabase } from './supabase';
import { User, Shop, DailyReport, MonthlyKPI, MonthlyPlan, AppConfig, SkuImport, AnalyticsImport, CskhReview, CskhIssue } from './types';
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
  const { error } = await db().from('daily_reports').upsert({
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

// ==================== SKU Imports (Supabase Storage) ====================

const SKU_BUCKET = 'sku-data';
const SKU_FILE = 'imports.json';

export async function dbGetSkuImports(): Promise<SkuImport[]> {
  try {
    const { data, error } = await db().storage.from(SKU_BUCKET).download(SKU_FILE);
    if (error) {
      console.warn('[SKU] download error:', error.message);
      return [];
    }
    if (!data) {
      console.warn('[SKU] download returned null data');
      return [];
    }
    const text = await data.text();
    const arr = JSON.parse(text) as SkuImport[];
    console.log('[SKU] loaded', arr.length, 'imports from Storage');
    return arr.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  } catch (e) {
    console.error('[SKU] unexpected error loading SKU:', e);
    return [];
  }
}

async function saveSkuList(list: SkuImport[]): Promise<void> {
  const json = JSON.stringify(list);
  const blob = new Blob([json], { type: 'application/json' });
  console.log('[SKU] saving', list.length, 'imports, size:', json.length, 'bytes');
  const { error } = await db().storage.from(SKU_BUCKET).upload(SKU_FILE, blob, { upsert: true });
  if (error) {
    console.error('[SKU] save error:', error.message);
    throw new Error('Lưu SKU thất bại: ' + error.message);
  }
  console.log('[SKU] saved OK');
}

export async function dbAddSkuImport(imp: SkuImport): Promise<void> {
  const existing = await dbGetSkuImports();
  const filtered = existing.filter(e => {
    if (e.shopId !== imp.shopId) return true;
    return e.dateTo < imp.dateFrom || e.dateFrom > imp.dateTo;
  });
  filtered.push(imp);
  await saveSkuList(filtered);
}

export async function dbDeleteSkuImport(id: string): Promise<void> {
  const existing = await dbGetSkuImports();
  await saveSkuList(existing.filter(e => e.id !== id));
}

// ==================== Analytics Imports (Supabase Storage) ====================

const ANALYTICS_BUCKET = 'analytics-data';
const ANALYTICS_FILE = 'imports.json';

export async function dbGetAnalytics(): Promise<AnalyticsImport[]> {
  try {
    const { data, error } = await db().storage.from(ANALYTICS_BUCKET).download(ANALYTICS_FILE);
    if (error) {
      console.warn('[Analytics] download error:', error.message);
      return [];
    }
    if (!data) {
      console.warn('[Analytics] download returned null data');
      return [];
    }
    const text = await data.text();
    const arr = JSON.parse(text) as AnalyticsImport[];
    console.log('[Analytics] loaded', arr.length, 'imports from Storage');
    return arr.sort(function(a, b) { return b.importedAt.localeCompare(a.importedAt); });
  } catch (e) {
    console.error('[Analytics] unexpected error loading analytics:', e);
    return [];
  }
}

async function saveAnalyticsList(list: AnalyticsImport[]): Promise<void> {
  const json = JSON.stringify(list);
  const blob = new Blob([json], { type: 'application/json' });
  console.log('[Analytics] saving', list.length, 'imports, size:', json.length, 'bytes');
  const { error } = await db().storage.from(ANALYTICS_BUCKET).upload(ANALYTICS_FILE, blob, { upsert: true });
  if (error) {
    console.error('[Analytics] save error:', error.message);
    throw new Error('Lưu Analytics thất bại: ' + error.message);
  }
  console.log('[Analytics] saved OK');
}

export async function dbAddAnalytics(imp: AnalyticsImport): Promise<void> {
  const existing = await dbGetAnalytics();
  const filtered = existing.filter(function(e) {
    if (e.shopId !== imp.shopId) return true;
    return e.dateTo < imp.dateFrom || e.dateFrom > imp.dateTo;
  });
  filtered.push(imp);
  await saveAnalyticsList(filtered);
}

export async function dbDeleteAnalytics(id: string): Promise<void> {
  const existing = await dbGetAnalytics();
  await saveAnalyticsList(existing.filter(function(e) { return e.id !== id; }));
}

// ==================== CSKH Reviews ====================

export async function dbGetCskhReviews(): Promise<CskhReview[]> {
  const { data } = await db().from('cskh_reviews').select('*').order('date', { ascending: false });
  if (!data) return [];
  return data.map(function(r) {
    return {
      id: r.id,
      date: r.date,
      reporterId: r.reporter_id,
      shopId: r.shop_id,
      orderCode: r.order_code,
      customerInfo: r.customer_info || '',
      product: r.product || '',
      initialStars: r.initial_stars,
      reviewContent: r.review_content || '',
      resolutionMethod: r.resolution_method || '',
      status: r.status,
      result: r.result || '',
      note: r.note || '',
      createdAt: r.created_at || '',
      updatedAt: r.updated_at || undefined,
    };
  });
}

export async function dbAddCskhReview(review: CskhReview): Promise<void> {
  const { error } = await db().from('cskh_reviews').upsert({
    id: review.id,
    date: review.date,
    reporter_id: review.reporterId,
    shop_id: review.shopId,
    order_code: review.orderCode,
    customer_info: review.customerInfo,
    product: review.product,
    initial_stars: review.initialStars,
    review_content: review.reviewContent,
    resolution_method: review.resolutionMethod,
    status: review.status,
    result: review.result,
    note: review.note,
    created_at: review.createdAt,
    updated_at: review.updatedAt,
  });
  if (error) throw new Error('Lưu đánh giá CSKH thất bại: ' + error.message);
}

export async function dbUpdateCskhReview(review: CskhReview): Promise<void> {
  const { error } = await db().from('cskh_reviews').update({
    status: review.status,
    result: review.result,
    resolution_method: review.resolutionMethod,
    note: review.note,
    updated_at: new Date().toISOString(),
  }).eq('id', review.id);
  if (error) throw new Error('Cập nhật đánh giá CSKH thất bại: ' + error.message);
}

// ==================== CSKH Issues ====================

export async function dbGetCskhIssues(): Promise<CskhIssue[]> {
  const { data } = await db().from('cskh_issues').select('*').order('date', { ascending: false });
  if (!data) return [];
  return data.map(function(r) {
    return {
      id: r.id,
      date: r.date,
      reporterId: r.reporter_id,
      shopId: r.shop_id,
      orderCode: r.order_code,
      issueType: r.issue_type,
      description: r.description || '',
      resolution: r.resolution || '',
      urgency: r.urgency,
      status: r.status,
      needsIntervention: r.needs_intervention || false,
      interventionNote: r.intervention_note || '',
      createdAt: r.created_at || '',
      updatedAt: r.updated_at || undefined,
    };
  });
}

export async function dbAddCskhIssue(issue: CskhIssue): Promise<void> {
  const { error } = await db().from('cskh_issues').upsert({
    id: issue.id,
    date: issue.date,
    reporter_id: issue.reporterId,
    shop_id: issue.shopId,
    order_code: issue.orderCode,
    issue_type: issue.issueType,
    description: issue.description,
    resolution: issue.resolution,
    urgency: issue.urgency,
    status: issue.status,
    needs_intervention: issue.needsIntervention,
    intervention_note: issue.interventionNote,
    created_at: issue.createdAt,
    updated_at: issue.updatedAt,
  });
  if (error) throw new Error('Lưu vấn đề CSKH thất bại: ' + error.message);
}

export async function dbUpdateCskhIssue(issue: CskhIssue): Promise<void> {
  const { error } = await db().from('cskh_issues').update({
    status: issue.status,
    urgency: issue.urgency,
    resolution: issue.resolution,
    needs_intervention: issue.needsIntervention,
    intervention_note: issue.interventionNote,
    updated_at: new Date().toISOString(),
  }).eq('id', issue.id);
  if (error) throw new Error('Cập nhật vấn đề CSKH thất bại: ' + error.message);
}
