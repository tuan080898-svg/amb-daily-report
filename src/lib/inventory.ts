import { getAllProducts } from './sku';

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
}

export interface InventoryData {
  products: Record<string, InventoryConfig>;
  transactions: InventoryTransaction[];
}

const STORAGE_KEY = 'amb_inventory';

export function loadInventory(): InventoryData {
  if (typeof window === 'undefined') return { products: {}, transactions: [] };
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as InventoryData;
  } catch (_) {}
  return { products: {}, transactions: [] };
}

export function saveInventory(data: InventoryData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getCurrentStock(data: InventoryData, product: string): number {
  var config = data.products[product];
  var initial = config ? config.initialStock : 0;
  var txTotal = data.transactions
    .filter(function(t) { return t.product === product; })
    .reduce(function(sum, t) { return sum + t.quantity; }, 0);
  return initial + txTotal;
}

export function getStockStatus(current: number, threshold: number): 'ok' | 'low' | 'out' {
  if (current <= 0) return 'out';
  if (current <= threshold) return 'low';
  return 'ok';
}

export function addStockImport(data: InventoryData, product: string, quantity: number, note: string): InventoryData {
  var tx: InventoryTransaction = {
    id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    date: new Date().toISOString().slice(0, 10),
    product: product,
    quantity: quantity,
    type: 'import',
    note: note,
  };
  var updated = {
    products: Object.assign({}, data.products),
    transactions: data.transactions.concat([tx]),
  };
  saveInventory(updated);
  return updated;
}

export function addSaleTransactions(data: InventoryData, sales: Array<{ product: string; quantity: number }>, date: string, shopName: string): InventoryData {
  var newTxs = sales
    .filter(function(s) { return s.quantity > 0 && data.products[s.product]; })
    .map(function(s) {
      return {
        id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        date: date,
        product: s.product,
        quantity: -s.quantity,
        type: 'sale' as const,
        note: shopName,
      };
    });
  if (newTxs.length === 0) return data;
  var updated = {
    products: Object.assign({}, data.products),
    transactions: data.transactions.concat(newTxs),
  };
  saveInventory(updated);
  return updated;
}

export function getTrackedProducts(): string[] {
  return getAllProducts();
}

export function getProductTransactions(data: InventoryData, product: string): InventoryTransaction[] {
  return data.transactions
    .filter(function(t) { return t.product === product; })
    .sort(function(a, b) { return b.date.localeCompare(a.date) || b.id.localeCompare(a.id); });
}

export function getLowStockProducts(data: InventoryData): Array<{ product: string; current: number; threshold: number; status: 'low' | 'out' }> {
  var results: Array<{ product: string; current: number; threshold: number; status: 'low' | 'out' }> = [];
  Object.entries(data.products).forEach(function(entry) {
    var product = entry[0];
    var config = entry[1];
    if (config.initialStock <= 0) return;
    var current = getCurrentStock(data, product);
    var status = getStockStatus(current, config.alertThreshold);
    if (status === 'low' || status === 'out') {
      results.push({ product: product, current: current, threshold: config.alertThreshold, status: status });
    }
  });
  return results.sort(function(a, b) {
    if (a.status === 'out' && b.status !== 'out') return -1;
    if (a.status !== 'out' && b.status === 'out') return 1;
    return a.current - b.current;
  });
}
