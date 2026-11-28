// Gửi tin Lark sau mỗi việc: tin loan báo vào nhóm, thẻ riêng cho đúng người. Chỉ chạy trên máy chủ.
import { igItemsOf, igMutate, igSendLark, igWithLark } from './integrity-server';
import { igAppReady, igSendCard } from './integrity-lark-app';
import { igCard, type IgView } from './integrity-card';
import { igDay, igLastReport, igNeedsRestore, igNewsText, igState } from './integrity';
import type { IgCommit, IgUser } from './integrity';
import type { IgEvent } from './integrity-actions';

const DIGEST_MAX = 5; // số thẻ tối đa mỗi người trong đợt nhắc buổi sáng

export function igLink(origin: string): string {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return (host ? 'https://' + host : origin) + '/integrity';
}

async function find(ownerId: string, id: string): Promise<IgCommit | undefined> {
  return (await igItemsOf(ownerId)).find(function(c) { return c.id === id; });
}

// Tin loan báo (bước 1) vào nhóm. Gửi lỗi thì trả lời nhắc cho người dùng, việc đã ghi vẫn giữ.
export async function igNotifyGroup(events: IgEvent[], users: IgUser[], link: string): Promise<string> {
  for (const e of events) {
    if (e.type !== 'restore1') continue;
    try {
      const c = (await find(e.ownerId, e.id))!;
      await igSendLark(igNewsText(c, await igWithLark(users), link));
      await igMutate(e.ownerId, function(list) {
        list.forEach(function(x) { if (x.id === e.id && x.restore.step1) x.restore.step1.larkSent = true; });
        return list;
      });
    } catch (err) {
      return 'Đã ghi bước 1 nhưng chưa gửi được tin Lark (' + (err instanceof Error ? err.message : 'lỗi') + '). Hãy nhắn trực tiếp cho người liên quan.';
    }
  }
  return '';
}

interface Delivery { to: string; c: IgCommit; view: IgView }

// Gửi lần lượt; một người lỗi (chưa có mã, ngoài phạm vi ứng dụng) không chặn người khác
async function deliver(list: Delivery[], users: IgUser[], link: string): Promise<void> {
  if (!igAppReady() || !list.length) return;
  const tagged = await igWithLark(users);
  for (const d of list) {
    const u = tagged.find(function(x) { return x.id === d.to; });
    if (!u || !u.larkId) continue;
    try {
      await igSendCard(u.larkId, igCard(d.c, d.view, users, Date.now(), link));
    } catch (err) {
      console.error('Integrity: không gửi được thẻ cho ' + u.id + ': ' + (err instanceof Error ? err.message : err));
    }
  }
}

export async function igNotifyDirect(events: IgEvent[], users: IgUser[], link: string): Promise<void> {
  if (!igAppReady()) return;
  const list: Delivery[] = [];
  for (const e of events) {
    const c = await find(e.ownerId, e.id);
    if (!c) continue;
    if (e.type === 'created' || e.type === 'restore3' || e.type === 'verdict') list.push({ to: c.ownerId, c: c, view: 'owner' });
    if (e.type === 'reported') list.push({ to: c.verifierId, c: c, view: 'verify' });
    if (e.type === 'restore1' && c.restore.step1) c.restore.step1.toIds.forEach(function(id) { list.push({ to: id, c: c, view: 'news' }); });
  }
  await deliver(list, users, link);
}

export async function igOverdueDirect(items: IgCommit[], users: IgUser[], link: string): Promise<void> {
  await deliver(items.map(function(c) { return { to: c.ownerId, c: c, view: 'owner' as IgView }; }), users, link);
}

// Đợt nhắc buổi sáng: mỗi người nhận thẻ việc quá hạn / đến hạn hôm nay và việc chờ mình nghiệm thu
export async function igDigestDirect(items: IgCommit[], users: IgUser[], link: string): Promise<void> {
  const now = Date.now();
  const today = igDay(new Date(now).toISOString());
  const sorted = items.filter(function(c) { return !c.voided; }).sort(function(a, b) { return a.due.localeCompare(b.due); });
  const list: Delivery[] = [];
  users.forEach(function(u) {
    sorted.filter(function(c) { return c.ownerId === u.id && (igNeedsRestore(c, now) || (igState(c, now) === 'open' && igDay(c.due) === today)); })
      .slice(0, DIGEST_MAX).forEach(function(c) { list.push({ to: u.id, c: c, view: 'owner' }); });
    sorted.filter(function(c) { const r = igLastReport(c); return c.verifierId === u.id && !!r && !r.verdict; })
      .slice(0, DIGEST_MAX).forEach(function(c) { list.push({ to: u.id, c: c, view: 'verify' }); });
  });
  await deliver(list, users, link);
}
