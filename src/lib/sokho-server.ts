// Lưu sổ kho thực tế ở phía máy chủ (chỉ dùng trong route /api/sokho): sku-data/sokho/data.json
import { readJson, writeJson } from './storage-server';
import { skEmptyData } from './sokho';
import type { SkData } from './sokho';

const PATH = 'sokho/data.json';

export async function skGet(): Promise<SkData> {
  const j = await readJson<Partial<SkData>>(PATH);
  const e = skEmptyData();
  if (!j) return e;
  return { khoUsers: j.khoUsers || e.khoUsers, anchors: j.anchors || [], moves: j.moves || [] };
}

// Đọc bản mới nhất -> áp thay đổi -> ghi lại, để không đè thay đổi của người khác vừa lưu
export async function skMutate(fn: (d: SkData) => SkData): Promise<SkData> {
  const next = fn(await skGet());
  await writeJson(PATH, next);
  return next;
}
