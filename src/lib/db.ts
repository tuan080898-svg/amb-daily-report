import { supabase } from './supabase';
import { User, Shop, DailyReport, MonthlyKPI, MonthlyPlan, AppConfig, SkuImport, AnalyticsImport, CskhReview, CskhIssue, CogsEntry, PnlConfig, PnlImport, ChecklistTask, ChecklistEntry } from './types';
import type { InventoryData, InventoryTransaction, InventoryConfig, Warehouse } from './inventory';
import { DEFAULT_CONFIG } from './utils';
import bcrypt from 'bcryptjs';

function db() {
  if (!supabase) throw new Error('Supabase not configured');
  return supabase;
}

// ==================== Users ====================

export async function dbGetUsers(): Promise<User[]> {
  const { data } = await db().from('users').select('id, email, name, role, assigned_shops');
  if (!data) return [];
  return data.map(r => ({
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    assignedShops: r.assigned_shops || [],
  }));
}

export async function dbAddUser(user: User): Promise<void> {
  const rawPassword = user.password || 'Amb@2024';
  const hashed = await bcrypt.hash(rawPassword, 10);
  const { error } = await db().from('users').insert({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    assigned_shops: user.assignedShops,
    password: hashed,
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
    updateData.password = await bcrypt.hash(user.password, 10);
  }
  const { error } = await db().from('users').update(updateData).eq('id', user.id);
  if (error) throw new Error('Cập nhật user thất bại: ' + error.message);
}

export async function dbDeleteUser(userId: string): Promise<void> {
  const { error } = await db().from('users').delete().eq('id', userId);
  if (error) throw new Error('Xóa user thất bại: ' + error.message);
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
  const { error } = await db().from('shops').insert({
    id: shop.id,
    name: shop.name,
    channel: shop.channel,
    region: shop.region,
    assigned_to: shop.assignedTo,
    default_monthly_target: shop.defaultMonthlyTarget,
  });
  if (error) throw new Error('Thêm shop thất bại: ' + error.message);
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
  const { error } = await db().from('shops').delete().eq('id', shopId);
  if (error) throw new Error('Xóa shop thất bại: ' + error.message);
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
  const { error } = await db().from('monthly_kpis').upsert({
    shop_id: kpi.shopId,
    month: kpi.month,
    kpi_amount: kpi.kpiAmount,
  }, { onConflict: 'shop_id,month' });
  if (error) throw new Error('Cập nhật KPI thất bại: ' + error.message);
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
  const { error } = await db().from('monthly_plans').upsert({
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
  if (error) throw new Error('Cập nhật kế hoạch thất bại: ' + error.message);
}

// ==================== Config ====================

export async function dbGetConfig(): Promise<AppConfig> {
  const { data } = await db().from('app_config').select('*').eq('id', 1).single();
  if (!data) return DEFAULT_CONFIG;
  return {
    adsThresholdGreen: data.ads_threshold_green != null ? Number(data.ads_threshold_green) : DEFAULT_CONFIG.adsThresholdGreen,
    adsThresholdYellow: data.ads_threshold_yellow != null ? Number(data.ads_threshold_yellow) : DEFAULT_CONFIG.adsThresholdYellow,
    cancelReturnThresholdYellow: data.cancel_return_threshold_yellow != null ? Number(data.cancel_return_threshold_yellow) : DEFAULT_CONFIG.cancelReturnThresholdYellow,
    cancelReturnThresholdRed: data.cancel_return_threshold_red != null ? Number(data.cancel_return_threshold_red) : DEFAULT_CONFIG.cancelReturnThresholdRed,
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

// ==================== COGS (PostgreSQL) ====================

export async function dbGetCogs(): Promise<CogsEntry[]> {
  const { data } = await db().from('cogs_entries').select('*');
  if (data && data.length > 0) {
    return data.map(function(r: Record<string, unknown>) {
      return { sku: r.sku as string, name: r.name as string, cost: r.cost as number };
    });
  }
  try {
    const res = await db().storage.from('pnl-data').download('cogs.json');
    if (!res.error && res.data) {
      const list = JSON.parse(await res.data.text()) as CogsEntry[];
      if (list.length > 0) { await dbSaveCogs(list); return list; }
    }
  } catch {}
  return [];
}

export async function dbSaveCogs(list: CogsEntry[]): Promise<void> {
  if (list.length === 0) return;
  const rows = list.map(function(e) { return { sku: e.sku, name: e.name, cost: e.cost }; });
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db().from('cogs_entries').upsert(rows.slice(i, i + BATCH));
    if (error) throw new Error('Lưu giá vốn thất bại: ' + error.message);
  }
  const newSkus = new Set(list.map(function(e) { return e.sku; }));
  const { data: existing } = await db().from('cogs_entries').select('sku');
  const toDelete = (existing || []).filter(function(r: Record<string, unknown>) { return !newSkus.has(r.sku as string); });
  for (const row of toDelete) {
    await db().from('cogs_entries').delete().eq('sku', row.sku as string);
  }
}

// ==================== PnL Config (PostgreSQL) ====================

export async function dbGetPnlConfig(): Promise<PnlConfig> {
  const { data } = await db().from('pnl_config').select('*').eq('id', 1).single();
  if (data) {
    return {
      shopeeFeeRate: data.shopee_fee_rate != null ? Number(data.shopee_fee_rate) : 34,
      tiktokFeeRate: data.tiktok_fee_rate != null ? Number(data.tiktok_fee_rate) : 34,
      opexRate: data.opex_rate != null ? Number(data.opex_rate) : 16,
    };
  }
  try {
    const res = await db().storage.from('pnl-data').download('config.json');
    if (!res.error && res.data) {
      const parsed = JSON.parse(await res.data.text()) as PnlConfig;
      if (parsed.opexRate === undefined) parsed.opexRate = 16;
      if (parsed.shopeeFeeRate == null) parsed.shopeeFeeRate = 34;
      await dbSavePnlConfig(parsed);
      return parsed;
    }
  } catch {}
  return { shopeeFeeRate: 34, tiktokFeeRate: 34, opexRate: 16 };
}

export async function dbSavePnlConfig(config: PnlConfig): Promise<void> {
  const { error } = await db().from('pnl_config').upsert({
    id: 1,
    shopee_fee_rate: config.shopeeFeeRate,
    tiktok_fee_rate: config.tiktokFeeRate,
    opex_rate: config.opexRate,
  });
  if (error) throw new Error('Lưu cấu hình PnL thất bại: ' + error.message);
}

// ==================== PnL Imports (PostgreSQL) ====================

export async function dbGetPnlImports(): Promise<PnlImport[]> {
  const { data } = await db().from('pnl_imports').select('*');
  if (data && data.length > 0) {
    return data.map(function(r: Record<string, unknown>) {
      return {
        id: r.id as string,
        shopId: r.shop_id as string,
        shopName: r.shop_name as string,
        channel: r.channel as string,
        dateFrom: r.date_from as string,
        dateTo: r.date_to as string,
        dailyData: (r.daily_data || []) as PnlImport['dailyData'],
        importedAt: r.imported_at as string,
      };
    });
  }
  try {
    const res = await db().storage.from('pnl-data').download('imports.json');
    if (!res.error && res.data) {
      const list = JSON.parse(await res.data.text()) as PnlImport[];
      if (list.length > 0) { await dbSavePnlImports(list); return list; }
    }
  } catch {}
  return [];
}

export async function dbSavePnlImports(list: PnlImport[]): Promise<void> {
  var shopDatePairs = new Set<string>();
  for (const imp of list) {
    shopDatePairs.add(imp.shopId + '|' + imp.dateFrom + '|' + imp.dateTo);
    const { error } = await db().from('pnl_imports').upsert({
      id: imp.id,
      shop_id: imp.shopId,
      shop_name: imp.shopName,
      channel: imp.channel,
      date_from: imp.dateFrom,
      date_to: imp.dateTo,
      daily_data: imp.dailyData,
      imported_at: imp.importedAt,
    });
    if (error) throw new Error('Lưu PnL imports thất bại: ' + error.message);
  }
  var newIds = new Set(list.map(function(imp) { return imp.id; }));
  for (const imp of list) {
    const { data: overlapping } = await db().from('pnl_imports').select('id,date_from,date_to')
      .eq('shop_id', imp.shopId)
      .lte('date_from', imp.dateTo)
      .gte('date_to', imp.dateFrom);
    if (overlapping) {
      for (const row of overlapping) {
        if (!newIds.has(row.id as string)) {
          await db().from('pnl_imports').delete().eq('id', row.id as string);
        }
      }
    }
  }
}

export async function dbAddPnlImport(imp: PnlImport): Promise<void> {
  const { error } = await db().from('pnl_imports').upsert({
    id: imp.id,
    shop_id: imp.shopId,
    shop_name: imp.shopName,
    channel: imp.channel,
    date_from: imp.dateFrom,
    date_to: imp.dateTo,
    daily_data: imp.dailyData,
    imported_at: imp.importedAt,
  });
  if (error) throw new Error('Lưu PnL import thất bại: ' + error.message);
  const { data: overlapping } = await db().from('pnl_imports').select('id')
    .eq('shop_id', imp.shopId)
    .lte('date_from', imp.dateTo)
    .gte('date_to', imp.dateFrom)
    .neq('id', imp.id);
  if (overlapping) {
    for (const row of overlapping) {
      await db().from('pnl_imports').delete().eq('id', row.id as string);
    }
  }
}

// ==================== Checklist Tasks (PostgreSQL) ====================

export async function dbGetChecklistTasks(): Promise<ChecklistTask[]> {
  const { data } = await db().from('checklist_tasks').select('*').order('sort_order');
  if (data && data.length > 0) {
    return data.map(function(r: Record<string, unknown>) {
      return {
        id: r.id as string,
        title: r.title as string,
        description: r.description as string,
        category: r.category as string,
        deadline: r.deadline as string,
        priority: r.priority as ChecklistTask['priority'],
        isActive: r.is_active as boolean,
        order: r.sort_order as number,
      };
    });
  }
  try {
    const res = await db().storage.from('pnl-data').download('checklist-tasks.json');
    if (!res.error && res.data) {
      const list = JSON.parse(await res.data.text()) as ChecklistTask[];
      if (list.length > 0) { await dbSaveChecklistTasks(list); return list; }
    }
  } catch {}
  return [];
}

export async function dbSaveChecklistTasks(list: ChecklistTask[]): Promise<void> {
  if (list.length > 0) {
    const rows = list.map(function(t) {
      return {
        id: t.id, title: t.title, description: t.description,
        category: t.category, deadline: t.deadline, priority: t.priority,
        is_active: t.isActive, sort_order: t.order,
      };
    });
    const { error } = await db().from('checklist_tasks').upsert(rows);
    if (error) throw new Error('Lưu checklist tasks thất bại: ' + error.message);
  }
  const newIds = new Set(list.map(function(t) { return t.id; }));
  const { data: existing } = await db().from('checklist_tasks').select('id');
  const toDelete = (existing || []).filter(function(r: Record<string, unknown>) { return !newIds.has(r.id as string); });
  for (const row of toDelete) {
    await db().from('checklist_tasks').delete().eq('id', row.id as string);
  }
}

// ==================== Checklist Entries (PostgreSQL) ====================

export async function dbGetChecklistEntries(): Promise<ChecklistEntry[]> {
  const { data } = await db().from('checklist_entries').select('*');
  if (data && data.length > 0) {
    return data.map(function(r: Record<string, unknown>) {
      return {
        date: r.date as string,
        taskId: r.task_id as string,
        userId: r.user_id as string,
        completed: r.completed as boolean,
        completedAt: r.completed_at as string,
        note: r.note as string,
      };
    });
  }
  try {
    const res = await db().storage.from('pnl-data').download('checklist-entries.json');
    if (!res.error && res.data) {
      const list = JSON.parse(await res.data.text()) as ChecklistEntry[];
      if (list.length > 0) { await dbSaveChecklistEntries(list); return list; }
    }
  } catch {}
  return [];
}

export async function dbSaveChecklistEntries(list: ChecklistEntry[]): Promise<void> {
  if (list.length === 0) return;
  const rows = list.map(function(e) {
    return {
      date: e.date, task_id: e.taskId, user_id: e.userId,
      completed: e.completed, completed_at: e.completedAt, note: e.note,
    };
  });
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db().from('checklist_entries').upsert(rows.slice(i, i + BATCH));
    if (error) throw new Error('Lưu checklist entries thất bại: ' + error.message);
  }
}

// ==================== Inventory ====================

export async function dbGetInventory(): Promise<InventoryData> {
  const [configRes, txRes] = await Promise.all([
    db().from('inventory_configs').select('*'),
    db().from('inventory_transactions').select('*').order('date', { ascending: false }),
  ]);

  const products: Record<string, Record<string, InventoryConfig>> = {};
  if (configRes.data) {
    configRes.data.forEach(function(r: { product: string; warehouse: string; initial_stock: number; alert_threshold: number }) {
      if (!products[r.product]) products[r.product] = {};
      products[r.product][r.warehouse] = {
        initialStock: r.initial_stock || 0,
        alertThreshold: r.alert_threshold || 10,
      };
    });
  }

  const transactions: InventoryTransaction[] = [];
  if (txRes.data) {
    txRes.data.forEach(function(r: { id: string; date: string; product: string; quantity: number; type: string; note: string; warehouse: string }) {
      transactions.push({
        id: r.id,
        date: r.date,
        product: r.product,
        quantity: r.quantity,
        type: r.type as InventoryTransaction['type'],
        note: r.note || '',
        warehouse: (r.warehouse || 'HCM') as Warehouse,
      });
    });
  }

  return { products, transactions };
}

export async function dbSaveInventory(data: InventoryData): Promise<void> {
  const configRows: Array<{ product: string; warehouse: string; initial_stock: number; alert_threshold: number }> = [];
  Object.entries(data.products).forEach(function(entry) {
    var product = entry[0];
    var whConfigs = entry[1];
    Object.entries(whConfigs).forEach(function(whEntry) {
      configRows.push({
        product: product,
        warehouse: whEntry[0],
        initial_stock: whEntry[1].initialStock,
        alert_threshold: whEntry[1].alertThreshold,
      });
    });
  });

  if (configRows.length > 0) {
    await db().from('inventory_configs').delete().neq('product', '');
    const BATCH = 500;
    for (let i = 0; i < configRows.length; i += BATCH) {
      const { error } = await db().from('inventory_configs').upsert(configRows.slice(i, i + BATCH));
      if (error) throw new Error('Lưu config tồn kho thất bại: ' + error.message);
    }
  }

  const txRows = data.transactions.map(function(t) {
    return {
      id: t.id,
      date: t.date,
      product: t.product,
      quantity: t.quantity,
      type: t.type,
      note: t.note,
      warehouse: t.warehouse || 'HCM',
    };
  });

  await db().from('inventory_transactions').delete().neq('id', '');
  if (txRows.length > 0) {
    const BATCH = 500;
    for (let i = 0; i < txRows.length; i += BATCH) {
      const { error } = await db().from('inventory_transactions').upsert(txRows.slice(i, i + BATCH));
      if (error) throw new Error('Lưu giao dịch tồn kho thất bại: ' + error.message);
    }
  }
}
