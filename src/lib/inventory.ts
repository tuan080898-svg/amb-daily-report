import { getAllProducts } from './sku';
import { IS_SUPABASE_CONFIGURED } from './supabase';

export type Warehouse = 'HCM' | 'HN';
export var WAREHOUSES: Warehouse[] = ['HCM', 'HN'];
export var WAREHOUSE_LABELS: Record<Warehouse, string> = { HCM: 'Kho HCM', HN: 'Kho Hà Nội' };

export interface InventoryConfig {
  initialStock: number;
  alertThreshold: number;
  leadTimeDays: number;
}

export var DEFAULT_LEAD_TIME = 10;

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

export interface InventoryPushBatch {
  tx: InventoryTransaction[];
  txDel: string[];
  cfg: Array<{ product: string; warehouse: string; config: InventoryConfig; ifAbsent: boolean }>;
}

// ==================== Lưu trữ + đồng bộ ====================
// Nguyên tắc: dữ liệu đã nhập không bao giờ bị mất.
//  - Máy luôn giữ bản đầy đủ trong localStorage.
//  - Mỗi thay đổi được ghi vào "hàng đợi" (outbox) bền vững và gửi lên cloud từng dòng (upsert).
//  - Hàng đợi chỉ được xoá sau khi cloud xác nhận; lỗi thì tự gửi lại.
//  - Không bao giờ xoá dòng trên cloud chỉ vì máy này không có dòng đó — chỉ xoá khi có lệnh xoá rõ ràng.
//  - Khi tải trang, dữ liệu cloud được GỘP với dữ liệu máy (không ghi đè); dòng chỉ có trên máy được đẩy lên.

const STORAGE_KEY = 'amb_inventory';
const OUTBOX_KEY = 'amb_inventory_outbox';
const SYNCED_KEY = 'amb_inventory_synced';
const RETRY_MS = 15000;

interface OutboxConfig {
  product: string;
  warehouse: string;
  config: InventoryConfig;
  ifAbsent: boolean;
}

interface Outbox {
  tx: Record<string, InventoryTransaction>;
  txDel: string[];
  cfg: Record<string, OutboxConfig>;
}

interface SyncedMarker {
  tx: string[];
  cfg: string[];
}

export interface SaveOptions {
  deleteTxIds?: string[];
  configIfAbsent?: string[];
}

export function inventoryConfigKey(product: string, wh: string): string {
  return product + '|' + wh;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function readJson<T>(key: string, fallback: T): T {
  try {
    var raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch (err) {
    console.error('[Inventory] Lỗi đọc ' + key + ':', err);
  }
  return fallback;
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error('[Inventory] Lỗi ghi ' + key + ':', err);
    return false;
  }
}

function readOutbox(): Outbox {
  if (typeof window === 'undefined') return { tx: {}, txDel: [], cfg: {} };
  var ob = readJson<Partial<Outbox>>(OUTBOX_KEY, {});
  return { tx: ob.tx || {}, txDel: ob.txDel || [], cfg: ob.cfg || {} };
}

function outboxSize(ob: Outbox): number {
  return Object.keys(ob.tx).length + ob.txDel.length + Object.keys(ob.cfg).length;
}

function writeOutbox(ob: Outbox): void {
  if (!writeJson(OUTBOX_KEY, ob)) {
    alert('Lỗi lưu dữ liệu tồn kho! Bộ nhớ trình duyệt có thể đầy. Hãy xuất Excel để sao lưu.');
  }
}

function writeLocal(data: InventoryData): void {
  if (!writeJson(STORAGE_KEY, data)) {
    alert('Lỗi lưu dữ liệu tồn kho! Bộ nhớ trình duyệt có thể đầy. Hãy xuất Excel để sao lưu.');
  }
}

function markSynced(txIds: string[], cfgKeys: string[]): void {
  if (txIds.length === 0 && cfgKeys.length === 0) return;
  var m = readJson<SyncedMarker>(SYNCED_KEY, { tx: [], cfg: [] });
  var tx = new Set(m.tx || []);
  var cfg = new Set(m.cfg || []);
  txIds.forEach(function(id) { tx.add(id); });
  cfgKeys.forEach(function(k) { cfg.add(k); });
  writeJson(SYNCED_KEY, { tx: Array.from(tx), cfg: Array.from(cfg) });
}

function showSyncError(pending: number, err: unknown): void {
  var msg = err instanceof Error ? err.message : String(err);
  console.error('[Inventory] Lỗi đồng bộ Supabase:', msg);
  if (typeof window === 'undefined') return;
  var banner = document.getElementById('inv-sync-error');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'inv-sync-error';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#dc2626;color:#fff;padding:8px 16px;font-size:14px;text-align:center;cursor:pointer;';
    banner.onclick = function() { flushInventoryOutbox(); };
    document.body.appendChild(banner);
  }
  banner.textContent = '⚠ ' + pending + ' thay đổi tồn kho chưa đồng bộ lên cloud. Dữ liệu vẫn được giữ trên máy này và sẽ tự gửi lại (bấm để thử ngay).';
}

