import skuData from '@/data/sku-mappings.json';

export interface SkuItem {
  product: string;
  quantity: number;
}

const SKU_MAP: Record<string, SkuItem[]> = skuData;

export function getSkuProducts(skuCode: string): SkuItem[] {
  return SKU_MAP[skuCode.trim()] || [];
}

export function isComboSku(skuCode: string): boolean {
  const items = getSkuProducts(skuCode);
  return items.length > 1;
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
  const products = new Set<string>();
  for (const items of Object.values(SKU_MAP)) {
    for (const item of items) {
      products.add(item.product);
    }
  }
  return Array.from(products).sort();
}

export function getAllSkuCodes(): string[] {
  return Object.keys(SKU_MAP).sort();
}
