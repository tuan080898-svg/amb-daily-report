import { supabase } from './supabase';
import { User, Shop, DailyReport, MonthlyKPI, MonthlyPlan, AppConfig, SkuImport, AnalyticsImport, CskhReview, CskhIssue, CogsEntry, PnlConfig, PnlImport, ChecklistTask, ChecklistEntry, WeeklyAction, MonthlyPlanNote } from './types';
import type { InventoryData, InventoryTransaction, InventoryConfig, InventoryPushBatch, Warehouse } from './inventory';
import { DEFAULT_CONFIG } from './utils';
import type { PxkData, PxkBatch } from './pxk';
import type { DcConfig, DcSession, DcSettings, DcBo } from './doichieu';
import type { SkData } from './sokho';

function db() {
  if (!supabase) throw new Error('Supabase not configured');
  return supabase;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Tải file từ Storage và bỏ qua bộ nhớ đệm của trình duyệt. Supabase mặc định dặn trình duyệt giữ bản cũ 1 giờ,
// nên dữ liệu vừa ghi (bảng quy đổi SKU, import SKU...) có thể không hiện khi tải lại trang.
async function downloadFresh(bucket: string, path: string): Promise<{ data: Blob | null; error: { message: string; statusCode?: string } | null }> {
  try {
    const res = await fetch(SUPABASE_URL + '/storage/v1/object/authenticated/' + bucket + '/' + path, {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
      cache: 'no-store',
    });
    if (!res.ok) {
      let message = 'HTTP ' + res.status;
      let statusCode = String(res.status);
      try { const j = await res.json(); message = j.message || j.error || message; statusCode = String(j.statusCode || statusCode); } catch { /* không phải JSON */ }
      return { data: null, error: { message: message, statusCode: statusCode } };
    }
    return { data: await res.blob(), error: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : 'fetch failed' } };
  }
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

// Thêm / sửa / xóa tài khoản đi qua máy chủ (/api/users, chỉ admin); mật khẩu được mã hóa ở máy chủ
async function userApi(body: Record<string, unknown>): Promise<void> {
  const res = await fetch('/api/users', { method: 'POST', headers: sessionHeaders(), body: JSON.stringify(body), cache: 'no-store' });
  let data: { error?: string } | null = null;
  try { data = await res.json(); } catch { /* không phải JSON */ }
  if (res.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
}

export async function dbAddUser(user: User): Promise<void> {
  await userApi({ action: 'add', user: user });
}

export async function dbUpdateUser(user: User): Promise<void> {
  await userApi({ action: 'update', user: user });
}

export async function dbDeleteUser(userId: string): Promise<void> {
  await userApi({ action: 'delete', id: userId });
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
  const { error } = await db().from('app_config').upsert({
    id: 1,
    ads_threshold_green: config.adsThresholdGreen,
    ads_threshold_yellow: config.adsThresholdYellow,
    cancel_return_threshold_yellow: config.cancelReturnThresholdYellow,
    cancel_return_threshold_red: config.cancelReturnThresholdRed,
  });
  if (error) throw error;
}

// ==================== SKU Mappings (Supabase Storage) ====================

const SKU_BUCKET = 'sku-data';
const SKU_MAPPINGS_FILE = 'mappings.json';

export async function dbGetSkuMappings(): Promise<Record<string, Array<{ product: string; quantity: number }>> | null> {
  try {
    const { data, error } = await downloadFresh(SKU_BUCKET, SKU_MAPPINGS_FILE);
    if (error) return null;
    if (!data) return null;
    const text = await data.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Trả null khi file chưa tồn tại; ném lỗi khi lỗi mạng/quyền (để không nhầm "lỗi" với "rỗng").
export async function dbGetSkuMappingsStrict(): Promise<Record<string, Array<{ product: string; quantity: number }>> | null> {
  const { data, error } = await downloadFresh(SKU_BUCKET, SKU_MAPPINGS_FILE);
  if (error) {
    const e = error as { message?: string; statusCode?: string | number; status?: number };
    const msg = (e.message || '').toLowerCase();
    if (msg.includes('not found') || String(e.statusCode) === '404' || e.status === 404) return null;
    throw new Error('Đọc SKU mappings thất bại: ' + (e.message || 'lỗi không rõ'));
  }
  if (!data) return null;
  return JSON.parse(await data.text());
}

export async function dbSaveSkuMappings(map: Record<string, Array<{ product: string; quantity: number }>>): Promise<void> {
  const json = JSON.stringify(map);
  const blob = new Blob([json], { type: 'application/json' });
  const { error } = await db().storage.from(SKU_BUCKET).upload(SKU_MAPPINGS_FILE, blob, { upsert: true, cacheControl: '0' });
  if (error) throw new Error('Lưu SKU mappings thất bại: ' + error.message);
}

// ==================== Phiếu xuất kho (Supabase Storage) ====================

const PXK_FILE = 'pxk.json';
const PXK_MAX_BATCHES = 120;

async function readPxkStrict(): Promise<PxkData> {
  const { data, error } = await downloadFresh(SKU_BUCKET, PXK_FILE);
  if (error) {
    const e = error as { message?: string; statusCode?: string | number };
    const msg = (e.message || '').toLowerCase();
    if (msg.includes('not found') || String(e.statusCode) === '404') return { names: {}, ambiguous: {}, batches: [] };
    throw new Error('Đọc dữ liệu phiếu xuất kho thất bại: ' + (e.message || 'lỗi không rõ'));
  }
  if (!data) return { names: {}, ambiguous: {}, batches: [] };
  const j = JSON.parse(await data.text()) as Partial<PxkData>;
  return { names: j.names || {}, ambiguous: j.ambiguous || {}, packProducts: j.packProducts, shops: j.shops, batches: j.batches || [] };
}

export async function dbGetPxk(): Promise<PxkData> {
  return readPxkStrict();
}

// ----- Lưu trữ phiếu theo tháng: phiếu vượt quá PXK_MAX_BATCHES gần nhất được chuyển vào file pxk-archive-YYYY-MM.json (theo ngày in), không bị xóa -----
function pxkArchiveFile(month: string): string { return 'pxk-archive-' + month + '.json'; }
function pxkMonthOf(b: PxkBatch): string { return (b.printDate || b.createdAt || '').slice(0, 7); }

export async function dbGetPxkArchive(month: string): Promise<PxkBatch[]> {
  const { data, error } = await downloadFresh(SKU_BUCKET, pxkArchiveFile(month));
  if (error) {
    const e = error as { message?: string; statusCode?: string | number };
    const msg = (e.message || '').toLowerCase();
    if (msg.includes('not found') || String(e.statusCode) === '404') return [];
    throw new Error('Đọc lưu trữ phiếu tháng ' + month + ' thất bại: ' + (e.message || 'lỗi không rõ'));
  }
  if (!data) return [];
  const j = JSON.parse(await data.text()) as { batches?: PxkBatch[] };
  return j.batches || [];
}

async function pxkArchiveBatches(list: PxkBatch[]): Promise<void> {
  const byMonth: Record<string, PxkBatch[]> = {};
  list.forEach(function(b) { (byMonth[pxkMonthOf(b)] = byMonth[pxkMonthOf(b)] || []).push(b); });
  for (const month of Object.keys(byMonth)) {
    const existing = await dbGetPxkArchive(month);
    const ids = new Set(existing.map(function(b) { return b.id; }));
    const merged = existing.concat(byMonth[month].filter(function(b) { return !ids.has(b.id); }));
    const blob = new Blob([JSON.stringify({ month: month, batches: merged })], { type: 'application/json' });
    const { error } = await db().storage.from(SKU_BUCKET).upload(pxkArchiveFile(month), blob, { upsert: true, cacheControl: '0' });
    if (error) throw new Error('Lưu trữ phiếu tháng ' + month + ' thất bại: ' + error.message);
  }
}

// Đọc bản mới nhất -> áp thay đổi -> ghi lại (không ghi đè phiếu/tên SKU của máy khác vừa lưu).
export async function dbUpdatePxk(apply: (cur: PxkData) => PxkData): Promise<PxkData> {
  const cur = await readPxkStrict();
  const next = apply(cur);
  const sorted = next.batches.sort((a: PxkBatch, b: PxkBatch) => b.createdAt.localeCompare(a.createdAt));
  const overflow = sorted.slice(PXK_MAX_BATCHES);
  if (overflow.length > 0) {
    try {
      await pxkArchiveBatches(overflow); // chuyển phiếu cũ vào lưu trữ TRƯỚC khi bỏ khỏi danh sách chính
      next.batches = sorted.slice(0, PXK_MAX_BATCHES);
    } catch (e) {
      console.warn('[PXK] Chưa lưu trữ được phiếu cũ, giữ lại trong danh sách chính:', e);
      next.batches = sorted; // không để mất phiếu
    }
  } else {
    next.batches = sorted;
  }
  const blob = new Blob([JSON.stringify(next)], { type: 'application/json' });
  const { error } = await db().storage.from(SKU_BUCKET).upload(PXK_FILE, blob, { upsert: true, cacheControl: '0' });
  if (error) throw new Error('Lưu phiếu xuất kho thất bại: ' + error.message);
  return next;
}

// ==================== SKU Imports (Supabase Storage) ====================

const SKU_FILE = 'imports.json';

export async function dbGetSkuImports(): Promise<SkuImport[]> {
  try {
    const { data, error } = await downloadFresh(SKU_BUCKET, SKU_FILE);
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
  const { error } = await db().storage.from(SKU_BUCKET).upload(SKU_FILE, blob, { upsert: true, cacheControl: '0' });
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
    const { data, error } = await downloadFresh(ANALYTICS_BUCKET, ANALYTICS_FILE);
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
  const { error } = await db().storage.from(ANALYTICS_BUCKET).upload(ANALYTICS_FILE, blob, { upsert: true, cacheControl: '0' });
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

// ==================== Giá vốn / lãi lỗ (qua cổng /api/cost, cần phiên đăng nhập) ====================
// Trình duyệt KHÔNG còn đọc trực tiếp các bảng này: máy chủ kiểm tra đăng nhập + vai trò rồi mới trả dữ liệu.

export const SESSION_EXPIRED_EVENT = 'amb-session-expired';

function sessionHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const t = localStorage.getItem('amb_token');
    if (t) h.Authorization = 'Bearer ' + t;
    const id = localStorage.getItem('amb_user_id');
    if (id) h['x-amb-user'] = id; // chế độ tương thích trước khi máy chủ bật khóa phiên
  } catch { /* không đọc được bộ nhớ trình duyệt */ }
  return h;
}

async function callApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, Object.assign({}, init, { headers: sessionHeaders(), cache: 'no-store' as RequestCache }));
  let body: { error?: string } | null = null;
  try { body = await res.json(); } catch { /* không phải JSON */ }
  if (res.status === 401) {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new Error('Phiên đăng nhập đã hết hạn, hãy đăng nhập lại');
  }
  if (!res.ok) throw new Error((body && body.error) || ('HTTP ' + res.status));
  return body as unknown as T;
}

function postApi(path: string, action: string, payload: unknown): Promise<unknown> {
  return callApi(path, { method: 'POST', body: JSON.stringify({ action: action, payload: payload }) });
}

// Giá vốn + cấu hình phí sàn (admin và nhân viên)
export async function dbGetCostBasic(): Promise<{ cogs: CogsEntry[]; config: PnlConfig }> {
  return callApi<{ cogs: CogsEntry[]; config: PnlConfig }>('/api/cost?part=basic');
}

// Toàn bộ lãi lỗ (chỉ admin), tải từng đợt
type ImportsPage = { rows: PnlImport[]; next: number | null; total: number };

// Lấy hết các dòng trong cửa sổ [from, to): máy chủ có thể dừng sớm (dung lượng) nên gọi tiếp từ chỗ dừng
async function fetchImportsWindow(from: number, to: number): Promise<PnlImport[]> {
  const out: PnlImport[] = [];
  let pos = from;
  while (pos < to) {
    const page = await callApi<ImportsPage>('/api/cost?part=imports&offset=' + pos + '&limit=' + (to - pos));
    page.rows.forEach(function(r) { out.push(r); });
    if (page.next === null || page.rows.length === 0) break;
    pos = page.next;
  }
  return out;
}

// Toàn bộ lãi lỗ (chỉ admin): chia cửa sổ 30 dòng và tải song song (tối đa 4 luồng)
export async function dbGetPnlImports(): Promise<PnlImport[]> {
  const first = await callApi<ImportsPage>('/api/cost?part=imports&offset=0&limit=30');
  const total = first.total;
  const parts: PnlImport[][] = [first.rows];
  let covered = first.next === null ? Math.min(30, total) : first.next;
  if (first.next !== null) { parts[0] = first.rows.concat(await fetchImportsWindow(first.next, Math.min(30, total))); covered = Math.min(30, total); }
  const windows: Array<[number, number]> = [];
  for (let s = covered; s < total; s += 30) windows.push([s, Math.min(s + 30, total)]);
  let idx = 0;
  const results: PnlImport[][] = new Array(windows.length);
  async function worker() {
    while (idx < windows.length) {
      const i = idx++;
      results[i] = await fetchImportsWindow(windows[i][0], windows[i][1]);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  return parts.concat(results).reduce(function(all, p) { return all.concat(p); }, [] as PnlImport[]);
}

export async function dbSaveCogs(list: CogsEntry[]): Promise<void> {
  await postApi('/api/cost', 'saveCogs', list);
}

export async function dbSavePnlConfig(config: PnlConfig): Promise<void> {
  await postApi('/api/cost', 'saveConfig', config);
}

// Gửi các đợt nhập lãi lỗ mới / đã sửa, chia nhỏ dưới ~3 MB mỗi lần
export async function dbUpsertPnlImports(list: PnlImport[]): Promise<void> {
  let batch: PnlImport[] = [];
  let size = 0;
  for (const imp of list) {
    const s = JSON.stringify(imp).length;
    if (batch.length > 0 && size + s > 3000000) { await postApi('/api/cost', 'upsertImports', batch); batch = []; size = 0; }
    batch.push(imp); size += s;
  }
  if (batch.length > 0) await postApi('/api/cost', 'upsertImports', batch);
}

export async function dbDeletePnlImports(ids: string[]): Promise<void> {
  if (ids.length > 0) await postApi('/api/cost', 'deleteImports', ids);
}

export async function dbAddPnlImport(imp: PnlImport): Promise<void> {
  await postApi('/api/cost', 'addImport', imp);
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
    const res = await downloadFresh('pnl-data', 'checklist-tasks.json');
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
    const res = await downloadFresh('pnl-data', 'checklist-entries.json');
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

// Đọc hết mọi dòng (Supabase giới hạn số dòng mỗi lần trả về nên phải đọc từng trang).
// Lỗi thì ném ra — không trả về dữ liệu rỗng/thiếu để tránh bị hiểu nhầm là "kho trống".
async function fetchAllRows<T>(table: string, orderCols: Array<{ col: string; asc: boolean }>): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    let q = db().from(table).select('*');
    orderCols.forEach(function(o) { q = q.order(o.col, { ascending: o.asc }); });
    const { data, error } = await q.range(from, from + 999);
    if (error) throw new Error('Đọc ' + table + ' thất bại: ' + error.message);
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    from += data.length;
  }
  return rows;
}

export async function dbGetInventory(): Promise<InventoryData> {
  const [configRows, txRows] = await Promise.all([
    fetchAllRows<{ product: string; warehouse: string; initial_stock: number; alert_threshold: number; lead_time_days?: number }>(
      'inventory_configs', [{ col: 'product', asc: true }, { col: 'warehouse', asc: true }]),
    fetchAllRows<{ id: string; date: string; product: string; quantity: number; type: string; note: string; warehouse: string }>(
      'inventory_transactions', [{ col: 'date', asc: false }, { col: 'id', asc: true }]),
  ]);

  const products: Record<string, Record<string, InventoryConfig>> = {};
  configRows.forEach(function(r) {
    if (!products[r.product]) products[r.product] = {};
    products[r.product][r.warehouse] = {
      initialStock: r.initial_stock || 0,
      alertThreshold: r.alert_threshold || 10,
      leadTimeDays: r.lead_time_days || 10,
    };
  });

  const transactions: InventoryTransaction[] = txRows.map(function(r) {
    return {
      id: r.id,
      date: r.date,
      product: r.product,
      quantity: r.quantity,
      type: r.type as InventoryTransaction['type'],
      note: r.note || '',
      warehouse: (r.warehouse || 'HCM') as Warehouse,
    };
  });

  return { products, transactions };
}

// Gửi các thay đổi lên cloud theo từng dòng. KHÔNG bao giờ xoá dòng nào ngoài danh sách txDel.
export async function dbPushInventory(batch: InventoryPushBatch): Promise<void> {
  const BATCH = 500;

  const cfgGroups = [
    { ifAbsent: false, items: batch.cfg.filter(function(c) { return !c.ifAbsent; }) },
    { ifAbsent: true, items: batch.cfg.filter(function(c) { return c.ifAbsent; }) },
  ];
  for (const group of cfgGroups) {
    if (group.items.length === 0) continue;
    const full = group.items.map(function(c) {
      return { product: c.product, warehouse: c.warehouse, initial_stock: c.config.initialStock, alert_threshold: c.config.alertThreshold, lead_time_days: c.config.leadTimeDays || 10 };
    });
    const basic = group.items.map(function(c) {
      return { product: c.product, warehouse: c.warehouse, initial_stock: c.config.initialStock, alert_threshold: c.config.alertThreshold };
    });
    const opts = group.ifAbsent ? { onConflict: 'product,warehouse', ignoreDuplicates: true } : { onConflict: 'product,warehouse' };
    let useFull = true;
    for (let i = 0; i < full.length; i += BATCH) {
      const rows = useFull ? full.slice(i, i + BATCH) : basic.slice(i, i + BATCH);
      const { error } = await db().from('inventory_configs').upsert(rows, opts);
      if (error) {
        if (useFull && error.message.includes('lead_time_days')) {
          useFull = false;
          const { error: err2 } = await db().from('inventory_configs').upsert(basic.slice(i, i + BATCH), opts);
          if (err2) throw new Error('Lưu config tồn kho thất bại: ' + err2.message);
        } else {
          throw new Error('Lưu config tồn kho thất bại: ' + error.message);
        }
      }
    }
  }

  const txRows = batch.tx.map(function(t) {
    return { id: t.id, date: t.date, product: t.product, quantity: t.quantity, type: t.type, note: t.note, warehouse: t.warehouse || 'HCM' };
  });
  for (let i = 0; i < txRows.length; i += BATCH) {
    const { error } = await db().from('inventory_transactions').upsert(txRows.slice(i, i + BATCH));
    if (error) throw new Error('Lưu giao dịch tồn kho thất bại: ' + error.message);
  }

  for (let i = 0; i < batch.txDel.length; i += 100) {
    const { error } = await db().from('inventory_transactions').delete().in('id', batch.txDel.slice(i, i + 100));
    if (error) throw new Error('Xoá giao dịch tồn kho thất bại: ' + error.message);
  }
}

// ==================== Weekly Actions ====================

export async function dbGetWeeklyActions(): Promise<WeeklyAction[]> {
  const { data } = await db().from('weekly_actions').select('*').order('created_at', { ascending: false });
  if (!data) return [];
  return data.map(function(r) {
    return {
      id: r.id,
      shopId: r.shop_id,
      weekStart: r.week_start,
      month: r.month,
      title: r.title,
      deadline: r.deadline || '',
      status: r.status || 'pending',
      createdBy: r.created_by,
      createdAt: r.created_at || '',
      updatedAt: r.updated_at || undefined,
    };
  });
}

export async function dbAddWeeklyAction(action: WeeklyAction): Promise<void> {
  const { error } = await db().from('weekly_actions').upsert({
    id: action.id,
    shop_id: action.shopId,
    week_start: action.weekStart,
    month: action.month,
    title: action.title,
    deadline: action.deadline,
    status: action.status,
    created_by: action.createdBy,
    created_at: action.createdAt,
    updated_at: action.updatedAt,
  });
  if (error) throw new Error('Luu hanh dong that bai: ' + error.message);
}

export async function dbUpdateWeeklyAction(action: WeeklyAction): Promise<void> {
  const { error } = await db().from('weekly_actions').update({
    title: action.title,
    deadline: action.deadline,
    status: action.status,
    updated_at: new Date().toISOString(),
  }).eq('id', action.id);
  if (error) throw new Error('Cap nhat hanh dong that bai: ' + error.message);
}

export async function dbDeleteWeeklyAction(id: string): Promise<void> {
  const { error } = await db().from('weekly_actions').delete().eq('id', id);
  if (error) throw new Error('Xoa hanh dong that bai: ' + error.message);
}

// ==================== Monthly Plan Notes ====================

export async function dbGetMonthlyPlanNotes(): Promise<MonthlyPlanNote[]> {
  const { data } = await db().from('monthly_plan_notes').select('*');
  if (!data) return [];
  return data.map(function(r) {
    return {
      id: r.id,
      shopId: r.shop_id,
      month: r.month,
      strategy: r.strategy || '',
      productFocus: r.product_focus || '',
      promoPlan: r.promo_plan || '',
      productTargets: (() => { try { return r.product_targets ? JSON.parse(r.product_targets) : []; } catch { return []; } })(),
      createdBy: r.created_by,
      createdAt: r.created_at || '',
      updatedAt: r.updated_at || undefined,
    };
  });
}

export async function dbSaveMonthlyPlanNote(note: MonthlyPlanNote): Promise<void> {
  const { error } = await db().from('monthly_plan_notes').upsert({
    id: note.id,
    shop_id: note.shopId,
    month: note.month,
    strategy: note.strategy,
    product_focus: note.productFocus,
    promo_plan: note.promoPlan,
    product_targets: JSON.stringify(note.productTargets || []),
    created_by: note.createdBy,
    created_at: note.createdAt,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error('Luu ke hoach that bai: ' + error.message);
}

// ==================== Đối chiếu sổ kho (qua /api/doichieu, chỉ admin) ====================

export async function dbGetDoiChieuConfig(): Promise<DcConfig> {
  return callApi<DcConfig>('/api/doichieu?part=config');
}

export async function dbGetDoiChieuMonth(month: string): Promise<DcSession[]> {
  const r = await callApi<{ sessions: DcSession[] }>('/api/doichieu?part=month&month=' + encodeURIComponent(month));
  return r.sessions || [];
}

export async function dbSaveDoiChieuConfig(patch: { settings?: DcSettings; bo?: DcBo[]; combos?: Array<[string, string]>; catalog?: Array<[string, string]> }): Promise<DcConfig> {
  return postApi('/api/doichieu', 'saveConfig', patch) as Promise<DcConfig>;
}

// Chia nhỏ để mỗi lần gửi dưới giới hạn dung lượng của máy chủ (~4 MB)
export async function dbSaveDoiChieuSessions(list: DcSession[]): Promise<void> {
  let batch: DcSession[] = [];
  let size = 0;
  for (const s of list) {
    const n = JSON.stringify(s).length;
    if (batch.length > 0 && (size + n > 2500000 || batch.length >= 30)) { await postApi('/api/doichieu', 'saveSessions', batch); batch = []; size = 0; }
    batch.push(s); size += n;
  }
  if (batch.length > 0) await postApi('/api/doichieu', 'saveSessions', batch);
}

export async function dbDeleteDoiChieuSessions(days: string[]): Promise<number> {
  const r = await postApi('/api/doichieu', 'deleteSessions', days) as { deleted: number };
  return r.deleted;
}

// ==================== Sổ kho thực tế (qua /api/sokho) ====================

export async function dbGetSoKho(): Promise<SkData> {
  return callApi<SkData>('/api/sokho');
}

export async function dbSoKhoAction(action: 'addCount' | 'addMove' | 'setKhoUser' | 'removeEntries' | 'hideProduct' | 'addExtra' | 'removeExtra', payload: Record<string, unknown>): Promise<SkData> {
  return postApi('/api/sokho', action, payload) as Promise<SkData>;
}
