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
    if (raw) return migrateData(JSON.parse(raw));
  } catch (_) {}
  return { products: {}, transactions: [] };
}

export function saveInventory(data: InventoryData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
      return s.quantity > 0 && data.products[s.product] && data.products[s.product][wh];
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
  var updated = {
    products: JSON.parse(JSON.stringify(data.products)),
    transactions: data.transactions.concat(newTxs),
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
