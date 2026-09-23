import { NextRequest, NextResponse } from 'next/server';
import { IS_AI_CONFIGURED, callClaude } from '@/lib/ai/claude-client';
import { getInsightsSystemPrompt } from '@/lib/ai/system-prompts';
import { buildInsightsContext } from '@/lib/ai/data-context';
import type { DailyInsight } from '@/lib/ai/types';

function tryParseJSON(raw: string): { summary: string; insights: DailyInsight[] } | null {
  var clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // Try direct parse first
  try {
    var parsed = JSON.parse(clean);
    if (parsed.insights) return parsed;
  } catch {}

  // Try extracting JSON object with regex
  try {
    var match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      var parsed2 = JSON.parse(match[0]);
      if (parsed2.insights) return parsed2;
    }
  } catch {}

  // JSON might be truncated — try to recover by closing brackets
  try {
    var partial = clean;
    if (!partial.startsWith('{')) {
      var idx = partial.indexOf('{');
      if (idx >= 0) partial = partial.slice(idx);
    }
    // Try adding closing brackets to fix truncation
    var attempts = [
      partial + '}]}',
      partial + '"}]}',
      partial + '"}]}',
      partial + '} ]}',
    ];
    for (var a of attempts) {
      try {
        var parsed3 = JSON.parse(a);
        if (parsed3.insights) return parsed3;
      } catch {}
    }
  } catch {}

  return null;
}

function sanitizeInsight(ins: Record<string, unknown>, i: number): DailyInsight {
  return {
    id: (ins.id as string) || 'insight-' + i,
    date: (ins.date as string) || new Date().toISOString().slice(0, 10),
    shopId: ins.shopId as string | undefined,
    category: (ins.category as DailyInsight['category']) || 'performance',
    severity: (ins.severity as DailyInsight['severity']) || 'info',
    title: (ins.title as string) || 'Nhan xet',
    content: (ins.content as string) || '',
    action: ins.action as string | undefined,
  };
}

export async function GET(req: NextRequest) {
  if (!IS_AI_CONFIGURED) {
    return NextResponse.json({ error: 'Chua cau hinh AI', insights: [], summary: '' }, { status: 503 });
  }

  var userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'Thieu userId', insights: [], summary: '' }, { status: 400 });
  }

  try {
    var { context, role } = await buildInsightsContext(userId);
    if (!context) {
      return NextResponse.json({ insights: [], summary: 'Khong co du lieu de phan tich.' });
    }

    var systemPrompt = getInsightsSystemPrompt();
    var userMessage = 'Vai tro: ' + role + '\n\nDu lieu:\n' + context;

    var reply = await callClaude(systemPrompt, [{ role: 'user', content: userMessage }], { maxTokens: 8192 });

    var result = tryParseJSON(reply);
    if (result && result.insights && result.insights.length > 0) {
      var insights = result.insights.map(function(ins: DailyInsight, i: number) {
        return sanitizeInsight(ins as unknown as Record<string, unknown>, i);
      });
      return NextResponse.json({ insights: insights, summary: result.summary || '' });
    }

    console.error('[AI Insights] Could not parse JSON. Reply length:', reply.length, 'First 200 chars:', reply.slice(0, 200));

    return NextResponse.json({
      insights: [{
        id: 'fallback-1',
        date: new Date().toISOString().slice(0, 10),
        category: 'performance' as const,
        severity: 'info' as const,
        title: 'Nhan xet AI',
        content: reply.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim().slice(0, 2000),
      }],
      summary: 'AI da phan tich nhung khong tra ve dung dinh dang.',
    });
  } catch (err) {
    console.error('[AI Insights] Error:', err);
    var errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Loi AI: ' + errMsg.slice(0, 200), insights: [], summary: '' }, { status: 500 });
  }
}
