import { dbUpdatePxk } from './db';
import { extractShopeePairs, mergeLearnedPairs, type PxkData, type PxkLearnedPairs } from './pxk';

export interface PxkLearnResult {
  lines: number; // số dòng đơn có đủ tên + SKU
  keys: number; // số cặp (tên + phân loại) khác nhau
  added: number; // số cặp mới được gắn SKU
  ambiguous: number; // số cặp có nhiều SKU (cần nhân sự chọn)
  data: PxkData;
}

// Học quy luật tên Shopee -> SKU từ các dòng của file đơn hàng và lưu lên cloud.
export async function learnShopeeFromRowSets(rowSets: Array<Array<Record<string, unknown>>>): Promise<PxkLearnResult> {
  var pairs: PxkLearnedPairs = {};
  var lines = 0;
  rowSets.forEach(function(rows) { lines += extractShopeePairs(rows, pairs).lines; });
  var keys = Object.keys(pairs).length;
  if (keys === 0) {
    return { lines: lines, keys: 0, added: 0, ambiguous: 0, data: { names: {}, batches: [] } };
  }
  var added = 0;
  var ambiguous = 0;
  var data = await dbUpdatePxk(function(cur) {
    var res = mergeLearnedPairs(cur, pairs);
    added = res.added;
    ambiguous = res.ambiguous;
    return res.data;
  });
  return { lines: lines, keys: keys, added: added, ambiguous: ambiguous, data: data };
}
