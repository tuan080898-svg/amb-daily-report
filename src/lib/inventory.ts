import { getAllProducts } from './sku';

export type Warehouse = 'HCM' | 'HN';
export var WAREHOUSES: Warehouse[] = ['HCM', 'HN'];
export var WAREHOUSE_LABELS: Record<Warehouse, string> = { HCM: 'Kho HCM', HN: 'Kho Hà Nội' };

export interface InventoryConfig {
  initialStock: number;
  alertThreshold: number;
}

export interface InventoryTransaction {
  id: string;
  date: string;
  product: string;
  quantity: number;
  type: 'initial' | 'import' | 'sale' | 'adjust';
  note: string;
  warehouse?: Warehouse;
}

export interface InventoryData {
  products: Record<string, Record<string, InventoryConfig>>;
  transactions: InventoryTransaction[];
}

const STORAGE_KEY = 'amb_inventory';

interface OldInventoryData {
  products: Record<string, InventoryConfig | Record<string, InventoryConfig>>;
  transactions: InventoryTransaction[];
}

function migrateData(raw: OldInventoryData): InventoryData {
  var products: Record<string, Record<string, InventoryConfig>> = {};
  var needsMigration = false;

  Object.entries(raw.products).forEach(function(entry) {
    var name = entry[0];
    var val = entry[1] as InventoryConfig | Record<string, InventoryConfig>;
    if (typeof (val as InventoryConfig).initialStock === 'number') {
      needsMigration = true;
      products[name] = { HCM: val as InventoryConfig };
    } else {
      products[name] = val as Record<string, InventoryConfig>;
    }
  });

  var transactions = raw.transactions.map(function(tx) {
    if (!tx.warehouse) {
      needsMigration = true;
      return Object.assign({}, tx, { warehouse: 'HCM' as Warehouse });
    }
    return tx;
  });

  var data = { products: products, transactions: transactions };
  if (needsMigration) {
    saveInventory(data);
  }
  return data;
}

export function loadInventory(): InventoryData {
  if (typeof window === 'undefined') return { products: {}, transactions: [] };
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.transactions) {
        console.error('[Inventory] Dữ liệu localStorage bị hỏng, reset');
        return { products: {}, transactions: [] };
      }
      return migrateData(parsed);
    }
  } catch (err) {
    console.error('[Inventory] Lỗi đọc dữ liệu tồn kho:', err);
  }
  return { products: {}, transactions: [] };
}

export function saveInventory(data: InventoryData): void {
  try {
    var json = JSON.stringify(data);
    localStorage.setItem(STORAGE_KEY, json);
  } catch (err) {
    console.error('[Inventory] Lỗi lưu dữ liệu tồn kho:', err);
    alert('Lỗi lưu dữ liệu tồn kho! Bộ nhớ trình duyệt có thể đầy. Hãy xuất Excel để sao lưu.');
  }
}

export function getWarehouseConfig(data: InventoryData, product: string, wh: Warehouse): InventoryConfig | null {
  var p = data.products[product];
  if (!p || !p[wh]) return null;
  return p[wh];
}

export function getCurrentStock(data: InventoryData, product: string, wh?: Warehouse): number {
  if (wh) {
    var config = getWarehouseConfig(data, product, wh);
    var initial = config ? config.initialStock : 0;
    var txTotal = data.transactions
      .filter(function(t) { return t.product === product && t.warehouse === wh; })
      .reduce(function(sum, t) { return sum + t.quantity; }, 0);
    return initial + txTotal;
  }
  var totalStock = 0;
  WAREHOUSES.forEach(function(w) {
    totalStock += getCurrentStock(data, product, w);
  });
  return totalStock;
}

export function getStockStatus(current: number, threshold: number): 'ok' | 'low' | 'out' {
  if (current <= 0) return 'out';
  if (current <= threshold) return 'low';
  return 'ok';
}

export function isProductTracked(data: InventoryData, product: string): boolean {
  var p = data.products[product];
  if (p && WAREHOUSES.some(function(wh) { return p[wh] && p[wh].initialStock > 0; })) {
    return true;
  }
  return data.transactions.some(function(t) { return t.product === product; });
}

export function addStockImport(data: InventoryData, product: string, quantity: number, note: string, wh: Warehouse): InventoryData {
  var tx: InventoryTransaction = {
    id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    date: new Date().toISOString().slice(0, 10),
    product: product,
    quantity: quantity,
    type: 'import',
    note: note,
    warehouse: wh,
  };
  var updated = {
    products: JSON.parse(JSON.stringify(data.products)),
    transactions: data.transactions.concat([tx]),
  };
  saveInventory(updated);
  return updated;
}

export function addSaleTransactions(data: InventoryData, sales: Array<{ product: string; quantity: number }>, date: string, shopName: string, wh: Warehouse): InventoryData {
  var newTxs = sales
    .filter(function(s) {
      return s.quantity > 0;
    })
    .map(function(s) {
      return {
        id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        date: date,
        product: s.product,
        quantity: -s.quantity,
        type: 'sale' as const,
        note: shopName,
        warehouse: wh,
      };
    });
  if (newTxs.length === 0) return data;
  var cleaned = data.transactions.filter(function(t) {
    return !(t.type === 'sale' && t.date === date && t.note === shopName && t.warehouse === wh);
  });
  var updated = {
    products: JSON.parse(JSON.stringify(data.products)),
    transactions: cleaned.concat(newTxs),
  };
  saveInventory(updated);
  return updated;
}

