import defaultSkuData from '@/data/sku-mappings.json';
import { IS_SUPABASE_CONFIGURED } from './supabase';

export interface SkuItem {
  product: string;
  quantity: number;
}

export type SkuMap = Record<string, SkuItem[]>;

const STORAGE_KEY = 'amb_sku_mappings';
const PENDING_KEY = 'amb_sku_pending';

let cachedMap: SkuMap | null = null;

const skuListeners = new Set<() => void>();

// Cho các trang đăng ký để tự vẽ lại khi bảng quy đổi SKU từ cloud về tới
export function subscribeSkuMap(cb: () => void): () => void {
  skuListeners.add(cb);
  return function() { skuListeners.delete(cb); };
}

function notifySkuMap(): void {
  skuListeners.forEach(function(cb) { try { cb(); } catch (err) { console.error('[SKU] listener error:', err); } });
}
let supabaseSynced = false;

function loadSkuMap(): SkuMap {
  if (cachedMap) return cachedMap;
  if (typeof window === 'undefined') return defaultSkuData as SkuMap;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      cachedMap = JSON.parse(raw) as SkuMap;
      return cachedMap;
    }
  } catch (err) {
    console.error('[SKU] Lỗi đọc SKU từ localStorage:', err);
  }
  cachedMap = defaultSkuData as SkuMap;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedMap));
  return cachedMap;
}

// Thay đổi chưa gửi lên cloud được giữ bền vững; mỗi lần gửi là "đọc bản cloud -> áp đúng các thay đổi
// của máy này -> ghi lại", nên không ghi đè mã SKU do máy khác thêm, và lỗi mạng không làm mất thay đổi.
interface SkuPending {
  set: SkuMap;
  del: string[];
}

function readPending(): SkuPending {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<SkuPending>;
      return { set: p.set || {}, del: p.del || [] };
    }
  } catch (err) {
    console.error('[SKU] Lỗi đọc thay đổi chờ gửi:', err);
  }
  return { set: {}, del: [] };
}

function writePending(p: SkuPending): void {
  try {
    if (Object.keys(p.set).length === 0 && p.del.length === 0) localStorage.removeItem(PENDING_KEY);
    else localStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch (err) {
    console.error('[SKU] Lỗi ghi thay đổi chờ gửi:', err);
  }
}

function applyPending(base: SkuMap, p: SkuPending): SkuMap {
  const out: SkuMap = Object.assign({}, base);
  Object.keys(p.set).forEach(function(code) { out[code] = p.set[code]; });
  p.del.forEach(function(code) { delete out[code]; });
  return out;
}

let skuFlushing = false;
let skuFlushAgain = false;
let skuRetryTimer: ReturnType<typeof setTimeout> | null = null;

async function flushSkuPending(): Promise<void> {
  if (!IS_SUPABASE_CONFIGURED || typeof window === 'undefined') return;
  if (skuFlushing) { skuFlushAgain = true; return; }
  skuFlushing = true;
  try {
    do {
      skuFlushAgain = false;
      const sent = readPending();
      if (Object.keys(sent.set).length === 0 && sent.del.length === 0) break;
      const db = await import('./db');
      const remote = await db.dbGetSkuMappingsStrict();
      const base: SkuMap = remote ? (remote as SkuMap) : loadSkuMap();
      const merged = applyPending(base, sent);
      await db.dbSaveSkuMappings(merged);

      const cur = readPending();
      Object.keys(sent.set).forEach(function(code) {
        if (cur.set[code] && JSON.stringify(cur.set[code]) === JSON.stringify(sent.set[code])) delete cur.set[code];
      });
      const sentDel = new Set(sent.del);
      cur.del = cur.del.filter(function(c) { return !sentDel.has(c); });
      writePending(cur);

      cachedMap = applyPending(merged, cur);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedMap));
      notifySkuMap();
    } while (skuFlushAgain);
  } catch (err) {
    console.error('[SKU] Supabase save error (sẽ tự gửi lại):', err);
    if (skuRetryTimer) clearTimeout(skuRetryTimer);
    skuRetryTimer = setTimeout(function() { skuRetryTimer = null; flushSkuPending(); }, 15000);
  } finally {
    skuFlushing = false;
  }
}

