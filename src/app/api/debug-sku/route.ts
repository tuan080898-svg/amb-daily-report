import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  if (!supabase) return NextResponse.json({ error: 'no supabase' });
  const { data, error } = await supabase.storage.from('sku-data').download('imports.json');
  if (error) return NextResponse.json({ error: error.message });
  if (!data) return NextResponse.json({ error: 'no data' });
  const text = await data.text();
  const arr = JSON.parse(text);
  const summary = arr.map((imp: { shopId: string; shopName: string; dateFrom: string; dateTo: string; dailySku: Record<string, string[]> }) => ({
    shopId: imp.shopId,
    shopName: imp.shopName,
    dateFrom: imp.dateFrom,
    dateTo: imp.dateTo,
    skuDayCount: Object.keys(imp.dailySku).length,
    sampleDays: Object.keys(imp.dailySku).slice(0, 3),
  }));
  return NextResponse.json({ total: arr.length, imports: summary });
}
