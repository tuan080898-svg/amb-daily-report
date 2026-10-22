import { NextRequest, NextResponse } from 'next/server';
import { adminClient, sessionUser } from '@/lib/server-security';
import {
  costGetCogs, costGetConfig, costGetImportsPage, costSaveCogs, costSaveConfig, costUpsertImports, costDeleteImports,
} from '@/lib/cost-server';
import type { CogsEntry, PnlConfig, PnlImport } from '@/lib/types';

// Giá vốn và lãi lỗ chỉ đi qua cổng này: phải có phiên đăng nhập hợp lệ và đúng vai trò.
//  - Đọc giá vốn + cấu hình phí: admin, nhân viên (cần để tính khi nhập báo cáo)
//  - Đọc / sửa / xóa lãi lỗ: chỉ admin; nhân viên chỉ được thêm đợt nhập của chính mình
export const dynamic = 'force-dynamic';

function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status: status, headers: { 'Cache-Control': 'no-store' } });
}

function ok(body: unknown) {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(req: NextRequest) {
  try {
    const u = await sessionUser(req);
    if (!u) return fail(401, 'Chưa đăng nhập hoặc phiên đã hết hạn');
    const part = new URL(req.url).searchParams.get('part') || 'basic';
    const c = adminClient();
    if (part === 'basic') {
      if (u.role !== 'admin' && u.role !== 'employee') return fail(403, 'Không có quyền xem dữ liệu này');
      const both = await Promise.all([costGetCogs(c), costGetConfig(c)]);
      return ok({ cogs: both[0], config: both[1] });
    }
    if (part === 'imports') {
      if (u.role !== 'admin') return fail(403, 'Không có quyền xem dữ liệu này');
      const offset = Math.max(0, Math.floor(Number(new URL(req.url).searchParams.get('offset')) || 0));
      return ok(await costGetImportsPage(c, offset));
    }
    return fail(400, 'Yêu cầu không hợp lệ');
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : 'Lỗi hệ thống');
  }
}

export async function POST(req: NextRequest) {
  try {
    const u = await sessionUser(req);
    if (!u) return fail(401, 'Chưa đăng nhập hoặc phiên đã hết hạn');
    const body = await req.json();
    const action = String(body.action || '');
    const payload = body.payload;
    const c = adminClient();
    const isAdmin = u.role === 'admin';

    if (action === 'addImport') {
      if (!isAdmin && u.role !== 'employee') return fail(403, 'Không có quyền');
      const imp = payload as PnlImport;
      if (!imp || typeof imp.id !== 'string' || typeof imp.shopId !== 'string' || !Array.isArray(imp.dailyData)) return fail(400, 'Dữ liệu không hợp lệ');
      await costUpsertImports(c, [imp]);
      return ok({ ok: true });
    }
    if (!isAdmin) return fail(403, 'Chỉ admin được thực hiện thao tác này');

    if (action === 'saveCogs') {
      if (!Array.isArray(payload)) return fail(400, 'Dữ liệu không hợp lệ');
      await costSaveCogs(c, payload as CogsEntry[]);
    } else if (action === 'saveConfig') {
      const cfg = payload as PnlConfig;
      if (!cfg || !isFinite(Number(cfg.shopeeFeeRate)) || !isFinite(Number(cfg.tiktokFeeRate)) || !isFinite(Number(cfg.opexRate))) return fail(400, 'Dữ liệu không hợp lệ');
      await costSaveConfig(c, cfg);
    } else if (action === 'upsertImports') {
      if (!Array.isArray(payload)) return fail(400, 'Dữ liệu không hợp lệ');
      await costUpsertImports(c, payload as PnlImport[]);
    } else if (action === 'deleteImports') {
      if (!Array.isArray(payload)) return fail(400, 'Dữ liệu không hợp lệ');
      await costDeleteImports(c, (payload as unknown[]).map(String));
    } else {
      return fail(400, 'Yêu cầu không hợp lệ');
    }
    return ok({ ok: true });
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : 'Lỗi hệ thống');
  }
}
