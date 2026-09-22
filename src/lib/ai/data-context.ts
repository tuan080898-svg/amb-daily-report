import {
  dbGetUsers, dbGetShops, dbGetReports, dbGetKPIs,
  dbGetInventory, dbGetCskhReviews, dbGetCskhIssues, dbGetCogs,
} from '@/lib/db';
import { getCurrentStock, getReorderAlerts } from '@/lib/inventory';
import type { User, Shop, DailyReport, MonthlyKPI } from '@/lib/types';

function fmt(n: number): string {
  return n.toLocaleString('vi-VN');
}

function filterShops(shops: Shop[], user: User): Shop[] {
  if (user.role === 'admin') return shops;
  return shops.filter(function(s) { return user.assignedShops.includes(s.id); });
}

function getYesterday(): string {
  var d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function getLast7Days(): string[] {
  var days: string[] = [];
  for (var i = 1; i <= 7; i++) {
    var d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

interface DataSources {
  reports?: boolean;
  inventory?: boolean;
  kpi?: boolean;
  cskh?: boolean;
  pnl?: boolean;
}

function detectDataSources(question: string): DataSources {
  var q = question.toLowerCase();
  var sources: DataSources = {};
  var matched = false;

  if (/doanh thu|revenue|ban|don hang|target|muc tieu chi|ad|qc|quang cao|huy|hoan/.test(q)) {
    sources.reports = true;
    matched = true;
  }
  if (/ton kho|kho|stock|san pham|hang hoa|nhap|reorder|dat hang/.test(q)) {
    sources.inventory = true;
    matched = true;
  }
  if (/kpi|chi tieu|muc tieu/.test(q)) {
    sources.kpi = true;
    matched = true;
  }
  if (/cskh|khach hang|review|danh gia|phan hoi|van de|issue/.test(q)) {
    sources.cskh = true;
    matched = true;
  }
  if (/pnl|loi nhuan|gia von|cogs|chi phi|profit/.test(q)) {
    sources.pnl = true;
    matched = true;
  }

  if (!matched) {
    sources.reports = true;
    sources.inventory = true;
  }

  return sources;
}

async function buildReportContext(reports: DailyReport[], shops: Shop[], days: string[]): Promise<string> {
  var relevantReports = reports.filter(function(r) { return days.includes(r.date); });
  if (relevantReports.length === 0) return 'Khong co bao cao trong ' + days.length + ' ngay gan nhat.\n';

  var lines: string[] = ['== BAO CAO BAN HANG =='];
  var byDate: Record<string, DailyReport[]> = {};
  relevantReports.forEach(function(r) {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r);
  });

  var shopMap: Record<string, string> = {};
  shops.forEach(function(s) { shopMap[s.id] = s.name; });

  Object.keys(byDate).sort().reverse().forEach(function(date) {
    lines.push('Ngay ' + date + ':');
    byDate[date].forEach(function(r) {
      var shopName = shopMap[r.shopId] || r.shopId;
      var adsRatio = r.actualRevenue > 0 ? (r.adSpend / r.actualRevenue * 100).toFixed(1) : '0';
      var cancelRate = r.totalOrders > 0 ? ((r.cancelledOrders + r.returnedOrders) / r.totalOrders * 100).toFixed(1) : '0';
      lines.push('  ' + shopName + ': DT ' + fmt(r.actualRevenue) + ' / Target ' + fmt(r.targetRevenue) +
        ' (' + (r.targetRevenue > 0 ? (r.actualRevenue / r.targetRevenue * 100).toFixed(0) : '0') + '%)' +
        ', QC ' + fmt(r.adSpend) + ' (' + adsRatio + '%)' +
        ', ' + r.totalOrders + ' don' +
        ', huy/hoan ' + (r.cancelledOrders + r.returnedOrders) + ' (' + cancelRate + '%)');
    });
  });

  return lines.join('\n') + '\n';
}

async function buildKPIContext(kpis: MonthlyKPI[], shops: Shop[], reports: DailyReport[]): Promise<string> {
  var month = getCurrentMonth();
  var monthKPIs = kpis.filter(function(k) { return k.month === month; });
  if (monthKPIs.length === 0) return '';

  var shopMap: Record<string, string> = {};
  shops.forEach(function(s) { shopMap[s.id] = s.name; });

  var monthReports = reports.filter(function(r) { return r.date.startsWith(month); });
  var shopRevenue: Record<string, number> = {};
  monthReports.forEach(function(r) {
    shopRevenue[r.shopId] = (shopRevenue[r.shopId] || 0) + r.actualRevenue;
  });

  var lines: string[] = ['== KPI THANG ' + month + ' =='];
  monthKPIs.forEach(function(k) {
    var name = shopMap[k.shopId] || k.shopId;
    var actual = shopRevenue[k.shopId] || 0;
    var pct = k.kpiAmount > 0 ? (actual / k.kpiAmount * 100).toFixed(0) : '0';
    lines.push(name + ': KPI ' + fmt(k.kpiAmount) + ', Thuc te ' + fmt(actual) + ' (' + pct + '%)');
  });

  return lines.join('\n') + '\n';
}

async function buildInventoryContext(): Promise<string> {
  var invData = await dbGetInventory();
  if (!invData || Object.keys(invData.products).length === 0) return '';

  var alerts = getReorderAlerts(invData);
  if (alerts.length === 0) return '== TON KHO ==\nTat ca san pham trong muc on dinh.\n';

  var lines: string[] = ['== TON KHO =='];
  alerts.slice(0, 15).forEach(function(a) {
    lines.push(a.product + ' (' + a.warehouse + '): con ' + a.currentStock +
      ', ban TB ' + a.dailySales.toFixed(1) + '/ngay' +
      ', con ~' + a.daysRemaining + ' ngay' +
      (a.urgency === 'critical' ? ' [KHAN CAP]' : a.urgency === 'warning' ? ' [CANH BAO]' : ''));
  });

  return lines.join('\n') + '\n';
}

async function buildCskhContext(shopIds: string[]): Promise<string> {
  var [reviews, issues] = await Promise.all([dbGetCskhReviews(), dbGetCskhIssues()]);

  var last30 = new Date();
  last30.setDate(last30.getDate() - 30);
  var cutoff = last30.toISOString().slice(0, 10);

  var recentReviews = reviews.filter(function(r) { return r.date >= cutoff && shopIds.includes(r.shopId); });
  var recentIssues = issues.filter(function(i) { return i.date >= cutoff && shopIds.includes(i.shopId); });

  if (recentReviews.length === 0 && recentIssues.length === 0) return '';

  var lines: string[] = ['== CSKH 30 NGAY =='];
  if (recentReviews.length > 0) {
    var pending = recentReviews.filter(function(r) { return r.status === 'pending'; }).length;
    var resolved = recentReviews.filter(function(r) { return r.status === 'resolved'; }).length;
    lines.push('Danh gia xau: ' + recentReviews.length + ' (cho xu ly: ' + pending + ', da xu ly: ' + resolved + ')');
  }
  if (recentIssues.length > 0) {
    var issueOpen = recentIssues.filter(function(i) { return i.status === 'open'; }).length;
    lines.push('Van de CSKH: ' + recentIssues.length + ' (dang mo: ' + issueOpen + ')');
  }

  return lines.join('\n') + '\n';
}

async function buildPnlContext(): Promise<string> {
  var cogs = await dbGetCogs();
  if (cogs.length === 0) return '';

  var lines: string[] = ['== GIA VON (CHI ADMIN) =='];
  lines.push('Co ' + cogs.length + ' SKU da cau hinh gia von.');
  return lines.join('\n') + '\n';
}

export async function buildChatContext(userId: string, question: string): Promise<string> {
  var [users, shops, reports, kpis] = await Promise.all([
    dbGetUsers(), dbGetShops(), dbGetReports(), dbGetKPIs(),
  ]);

  var user = users.find(function(u) { return u.id === userId; });
  if (!user) return 'Khong tim thay nguoi dung.\n';

  var userShops = filterShops(shops, user);
  var shopIds = userShops.map(function(s) { return s.id; });
  var userReports = reports.filter(function(r) { return shopIds.includes(r.shopId); });

  var sources = detectDataSources(question);
  var parts: string[] = [];
  parts.push('Shops: ' + userShops.map(function(s) { return s.name + ' (' + s.channel + ' ' + s.region + ')'; }).join(', '));

  var tasks: Promise<string>[] = [];

  if (sources.reports) {
    tasks.push(buildReportContext(userReports, userShops, getLast7Days()));
  }
  if (sources.kpi) {
    tasks.push(buildKPIContext(kpis, userShops, userReports));
  }
  if (sources.inventory) {
    tasks.push(buildInventoryContext());
  }
  if (sources.cskh) {
    tasks.push(buildCskhContext(shopIds));
  }
  if (sources.pnl && user.role === 'admin') {
    tasks.push(buildPnlContext());
  }

  var results = await Promise.all(tasks);
  results.forEach(function(r) { if (r) parts.push(r); });

  return parts.join('\n');
}

export async function buildInsightsContext(userId: string): Promise<{ context: string; role: string }> {
  var [users, shops, reports, kpis] = await Promise.all([
    dbGetUsers(), dbGetShops(), dbGetReports(), dbGetKPIs(),
  ]);

  var user = users.find(function(u) { return u.id === userId; });
  if (!user) return { context: '', role: 'employee' };

  var userShops = filterShops(shops, user);
  var shopIds = userShops.map(function(s) { return s.id; });
  var userReports = reports.filter(function(r) { return shopIds.includes(r.shopId); });

  var yesterday = getYesterday();
  var last7 = getLast7Days();

  var parts: string[] = [];
  parts.push('Shops: ' + userShops.map(function(s) { return s.name + ' (' + s.channel + ' ' + s.region + ')'; }).join(', '));
  parts.push('Ngay phan tich: ' + yesterday);

  var [reportCtx, kpiCtx, invCtx, cskhCtx] = await Promise.all([
    buildReportContext(userReports, userShops, last7),
    buildKPIContext(kpis, userShops, userReports),
    buildInventoryContext(),
    buildCskhContext(shopIds),
  ]);

  if (reportCtx) parts.push(reportCtx);
  if (kpiCtx) parts.push(kpiCtx);
  if (invCtx) parts.push(invCtx);
  if (cskhCtx) parts.push(cskhCtx);

  return { context: parts.join('\n'), role: user.role };
}
