import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '@/lib/server-security';
import { cbReport } from '@/lib/canhbao-server';
import { cbLarkText } from '@/lib/canhbao';

// Tin Lark cảnh báo nhập hàng mỗi sáng.
//  GET  : lịch chạy của Vercel, bắt buộc header "Authorization: Bearer <CRON_SECRET>".
//  POST : admin xem trước hoặc bấm "Gửi Lark ngay" trên trang.
// Biến môi trường (đặt trên Vercel): LARK_CANHBAO_WEBHOOK, CRON_SECRET, tùy chọn LARK_CANHBAO_SIGN (khóa ký của bot).
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function reply(status: number, body: unknown) {
  return NextResponse.json(body, { status: status, headers: { 'Cache-Control': 'no-store' } });
}

function pageLink(req: NextRequest): string {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return (host ? 'https://' + host : req.nextUrl.origin) + '/kho/canh-bao';
}

async function send(text: string): Promise<void> {
  const url = process.env.LARK_CANHBAO_WEBHOOK || '';
  if (!/^https:\/\/open\.(larksuite\.com|feishu\.cn)\/open-apis\/bot\//.test(url)) throw new Error('Chưa cài LARK_CANHBAO_WEBHOOK (địa chỉ bot của nhóm Lark) trên Vercel');
  const body: Record<string, unknown> = { msg_type: 'text', content: { text: text } };
  const secret = process.env.LARK_CANHBAO_SIGN || '';
  if (secret) {
    const ts = String(Math.floor(Date.now() / 1000));
    body.timestamp = ts;
    body.sign = crypto.createHmac('sha256', ts + '\n' + secret).update('').digest('base64');
  }
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
  const j = await res.json().catch(function() { return null; });
  // Lark trả HTTP 200 cả khi từ chối tin: phải xem mã lỗi trong nội dung
  const code = j ? (j.code ?? j.StatusCode) : null;
  if (!res.ok || code !== 0) throw new Error('Lark từ chối tin: ' + (j && (j.msg || j.StatusMessage) || 'HTTP ' + res.status));
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret || req.headers.get('authorization') !== 'Bearer ' + secret) return reply(401, { error: 'Không có quyền' });
  try {
    await send(cbLarkText(await cbReport(), pageLink(req)));
    return reply(200, { status: 'sent' });
  } catch (e) {
    return reply(500, { error: e instanceof Error ? e.message : 'Lỗi hệ thống' });
  }
}

export async function POST(req: NextRequest) {
  try {
    const u = await sessionUser(req);
    if (!u) return reply(401, { error: 'Chưa đăng nhập hoặc phiên đã hết hạn' });
    if (u.role !== 'admin') return reply(403, { error: 'Chỉ admin được gửi tin' });
    const body = await req.json().catch(function() { return {}; });
    const text = cbLarkText(await cbReport(), pageLink(req));
    if (body.send === true) await send(text);
    return reply(200, { text: text, sent: body.send === true });
  } catch (e) {
    return reply(500, { error: e instanceof Error ? e.message : 'Lỗi hệ thống' });
  }
}
