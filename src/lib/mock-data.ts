import { Shop, User, DailyReport, MonthlyKPI, MonthlyPlan } from './types';
import { getDailyTarget, getDayType, getDaysInMonth } from './utils';

export const MOCK_SHOPS: Shop[] = [
  // Shopee - HCM
  { id: 'sp1', name: 'Green Home', channel: 'Shopee', region: 'HCM', assignedTo: ['uyen'], defaultMonthlyTarget: 300000000 },
  { id: 'sp2', name: 'Ecohome AMB', channel: 'Shopee', region: 'HCM', assignedTo: ['thuhoai'], defaultMonthlyTarget: 250000000 },
  { id: 'sp3', name: 'Hana Mart', channel: 'Shopee', region: 'HCM', assignedTo: ['tuananh'], defaultMonthlyTarget: 200000000 },
  { id: 'sp6', name: 'AMBBIO HOME', channel: 'Shopee', region: 'HCM', assignedTo: ['uyen'], defaultMonthlyTarget: 280000000 },
  { id: 'sp8', name: 'Glory Smile', channel: 'Shopee', region: 'HCM', assignedTo: ['uyen'], defaultMonthlyTarget: 180000000 },
  { id: 'sp10', name: 'AMB MALL HCM', channel: 'Shopee', region: 'HCM', assignedTo: ['thuhoai'], defaultMonthlyTarget: 350000000 },
  { id: 'sp11', name: 'AMBI HOME', channel: 'Shopee', region: 'HCM', assignedTo: ['thuhoai'], defaultMonthlyTarget: 220000000 },
  // Shopee - HN
  { id: 'sp4', name: 'Công nghệ Xanh', channel: 'Shopee', region: 'HN', assignedTo: ['van'], defaultMonthlyTarget: 260000000 },
  { id: 'sp5', name: 'Gia dụng xanh', channel: 'Shopee', region: 'HN', assignedTo: ['truong'], defaultMonthlyTarget: 310000000 },
  { id: 'sp7', name: 'Tiện ích xanh', channel: 'Shopee', region: 'HN', assignedTo: ['van'], defaultMonthlyTarget: 190000000 },
  { id: 'sp9', name: 'AMB MALL HN', channel: 'Shopee', region: 'HN', assignedTo: ['hailinh'], defaultMonthlyTarget: 320000000 },
  // TikTok
  { id: 'tt1', name: 'Đồ gia dụng Hana', channel: 'TikTok', region: 'HN', assignedTo: ['minh'], defaultMonthlyTarget: 400000000 },
  { id: 'tt2', name: 'Công nghệ xanh AMB', channel: 'TikTok', region: 'HN', assignedTo: ['ngat'], defaultMonthlyTarget: 350000000 },
  { id: 'tt3', name: 'AMB Việt Nam', channel: 'TikTok', region: 'HCM', assignedTo: ['ngat'], defaultMonthlyTarget: 280000000 },
];

export const MOCK_USERS: User[] = [
  { id: 'admin', email: 'admin@amb.com.vn', name: 'Phạm Cao Tuấn', role: 'admin', assignedShops: MOCK_SHOPS.map(s => s.id) },
  { id: 'uyen', email: 'uyen@amb.com.vn', name: 'Uyên', role: 'employee', assignedShops: ['sp1', 'sp6', 'sp8'] },
  { id: 'thuhoai', email: 'thuhoai@amb.com.vn', name: 'Thu Hoài', role: 'employee', assignedShops: ['sp2', 'sp10', 'sp11'] },
  { id: 'tuananh', email: 'tuananh@amb.com.vn', name: 'Tuấn Anh', role: 'employee', assignedShops: ['sp3'] },
  { id: 'van', email: 'van@amb.com.vn', name: 'Vân', role: 'employee', assignedShops: ['sp4', 'sp7'] },
  { id: 'truong', email: 'truong@amb.com.vn', name: 'Trường', role: 'employee', assignedShops: ['sp5'] },
  { id: 'hailinh', email: 'hailinh@amb.com.vn', name: 'Hải Linh', role: 'employee', assignedShops: ['sp9'] },
  { id: 'minh', email: 'minh@amb.com.vn', name: 'Minh', role: 'employee', assignedShops: ['tt1'] },
  { id: 'ngat', email: 'ngat@amb.com.vn', name: 'Ngát', role: 'employee', assignedShops: ['tt2', 'tt3'] },
];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function generateDailyReports(): DailyReport[] {
  const reports: DailyReport[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const rand = seededRandom(42);

  for (let offset = 5; offset >= 0; offset--) {
    const d = new Date(currentYear, currentMonth - 1 - offset, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const maxDay = offset === 0 ? now.getDate() : getDaysInMonth(year, month);

    for (let day = 1; day <= maxDay; day++) {
      for (const shop of MOCK_SHOPS) {
        const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const base = getDailyTarget(shop.defaultMonthlyTarget, year, month);
        const dt = getDayType(date);
        const dailyTarget = dt === 'sale_double' ? Math.round(base * 3) : dt === 'sale_fixed' ? Math.round(base * 2) : base;
        const variance = 0.6 + rand() * 0.6;
        const actualRevenue = Math.round(dailyTarget * variance);
        const adSpend = Math.round(actualRevenue * (0.10 + rand() * 0.15));
        const totalOrders = Math.round(50 + rand() * 150);
        const cancelledOrders = Math.round(totalOrders * rand() * 0.08);
        const returnedOrders = Math.round(totalOrders * rand() * 0.05);

        reports.push({
          id: `r-${shop.id}-${date}`,
          date,
          shopId: shop.id,
          targetRevenue: dailyTarget,
          actualRevenue,
          adSpend,
          totalOrders,
          cancelledOrders,
          returnedOrders,
          note: '',
          createdBy: shop.assignedTo[0],
          createdAt: new Date(year, month - 1, day, 9, 0).toISOString(),
        });
      }
    }
  }
  return reports;
}

export const MOCK_REPORTS: DailyReport[] = generateDailyReports();

export const MOCK_KPIS: MonthlyKPI[] = MOCK_SHOPS.map(shop => {
  const now = new Date();
  return {
    shopId: shop.id,
    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    kpiAmount: shop.defaultMonthlyTarget,
  };
});

export const MOCK_PLANS: MonthlyPlan[] = MOCK_SHOPS.map(shop => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const base = getDailyTarget(shop.defaultMonthlyTarget, year, month);
  return {
    shopId: shop.id,
    month: `${year}-${String(month).padStart(2, '0')}`,
    regularDayTarget: base,
    saleDoubleDayTarget: Math.round(base * 3),
    saleFixedDayTarget: Math.round(base * 2),
    totalMktBudget: Math.round(shop.defaultMonthlyTarget * 0.18),
    regularDayMkt: Math.round(base * 0.15),
    saleDayMkt: Math.round(base * 0.25),
    dailyOverrides: {},
  };
});
