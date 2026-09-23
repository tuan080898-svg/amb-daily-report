import {
  dbGetUsers, dbGetShops, dbGetReports, dbGetKPIs,
  dbGetInventory, dbGetCskhReviews, dbGetCskhIssues, dbGetCogs,
  dbGetSkuImports, dbGetPnlImports, dbGetChecklistEntries, dbGetChecklistTasks,
} from '@/lib/db';
import { getCurrentStock, getReorderAlerts, getSalesVelocity } from '@/lib/inventory';
import type { User, Shop, DailyReport, MonthlyKPI } from '@/lib/types';

function fmt(n: number): string {
  return n.toLocaleString('vi-VN');
}

function filterShops(shops: Shop[], user: User): Shop[] {
  if (user.role === 'admin') return shops;
  return shops.filter(function(s) { return user.assignedShops.includes(s.id); });
}

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function getDateRange(daysBack: number): string[] {
  var days: string[] = [];
  for (var i = 1; i <= daysBack; i++) {
    var d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function getWeekRange(weeksBack: number): { from: string; to: string } {
  var to = new Date();
  to.setDate(to.getDate() - (weeksBack - 1) * 7 - 1);
  var from = new Date(to);
  from.setDate(from.getDate() - 6);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

interface DataSources {
  reports?: boolean;
  inventory?: boolean;
  kpi?: boolean;
  cskh?: boolean;
  pnl?: boolean;
  sku?: boolean;
  employee?: boolean;
  checklist?: boolean;
}

function detectDataSources(question: string): DataSources {
  var q = question.toLowerCase();
  var sources: DataSources = {};
  var matched = false;

  if (/doanh thu|revenue|ban|don hang|target|ad|qc|quang cao|huy|hoan|trend|xu huong|so sanh|tuan|thang/.test(q)) {
    sources.reports = true;
    matched = true;
  }
  if (/ton kho|kho|stock|san pham|hang hoa|nhap|reorder|dat hang|het hang/.test(q)) {
    sources.inventory = true;
    matched = true;
  }
  if (/kpi|chi tieu|muc tieu|dat duoc/.test(q)) {
    sources.kpi = true;
    matched = true;
  }
  if (/cskh|khach hang|review|danh gia|phan hoi|van de|issue|khieu nai/.test(q)) {
    sources.cskh = true;
    matched = true;
  }
  if (/pnl|loi nhuan|gia von|cogs|chi phi|profit|lai|lo/.test(q)) {
    sources.pnl = true;
    matched = true;
  }
  if (/sku|san pham|ban chay|ban e|combo/.test(q)) {
    sources.sku = true;
    matched = true;
  }
  if (/nhan vien|employee|ai|nguoi|hieu suat|performance/.test(q)) {
    sources.employee = true;
    matched = true;
  }
  if (/checklist|cong viec|task|nhiem vu/.test(q)) {
    sources.checklist = true;
    matched = true;
  }

  if (!matched) {
    sources.reports = true;
    sources.kpi = true;
    sources.inventory = true;
  }

  return sources;
}

function buildReportContext(reports: DailyReport[], shops: Shop[], users: User[]): string {
  var last7 = getDateRange(7);
  var thisWeek = getWeekRange(1);
  var lastWeek = getWeekRange(2);

  var shopMap: Record<string, string> = {};
  shops.forEach(function(s) { shopMap[s.id] = s.name; });
  var userMap: Record<string, string> = {};
  users.forEach(function(u) { userMap[u.id] = u.name; });

  var recent = reports.filter(function(r) { return last7.includes(r.date); });
  if (recent.length === 0) return 'Khong co bao cao 7 ngay gan nhat.\n';

  var lines: string[] = ['== BAO CAO BAN HANG (7 ngay) =='];

  var byDate: Record<string, DailyReport[]> = {};
  recent.forEach(function(r) {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r);
  });

  Object.keys(byDate).sort().reverse().forEach(function(date) {
    lines.push('Ngay ' + date + ':');
    byDate[date].forEach(function(r) {
      var shopName = shopMap[r.shopId] || r.shopId;
      var adsRatio = r.actualRevenue > 0 ? (r.adSpend / r.actualRevenue * 100).toFixed(1) : '0';
      var cancelRate = r.totalOrders > 0 ? ((r.cancelledOrders + r.returnedOrders) / r.totalOrders * 100).toFixed(1) : '0';
      var costPerOrder = r.totalOrders > 0 ? Math.round(r.adSpend / r.totalOrders) : 0;
      var roas = r.adSpend > 0 ? (r.actualRevenue / r.adSpend).toFixed(1) : '-';
      lines.push('  ' + shopName + ': DT ' + fmt(r.actualRevenue) + '/' + fmt(r.targetRevenue) +
        ' (' + (r.targetRevenue > 0 ? (r.actualRevenue / r.targetRevenue * 100).toFixed(0) : '0') + '%)' +
        ', QC ' + fmt(r.adSpend) + ' (' + adsRatio + '%, ROAS ' + roas + ', CPO ' + fmt(costPerOrder) + ')' +
        ', ' + r.totalOrders + ' don' +
        ', huy/hoan ' + (r.cancelledOrders + r.returnedOrders) + ' (' + cancelRate + '%)');
    });
  });

  // Trend: this week vs last week
  var thisWeekReports = reports.filter(function(r) { return r.date >= thisWeek.from && r.date <= thisWeek.to; });
  var lastWeekReports = reports.filter(function(r) { return r.date >= lastWeek.from && r.date <= lastWeek.to; });

  if (thisWeekReports.length > 0 && lastWeekReports.length > 0) {
    lines.push('\n== XU HUONG TUAN ==');
    shops.forEach(function(shop) {
      var tw = thisWeekReports.filter(function(r) { return r.shopId === shop.id; });
      var lw = lastWeekReports.filter(function(r) { return r.shopId === shop.id; });
      if (tw.length === 0 && lw.length === 0) return;

      var twRev = tw.reduce(function(s, r) { return s + r.actualRevenue; }, 0);
      var lwRev = lw.reduce(function(s, r) { return s + r.actualRevenue; }, 0);
      var twAds = tw.reduce(function(s, r) { return s + r.adSpend; }, 0);
      var lwAds = lw.reduce(function(s, r) { return s + r.adSpend; }, 0);
      var twOrders = tw.reduce(function(s, r) { return s + r.totalOrders; }, 0);
      var lwOrders = lw.reduce(function(s, r) { return s + r.totalOrders; }, 0);
      var twCancel = tw.reduce(function(s, r) { return s + r.cancelledOrders + r.returnedOrders; }, 0);
      var lwCancel = lw.reduce(function(s, r) { return s + r.cancelledOrders + r.returnedOrders; }, 0);

      var revChange = lwRev > 0 ? ((twRev - lwRev) / lwRev * 100).toFixed(0) : '-';
      var adsChange = lwAds > 0 ? ((twAds - lwAds) / lwAds * 100).toFixed(0) : '-';
      var orderChange = lwOrders > 0 ? ((twOrders - lwOrders) / lwOrders * 100).toFixed(0) : '-';

      lines.push(shop.name + ': DT ' + (Number(revChange) > 0 ? '+' : '') + revChange + '%, QC ' + (Number(adsChange) > 0 ? '+' : '') + adsChange + '%, Don ' + (Number(orderChange) > 0 ? '+' : '') + orderChange + '%' +
        ', Huy/hoan tuan nay ' + twCancel + ' vs tuan truoc ' + lwCancel);
    });
  }

  return lines.join('\n') + '\n';
}

function buildKPIContext(kpis: MonthlyKPI[], shops: Shop[], reports: DailyReport[]): string {
  var month = getCurrentMonth();
  var monthKPIs = kpis.filter(function(k) { return k.month === month; });
  if (monthKPIs.length === 0) return '';

  var shopMap: Record<string, string> = {};
  shops.forEach(function(s) { shopMap[s.id] = s.name; });

  var monthReports = reports.filter(function(r) { return r.date.startsWith(month); });
  var shopRevenue: Record<string, number> = {};
  var shopDays: Record<string, number> = {};
  monthReports.forEach(function(r) {
    shopRevenue[r.shopId] = (shopRevenue[r.shopId] || 0) + r.actualRevenue;
    var dates = new Set<string>();
    monthReports.filter(function(mr) { return mr.shopId === r.shopId; }).forEach(function(mr) { dates.add(mr.date); });
    shopDays[r.shopId] = dates.size;
  });

  var today = new Date();
  var daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  var dayOfMonth = today.getDate();
  var daysRemaining = daysInMonth - dayOfMonth;

  var lines: string[] = ['== KPI THANG ' + month + ' (ngay ' + dayOfMonth + '/' + daysInMonth + ', con ' + daysRemaining + ' ngay) =='];
  monthKPIs.forEach(function(k) {
    var name = shopMap[k.shopId] || k.shopId;
    var actual = shopRevenue[k.shopId] || 0;
    var pct = k.kpiAmount > 0 ? (actual / k.kpiAmount * 100).toFixed(0) : '0';
    var gap = k.kpiAmount - actual;
    var needPerDay = daysRemaining > 0 ? Math.round(gap / daysRemaining) : 0;
    var avgPerDay = shopDays[k.shopId] ? Math.round(actual / shopDays[k.shopId]) : 0;

    var status = '';
    if (gap <= 0) {
      status = ' -> DA DAT KPI!';
    } else if (needPerDay > 0 && avgPerDay > 0) {
      var ratio = needPerDay / avgPerDay;
      if (ratio > 1.5) status = ' -> NGUY CO KHONG DAT (can gap ' + ratio.toFixed(1) + 'x trung binh)';
      else if (ratio > 1) status = ' -> CAN TANG TOC (can gap ' + ratio.toFixed(1) + 'x trung binh)';
      else status = ' -> DANG DUNG HUONG';
    }

    lines.push(name + ': KPI ' + fmt(k.kpiAmount) + ', Dat ' + fmt(actual) + ' (' + pct + '%)' +
      ', Thieu ' + fmt(Math.max(0, gap)) +
      (needPerDay > 0 ? ', Can ' + fmt(needPerDay) + '/ngay (TB hien tai ' + fmt(avgPerDay) + '/ngay)' : '') +
      status);
  });

  return lines.join('\n') + '\n';
}

async function buildInventoryContext(): Promise<string> {
  var invData = await dbGetInventory();
  if (!invData || Object.keys(invData.products).length === 0) return '';

  var alerts = getReorderAlerts(invData);
  if (alerts.length === 0) return '== TON KHO ==\nTat ca san pham on dinh, khong can nhap them.\n';

  var lines: string[] = ['== TON KHO =='];
  alerts.forEach(function(a) {
    var velocity7 = getSalesVelocity(invData, a.product, a.warehouse, 7);
    var velocity30 = getSalesVelocity(invData, a.product, a.warehouse, 30);

    lines.push(a.product + ' (' + a.warehouse + '): ' +
      'Ton ' + a.currentStock +
      ', Ban 7 ngay TB ' + velocity7.toFixed(1) + '/ngay, 30 ngay TB ' + velocity30.toFixed(1) + '/ngay' +
      ', Con ~' + a.daysRemaining + ' ngay' +
      ', Lead time ' + a.leadTimeDays + ' ngay' +
      ', Goi y nhap ' + a.suggestedOrder + ' don vi' +
      (a.urgency === 'critical' ? ' [KHAN CAP - can nhap ngay!]' : a.urgency === 'warning' ? ' [CANH BAO - len ke hoach nhap]' : ''));
  });

  return lines.join('\n') + '\n';
}

async function buildCskhContext(shopIds: string[], shops: Shop[]): Promise<string> {
  var [reviews, issues] = await Promise.all([dbGetCskhReviews(), dbGetCskhIssues()]);

  var last30 = new Date();
  last30.setDate(last30.getDate() - 30);
  var cutoff = last30.toISOString().slice(0, 10);

  var shopMap: Record<string, string> = {};
  shops.forEach(function(s) { shopMap[s.id] = s.name; });

  var recentReviews = reviews.filter(function(r) { return r.date >= cutoff && shopIds.includes(r.shopId); });
  var recentIssues = issues.filter(function(i) { return i.date >= cutoff && shopIds.includes(i.shopId); });

  if (recentReviews.length === 0 && recentIssues.length === 0) return '';

  var lines: string[] = ['== CSKH 30 NGAY =='];

  if (recentReviews.length > 0) {
    var pending = recentReviews.filter(function(r) { return r.status === 'pending'; }).length;
    var resolved = recentReviews.filter(function(r) { return r.status === 'resolved'; }).length;
    lines.push('Danh gia xau: ' + recentReviews.length + ' (cho xu ly: ' + pending + ', da xu ly: ' + resolved + ')');

    var byShop: Record<string, number> = {};
    recentReviews.forEach(function(r) { byShop[r.shopId] = (byShop[r.shopId] || 0) + 1; });
    Object.entries(byShop).forEach(function(e) {
      lines.push('  ' + (shopMap[e[0]] || e[0]) + ': ' + e[1] + ' danh gia xau');
    });
  }

  if (recentIssues.length > 0) {
    var issueOpen = recentIssues.filter(function(i) { return i.status === 'open'; }).length;
    var urgent = recentIssues.filter(function(i) { return i.urgency === 'high' && i.status === 'open'; }).length;
    lines.push('Van de CSKH: ' + recentIssues.length + ' (dang mo: ' + issueOpen + ', khan cap: ' + urgent + ')');

    var byType: Record<string, number> = {};
    recentIssues.forEach(function(i) { byType[i.issueType] = (byType[i.issueType] || 0) + 1; });
    Object.entries(byType).sort(function(a, b) { return b[1] - a[1]; }).forEach(function(e) {
      lines.push('  Loai "' + e[0] + '": ' + e[1] + ' van de');
    });
  }

  return lines.join('\n') + '\n';
}

async function buildPnlContext(reports: DailyReport[], shops: Shop[]): Promise<string> {
  var [cogs, pnlImports] = await Promise.all([dbGetCogs(), dbGetPnlImports()]);
  if (cogs.length === 0 && pnlImports.length === 0) return '';

  var shopMap: Record<string, string> = {};
  shops.forEach(function(s) { shopMap[s.id] = s.name; });

  var lines: string[] = ['== PNL / GIA VON (CHI ADMIN) =='];

  if (cogs.length > 0) {
    lines.push('Co ' + cogs.length + ' SKU da cau hinh gia von.');
    var topCogs = cogs.sort(function(a, b) { return b.cost - a.cost; }).slice(0, 5);
    topCogs.forEach(function(c) {
      lines.push('  ' + c.name + ' (' + c.sku + '): ' + fmt(c.cost) + ' VND');
    });
  }

  if (pnlImports.length > 0) {
    lines.push('Du lieu PnL imports: ' + pnlImports.length + ' ban ghi');
    var month = getCurrentMonth();
    var monthPnl = pnlImports.filter(function(p) { return p.dateFrom.startsWith(month); });
    if (monthPnl.length > 0) {
      monthPnl.forEach(function(p) {
        var totalRev = p.dailyData.reduce(function(s, d) { return s + d.revenue; }, 0);
        var totalCogs = p.dailyData.reduce(function(s, d) { return s + d.cogs; }, 0);
        var totalAds = p.dailyData.reduce(function(s, d) { return s + d.adSpend; }, 0);
        var totalFee = p.dailyData.reduce(function(s, d) { return s + d.platformFee; }, 0);
        var profit = totalRev - totalCogs - totalAds - totalFee;
        var margin = totalRev > 0 ? (profit / totalRev * 100).toFixed(1) : '0';
        lines.push('  ' + (shopMap[p.shopId] || p.shopName) + ' (' + p.dateFrom + ' -> ' + p.dateTo + '): DT ' + fmt(totalRev) + ', COGS ' + fmt(totalCogs) + ', QC ' + fmt(totalAds) + ', Phi san ' + fmt(totalFee) + ', Loi nhuan ' + fmt(profit) + ' (' + margin + '%)');
      });
    }
  }

  return lines.join('\n') + '\n';
}

function buildEmployeeContext(reports: DailyReport[], shops: Shop[], users: User[], kpis: MonthlyKPI[]): string {
  var employees = users.filter(function(u) { return u.role === 'employee'; });
  if (employees.length === 0) return '';

  var month = getCurrentMonth();
  var monthReports = reports.filter(function(r) { return r.date.startsWith(month); });
  var shopMap: Record<string, string> = {};
  shops.forEach(function(s) { shopMap[s.id] = s.name; });

  var lines: string[] = ['== HIEU SUAT NHAN VIEN THANG ' + month + ' =='];
  employees.forEach(function(emp) {
    var empShops = shops.filter(function(s) { return s.assignedTo.includes(emp.id); });
    if (empShops.length === 0) return;
    var empShopIds = empShops.map(function(s) { return s.id; });
    var empReports = monthReports.filter(function(r) { return empShopIds.includes(r.shopId); });

    var totalRev = empReports.reduce(function(s, r) { return s + r.actualRevenue; }, 0);
    var totalTarget = empReports.reduce(function(s, r) { return s + r.targetRevenue; }, 0);
    var totalAds = empReports.reduce(function(s, r) { return s + r.adSpend; }, 0);
    var totalOrders = empReports.reduce(function(s, r) { return s + r.totalOrders; }, 0);
    var totalCancel = empReports.reduce(function(s, r) { return s + r.cancelledOrders + r.returnedOrders; }, 0);
    var adsRatio = totalRev > 0 ? (totalAds / totalRev * 100).toFixed(1) : '0';
    var cancelRate = totalOrders > 0 ? (totalCancel / totalOrders * 100).toFixed(1) : '0';
    var targetPct = totalTarget > 0 ? (totalRev / totalTarget * 100).toFixed(0) : '0';

    var empKpis = kpis.filter(function(k) { return k.month === month && empShopIds.includes(k.shopId); });
    var kpiTotal = empKpis.reduce(function(s, k) { return s + k.kpiAmount; }, 0);
    var kpiPct = kpiTotal > 0 ? (totalRev / kpiTotal * 100).toFixed(0) : '-';

    var reportDays = new Set<string>();
    empReports.forEach(function(r) { reportDays.add(r.date); });

    lines.push(emp.name + ' (' + empShops.map(function(s) { return s.name; }).join(', ') + '):');
    lines.push('  DT ' + fmt(totalRev) + '/' + fmt(totalTarget) + ' (' + targetPct + '% target), KPI ' + kpiPct + '%');
    lines.push('  QC ' + fmt(totalAds) + ' (' + adsRatio + '%), ' + totalOrders + ' don, huy/hoan ' + totalCancel + ' (' + cancelRate + '%)');
    lines.push('  Bao cao ' + reportDays.size + ' ngay');
  });

  return lines.join('\n') + '\n';
}

async function buildSkuContext(shopIds: string[], shops: Shop[]): Promise<string> {
  var skuImports = await dbGetSkuImports();
  if (skuImports.length === 0) return '';

  var shopMap: Record<string, string> = {};
  shops.forEach(function(s) { shopMap[s.id] = s.name; });

  var recent = skuImports.filter(function(i) { return shopIds.includes(i.shopId); });
  if (recent.length === 0) return '';

  var skuCount: Record<string, number> = {};
  recent.forEach(function(imp) {
    Object.values(imp.dailySku).forEach(function(codes) {
      codes.forEach(function(code) {
        skuCount[code] = (skuCount[code] || 0) + 1;
      });
    });
  });

  var sorted = Object.entries(skuCount).sort(function(a, b) { return b[1] - a[1]; });
  if (sorted.length === 0) return '';

  var lines: string[] = ['== SKU BAN CHAY =='];
  sorted.slice(0, 15).forEach(function(entry, i) {
    lines.push((i + 1) + '. ' + entry[0] + ': ' + entry[1] + ' lan xuat hien');
  });

  return lines.join('\n') + '\n';
}

async function buildChecklistContext(userId: string): Promise<string> {
  var [tasks, entries] = await Promise.all([dbGetChecklistTasks(), dbGetChecklistEntries()]);
  if (tasks.length === 0) return '';

  var today = new Date().toISOString().slice(0, 10);
  var todayEntries = entries.filter(function(e) { return e.date === today && e.userId === userId; });
  var activeTasks = tasks.filter(function(t) { return t.isActive; });
  var completed = todayEntries.filter(function(e) { return e.completed; }).length;

  if (activeTasks.length === 0) return '';

  var lines: string[] = ['== CHECKLIST HOM NAY =='];
  lines.push('Hoan thanh: ' + completed + '/' + activeTasks.length);

  var incomplete = activeTasks.filter(function(t) {
    return !todayEntries.some(function(e) { return e.taskId === t.id && e.completed; });
  });
  if (incomplete.length > 0) {
    lines.push('Chua lam:');
    incomplete.forEach(function(t) {
      lines.push('  - ' + t.title + (t.priority === 'high' ? ' [QUAN TRONG]' : ''));
    });
  }

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
  parts.push('Hom nay: ' + new Date().toISOString().slice(0, 10));

  var tasks: Promise<string>[] = [];

  if (sources.reports) {
    tasks.push(Promise.resolve(buildReportContext(userReports, userShops, users)));
  }
  if (sources.kpi) {
    tasks.push(Promise.resolve(buildKPIContext(kpis, userShops, userReports)));
  }
  if (sources.inventory) {
    tasks.push(buildInventoryContext());
  }
  if (sources.cskh) {
    tasks.push(buildCskhContext(shopIds, userShops));
  }
  if (sources.pnl && user.role === 'admin') {
    tasks.push(buildPnlContext(userReports, userShops));
  }
  if (sources.employee && user.role === 'admin') {
    tasks.push(Promise.resolve(buildEmployeeContext(userReports, shops, users, kpis)));
  }
  if (sources.sku) {
    tasks.push(buildSkuContext(shopIds, userShops));
  }
  if (sources.checklist) {
    tasks.push(buildChecklistContext(userId));
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

  var parts: string[] = [];
  parts.push('Shops: ' + userShops.map(function(s) { return s.name + ' (' + s.channel + ' ' + s.region + ')'; }).join(', '));
  parts.push('Hom nay: ' + new Date().toISOString().slice(0, 10));

  parts.push(buildReportContext(userReports, userShops, users));
  parts.push(buildKPIContext(kpis, userShops, userReports));

  var [invCtx, cskhCtx, empCtx] = await Promise.all([
    buildInventoryContext(),
    buildCskhContext(shopIds, userShops),
    user.role === 'admin' ? Promise.resolve(buildEmployeeContext(userReports, shops, users, kpis)) : Promise.resolve(''),
  ]);

  if (invCtx) parts.push(invCtx);
  if (cskhCtx) parts.push(cskhCtx);
  if (empCtx) parts.push(empCtx);

  return { context: parts.join('\n'), role: user.role };
}