function clearSyncError(): void {
  if (typeof window === 'undefined') return;
  var banner = document.getElementById('inv-sync-error');
  if (banner) banner.remove();
}

var flushing = false;
var flushAgain = false;
var flushTimer: ReturnType<typeof setTimeout> | null = null;
var retryTimer: ReturnType<typeof setTimeout> | null = null;
var onlineHooked = false;

function hookOnline(): void {
  if (onlineHooked || typeof window === 'undefined') return;
  onlineHooked = true;
  window.addEventListener('online', function() { flushInventoryOutbox(); });
}

function scheduleFlush(): void {
  if (!IS_SUPABASE_CONFIGURED || typeof window === 'undefined') return;
  hookOnline();
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(function() { flushTimer = null; flushInventoryOutbox(); }, 200);
}

function removeSent(sent: Outbox): { txIds: string[]; cfgKeys: string[] } {
  var cur = readOutbox();
  Object.keys(sent.tx).forEach(function(id) {
    if (cur.tx[id] && sameJson(cur.tx[id], sent.tx[id])) delete cur.tx[id];
  });
  var sentDel = new Set(sent.txDel);
  cur.txDel = cur.txDel.filter(function(id) { return !sentDel.has(id); });
  Object.keys(sent.cfg).forEach(function(k) {
    if (cur.cfg[k] && sameJson(cur.cfg[k], sent.cfg[k])) delete cur.cfg[k];
  });
  writeOutbox(cur);
  return { txIds: Object.keys(sent.tx), cfgKeys: Object.keys(sent.cfg) };
}