export async function initSkuMapFromSupabase(): Promise<void> {
  if (!IS_SUPABASE_CONFIGURED || supabaseSynced) return;
  supabaseSynced = true;
  try {
    const { dbGetSkuMappingsStrict, dbSaveSkuMappings } = await import('./db');
    const remote = await dbGetSkuMappingsStrict();
    if (remote && Object.keys(remote).length > 0) {
      cachedMap = applyPending(remote as SkuMap, readPending());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedMap));
      notifySkuMap();
    } else {
      const local = loadSkuMap();
      if (Object.keys(local).length > 0) {
        await dbSaveSkuMappings(local);
      }
    }
  } catch (err) {
    console.error('[SKU] Supabase sync error:', err);
  }
  flushSkuPending();
}

export function getSkuMap(): SkuMap {
  return loadSkuMap();
}

export function saveSkuMap(map: SkuMap): void {
  const prev = loadSkuMap();
  const pending = readPending();
  Object.keys(map).forEach(function(code) {
    if (JSON.stringify(prev[code]) !== JSON.stringify(map[code])) {
      pending.set[code] = map[code];
      pending.del = pending.del.filter(function(c) { return c !== code; });
    }
  });
  Object.keys(prev).forEach(function(code) {
    if (!(code in map)) {
      delete pending.set[code];
      if (pending.del.indexOf(code) < 0) pending.del.push(code);
    }
  });
  cachedMap = map;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  if (IS_SUPABASE_CONFIGURED) {
    writePending(pending);
    flushSkuPending();
  }
}

export function invalidateCache(): void {
  cachedMap = null;
}

export function getSkuProducts(skuCode: string): SkuItem[] {
  return loadSkuMap()[skuCode.trim()] || [];
}

export function isComboSku(skuCode: string): boolean {
  const items = getSkuProducts(skuCode);
  return items.length > 1;
}

export function getAllComboSkus(): Array<{ code: string; items: SkuItem[] }> {
  const skuMap = loadSkuMap();
  const combos: Array<{ code: string; items: SkuItem[] }> = [];
  for (const [code, items] of Object.entries(skuMap)) {
    if (items.length > 1) {
      combos.push({ code, items });
    }
  }
  return combos.sort(function(a, b) { return a.code.localeCompare(b.code); });
}

export interface ProductSummary {
  product: string;
  totalQuantity: number;
  orderCount: number;
}

export function aggregateProducts(skuCodes: string[]): ProductSummary[] {
  const map: Record<string, { qty: number; orders: number }> = {};

  for (const code of skuCodes) {
    const items = getSkuProducts(code);
    if (items.length === 0) continue;
    for (const item of items) {
      if (!map[item.product]) {
        map[item.product] = { qty: 0, orders: 0 };
      }
      map[item.product].qty += item.quantity;
      map[item.product].orders += 1;
    }
  }

  return Object.entries(map)
    .map(([product, { qty, orders }]) => ({
      product,
      totalQuantity: qty,
      orderCount: orders,
    }))
    .sort((a, b) => b.totalQuantity - a.totalQuantity);
}

export function getAllProducts(): string[] {
  const skuMap = loadSkuMap();
  const products = new Set<string>();
  for (const items of Object.values(skuMap)) {
    for (const item of items) {
      products.add(item.product);
    }
  }
  return Array.from(products).sort();
}

export function getAllSkuCodes(): string[] {
  return Object.keys(loadSkuMap()).sort();
}

export function getProductSkuCodes(): Record<string, string[]> {
  const skuMap = loadSkuMap();
  const result: Record<string, string[]> = {};
  for (const [code, items] of Object.entries(skuMap)) {
    for (const item of items) {
      if (!result[item.product]) result[item.product] = [];
      if (!result[item.product].includes(code)) result[item.product].push(code);
    }
  }
  return result;
}
