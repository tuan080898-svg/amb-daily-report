import defaultSkuData from '@/data/sku-mappings.json';

export interface SkuItem {
  product: string;
  quantity: number;
}

export type SkuMap = Record<string, SkuItem[]>;

const STORAGE_KEY = 'amb_sku_mappings';

let cachedMap: SkuMap | null = null;

function loadSkuMap(): SkuMap {
  if (cachedMap) return cachedMap;
  if (typeof window === 'undefined') return defaultSkuData as SkuMap;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      cachedMap = JSON.parse(raw) as SkuMap;
      return cachedMap;
    }
  } catch (_) {}
  cachedMap = defaultSkuData as SkuMap;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedMap));
  return cachedMap;
}

export function getSkuMap(): SkuMap {
  return loadSkuMap();
}

export function saveSkuMap(map: SkuMap): void {
  cachedMap = map;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
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