export async function flushInventoryOutbox(): Promise<void> {
  if (!IS_SUPABASE_CONFIGURED || typeof window === 'undefined') return;
  if (flushing) { flushAgain = true; return; }
  flushing = true;
  try {
    do {
      flushAgain = false;
      var ob = readOutbox();
      if (outboxSize(ob) === 0) break;
      var mod = await import('./db');
      await mod.dbPushInventory({
        tx: Object.keys(ob.tx).map(function(id) { return ob.tx[id]; }),
        txDel: ob.txDel.slice(),
        cfg: Object.keys(ob.cfg).map(function(k) { return ob.cfg[k]; }),
      });
      var done = removeSent(ob);
      markSynced(done.txIds, done.cfgKeys);
    } while (flushAgain || outboxSize(readOutbox()) > 0);
    clearSyncError();
  } catch (err) {
    showSyncError(outboxSize(readOutbox()), err);
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(function() { retryTimer = null; flushInventoryOutbox(); }, RETRY_MS);
  } finally {
    flushing = false;
  }
}

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
      var old = val as InventoryConfig;
      products[name] = { HCM: { initialStock: old.initialStock, alertThreshold: old.alertThreshold, leadTimeDays: old.leadTimeDays || DEFAULT_LEAD_TIME } };
    } else {
      var whMap = val as Record<string, InventoryConfig>;
      products[name] = {};
      Object.entries(whMap).forEach(function(whEntry) {
        var cfg = whEntry[1];
        if (!cfg.leadTimeDays) {
          needsMigration = true;
          products[name][whEntry[0]] = { initialStock: cfg.initialStock, alertThreshold: cfg.alertThreshold, leadTimeDays: DEFAULT_LEAD_TIME };
        } else {
          products[name][whEntry[0]] = cfg;
        }
      });
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
    writeLocal(data);
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

// Lưu thay đổi: chỉ thêm/sửa các dòng khác với bản đang lưu; dòng đang có trên máy mà caller không
// truyền vào vẫn được giữ lại. Chỉ xoá khi truyền rõ trong opts.deleteTxIds. Trả về dữ liệu đã gộp.
export function saveInventory(data: InventoryData, opts?: SaveOptions): InventoryData {
  var stored = loadInventory();
  var delIds = new Set(opts && opts.deleteTxIds ? opts.deleteTxIds : []);
  var ifAbsent = new Set(opts && opts.configIfAbsent ? opts.configIfAbsent : []);
  var outbox = readOutbox();

  var storedTx: Record<string, InventoryTransaction> = {};
  stored.transactions.forEach(function(t) { storedTx[t.id] = t; });
  var txMap: Record<string, InventoryTransaction> = Object.assign({}, storedTx);
  data.transactions.forEach(function(t) {
    if (delIds.has(t.id)) return;
    var prev = storedTx[t.id];
    txMap[t.id] = t;
    if (!prev || !sameJson(prev, t)) outbox.tx[t.id] = t;
  });
  delIds.forEach(function(id) {
    delete txMap[id];
    delete outbox.tx[id];
    if (outbox.txDel.indexOf(id) < 0) outbox.txDel.push(id);
  });

  var products: Record<string, Record<string, InventoryConfig>> = JSON.parse(JSON.stringify(stored.products));
  Object.keys(data.products).forEach(function(p) {
    Object.keys(data.products[p]).forEach(function(w) {
      var c = data.products[p][w];
      var prev = products[p] && products[p][w];
      if (prev && sameJson(prev, c)) return;
      var key = inventoryConfigKey(p, w);
      if (ifAbsent.has(key) && prev) return;
      if (!products[p]) products[p] = {};
      products[p][w] = c;
      outbox.cfg[key] = { product: p, warehouse: w, config: c, ifAbsent: ifAbsent.has(key) };
    });
  });

  var merged: InventoryData = {
    products: products,
    transactions: Object.keys(txMap).map(function(id) { return txMap[id]; }),
  };
  writeLocal(merged);
  if (IS_SUPABASE_CONFIGURED) {
    writeOutbox(outbox);
    scheduleFlush();
  }
  return merged;
}

// Gộp dữ liệu cloud với dữ liệu trên máy (không ghi đè). Dòng chỉ có trên máy được đưa vào hàng đợi
// để đẩy lên cloud, trừ dòng đã từng đồng bộ rồi mà nay không còn trên cloud (đã bị xoá có chủ đích).
export function hydrateInventory(cloud: InventoryData): void {
  if (typeof window === 'undefined') return;
  var local = loadInventory();
  var outbox = readOutbox();
  var synced = readJson<SyncedMarker>(SYNCED_KEY, { tx: [], cfg: [] });
  var syncedTx = new Set(synced.tx || []);
  var pendingDel = new Set(outbox.txDel);
  var queued = false;

  var txMap: Record<string, InventoryTransaction> = {};
  var cloudTxIds: string[] = [];
  var cloudTxSet = new Set<string>();
  cloud.transactions.forEach(function(t) {
    cloudTxIds.push(t.id);
    cloudTxSet.add(t.id);
    if (!pendingDel.has(t.id)) txMap[t.id] = t;
  });
  local.transactions.forEach(function(t) {
    if (txMap[t.id] || pendingDel.has(t.id)) return;
    if (cloudTxSet.has(t.id)) return;
    if (!outbox.tx[t.id] && syncedTx.has(t.id)) return;
    txMap[t.id] = t;
    if (!outbox.tx[t.id]) { outbox.tx[t.id] = t; queued = true; }
  });
  Object.keys(outbox.tx).forEach(function(id) {
    if (!txMap[id]) txMap[id] = outbox.tx[id];
  });

  var products: Record<string, Record<string, InventoryConfig>> = {};
  var cloudCfgKeys: string[] = [];
  function put(p: string, w: string, c: InventoryConfig) {
    if (!products[p]) products[p] = {};
    products[p][w] = c;
  }
  Object.keys(cloud.products).forEach(function(p) {
    Object.keys(cloud.products[p]).forEach(function(w) {
      put(p, w, cloud.products[p][w]);
      cloudCfgKeys.push(inventoryConfigKey(p, w));
    });
  });
  Object.keys(local.products).forEach(function(p) {
    Object.keys(local.products[p]).forEach(function(w) {
      var key = inventoryConfigKey(p, w);
      var inCloud = cloudCfgKeys.indexOf(key) >= 0;
      var ob = outbox.cfg[key];
      if (ob) {
        if (!(ob.ifAbsent && inCloud)) put(p, w, ob.config);
      } else if (!inCloud) {
        var c = local.products[p][w];
        put(p, w, c);
        outbox.cfg[key] = { product: p, warehouse: w, config: c, ifAbsent: true };
        queued = true;
      }
    });
  });
  Object.keys(outbox.cfg).forEach(function(key) {
    var ob = outbox.cfg[key];
    var inCloud = cloudCfgKeys.indexOf(key) >= 0;
    if (!(ob.ifAbsent && inCloud)) put(ob.product, ob.warehouse, ob.config);
  });

  writeLocal({
    products: products,
    transactions: Object.keys(txMap).map(function(id) { return txMap[id]; }),
  });
  markSynced(cloudTxIds, cloudCfgKeys);
  if (queued) writeOutbox(outbox);
  if (outboxSize(outbox) > 0) scheduleFlush();
}

// Tải lại từ cloud (gộp, không mất dữ liệu trên máy) và trả về dữ liệu hiện hành.
export async function refreshInventory(): Promise<InventoryData> {
  if (!IS_SUPABASE_CONFIGURED || typeof window === 'undefined') return loadInventory();
  try {
    var mod = await import('./db');
    var cloud = await mod.dbGetInventory();
    hydrateInventory(cloud);
  } catch (err) {
    console.error('[Inventory] Không tải được dữ liệu từ cloud, dùng bản trên máy:', err);
    scheduleFlush();
  }
  return loadInventory();
}

export function getPendingInventoryChanges(): number {
  return outboxSize(readOutbox());
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
  return saveInventory(updated);
}

function isTrackedIn(data: InventoryData, product: string, wh: Warehouse): boolean {
  var cfg = data.products[product];
  return !!(cfg && cfg[wh] && cfg[wh].initialStock > 0);
}

// Mốc tồn: dòng giao dịch loại 'initial' (số lượng 0) ghi ngày chốt tồn đầu của sản phẩm ở kho.
// Đơn bán có ngày <= mốc đã nằm sẵn trong số tồn đã chốt nên không được trừ lại.
export function makeStockBaselineTx(product: string, wh: Warehouse, date: string, note: string): InventoryTransaction {
  return {
    id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    date: date,
    product: product,
    quantity: 0,
    type: 'initial',
    note: note,
    warehouse: wh,
  };
}

function baselineDates(data: InventoryData, wh: Warehouse): Record<string, string> {
  var out: Record<string, string> = {};
  data.transactions.forEach(function(t) {
    if (t.type === 'initial' && t.warehouse === wh && (!out[t.product] || t.date > out[t.product])) out[t.product] = t.date;
  });
  return out;
}

export interface SaleDeductionPlan {
  deduct: Array<{ product: string; quantity: number }>;
  noConfig: string[];
  beforeBaseline: string[];
}

// Phân loại các dòng bán của một ngày: trừ được / chưa cài tồn đầu / đã nằm trong số tồn chốt.
export function planSaleDeduction(data: InventoryData, sales: Array<{ product: string; quantity: number }>, date: string, wh: Warehouse): SaleDeductionPlan {
  var baselines = baselineDates(data, wh);
  var plan: SaleDeductionPlan = { deduct: [], noConfig: [], beforeBaseline: [] };
  sales.forEach(function(s) {
    if (s.quantity <= 0) return;
    if (!isTrackedIn(data, s.product, wh)) plan.noConfig.push(s.product);
    else if (baselines[s.product] && date <= baselines[s.product]) plan.beforeBaseline.push(s.product);
    else plan.deduct.push(s);
  });
  return plan;
}

export function addSaleTransactions(data: InventoryData, sales: Array<{ product: string; quantity: number }>, date: string, shopName: string, wh: Warehouse): InventoryData {
  var newTxs = planSaleDeduction(data, sales, date, wh).deduct
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
  function isSameDaySale(t: InventoryTransaction): boolean {
    return t.type === 'sale' && t.date === date && t.note === shopName && t.warehouse === wh;
  }
  var removeIds: string[] = [];
  var seen = new Set<string>();
  data.transactions.concat(loadInventory().transactions).forEach(function(t) {
    if (isSameDaySale(t) && !seen.has(t.id)) { seen.add(t.id); removeIds.push(t.id); }
  });
  var updated = {
    products: JSON.parse(JSON.stringify(data.products)),
    transactions: data.transactions.filter(function(t) { return !isSameDaySale(t); }).concat(newTxs),
  };
  return saveInventory(updated, { deleteTxIds: removeIds });
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
  reorderPoint: number;
  suggestedOrder: number;
  leadTimeDays: number;
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

export function getReorderAlerts(data: InventoryData, wh?: Warehouse): ReorderAlert[] {
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

      var cfg = getWarehouseConfig(data, product, w);
      var lead = cfg && cfg.leadTimeDays > 0 ? cfg.leadTimeDays : DEFAULT_LEAD_TIME;
      var safetyBuffer = Math.ceil(daily * 3);
      var rop = Math.ceil(daily * lead) + safetyBuffer;
      var daysLeft = daily > 0 ? current / daily : 9999;
      var suggestedOrder = Math.max(0, Math.ceil(daily * lead * 2 - current));

      var urgency: 'critical' | 'warning' | 'ok' = 'ok';
      if (current <= rop * 0.5) urgency = 'critical';
      else if (current <= rop) urgency = 'warning';

      if (urgency !== 'ok' || (daily > 0 && daysLeft < 9999)) {
        results.push({ product: product, warehouse: w, currentStock: current, dailySales: daily, daysRemaining: Math.round(daysLeft), reorderPoint: rop, suggestedOrder: suggestedOrder, leadTimeDays: lead, urgency: urgency });
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