export function getTrackedProducts(): string[] {
  return getAllProducts();
}

export function getProductTransactions(data: InventoryData, product: string, wh?: Warehouse): InventoryTransaction[] {
  return data.transactions
    .filter(function(t) {
      if (t.product !== product) return false;
      if (wh) return t.warehouse === wh;
      return true;
    })
    .sort(function(a, b) { return b.date.localeCompare(a.date) || b.id.localeCompare(a.id); });
}

export interface ReorderAlert {
  product: string;
  warehouse: Warehouse;
  currentStock: number;
  dailySales: number;
  daysRemaining: number;
  suggestedOrder: number;
  urgency: 'critical' | 'warning' | 'ok';
}

export function getSalesVelocity(data: InventoryData, product: string, wh: Warehouse, days: number): number {
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  var cutoffStr = cutoff.toISOString().slice(0, 10);
  var todayStr = new Date().toISOString().slice(0, 10);
  var totalSold = 0;
  var earliestDate = '';
  data.transactions.forEach(function(t) {
    if (t.product === product && t.warehouse === wh && t.type === 'sale' && t.date >= cutoffStr) {
      totalSold += Math.abs(t.quantity);
      if (!earliestDate || t.date < earliestDate) earliestDate = t.date;
    }
  });
  if (totalSold === 0) return 0;
  var actualDays = Math.max(1, Math.round((new Date(todayStr).getTime() - new Date(earliestDate).getTime()) / 86400000) + 1);
  return totalSold / Math.min(days, actualDays);
}

export function getReorderAlerts(data: InventoryData, wh?: Warehouse, leadTimeDays?: number, coverageDays?: number): ReorderAlert[] {
  var lead = leadTimeDays || 30;
  var coverage = coverageDays || 30;
  var warehouses = wh ? [wh] : WAREHOUSES;
  var results: ReorderAlert[] = [];
  var seen = new Set<string>();

  warehouses.forEach(function(w) {
    var products = new Set<string>();
    Object.entries(data.products).forEach(function(entry) {
      if (entry[1][w] && entry[1][w].initialStock > 0) products.add(entry[0]);
    });
    data.transactions.forEach(function(t) {
      if (t.warehouse === w) products.add(t.product);
    });

    products.forEach(function(product) {
      var key = product + '|' + w;
      if (seen.has(key)) return;
      seen.add(key);
      var current = getCurrentStock(data, product, w);
      var daily = getSalesVelocity(data, product, w, 30);
      if (daily <= 0 && current <= 0) return;
      var daysLeft = daily > 0 ? current / daily : 9999;
      var suggestedOrder = Math.max(0, Math.ceil(daily * coverage - Math.max(0, current - daily * lead)));
      var urgency: 'critical' | 'warning' | 'ok' = 'ok';
      if (daysLeft <= lead) urgency = 'critical';
      else if (daysLeft <= lead + 15) urgency = 'warning';

      if (urgency !== 'ok' || (daily > 0 && daysLeft < 9999)) {
        results.push({ product: product, warehouse: w, currentStock: current, dailySales: daily, daysRemaining: Math.round(daysLeft), suggestedOrder: suggestedOrder, urgency: urgency });
      }
    });
  });

  return results.sort(function(a, b) {
    if (a.urgency === 'critical' && b.urgency !== 'critical') return -1;
    if (a.urgency !== 'critical' && b.urgency === 'critical') return 1;
    if (a.urgency === 'warning' && b.urgency === 'ok') return -1;
    if (a.urgency === 'ok' && b.urgency === 'warning') return 1;
    return a.daysRemaining - b.daysRemaining;
  });
}

export function getLowStockProducts(data: InventoryData, wh?: Warehouse): Array<{ product: string; current: number; threshold: number; status: 'low' | 'out'; warehouse: Warehouse }> {
  var results: Array<{ product: string; current: number; threshold: number; status: 'low' | 'out'; warehouse: Warehouse }> = [];
  var warehouses = wh ? [wh] : WAREHOUSES;

  Object.entries(data.products).forEach(function(entry) {
    var product = entry[0];
    var whConfigs = entry[1];
    warehouses.forEach(function(w) {
      var config = whConfigs[w];
      if (!config || config.initialStock <= 0) return;
      var current = getCurrentStock(data, product, w);
      var status = getStockStatus(current, config.alertThreshold);
      if (status === 'low' || status === 'out') {
        results.push({ product: product, current: current, threshold: config.alertThreshold, status: status, warehouse: w });
      }
    });
  });

  return results.sort(function(a, b) {
    if (a.status === 'out' && b.status !== 'out') return -1;
    if (a.status !== 'out' && b.status === 'out') return 1;
    return a.current - b.current;
  });
}
