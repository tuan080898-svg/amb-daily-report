import { NextRequest, NextResponse } from 'next/server';
import { IS_AI_CONFIGURED, callClaude } from '@/lib/ai/claude-client';
import { getInsightsSystemPrompt } from '@/lib/ai/system-prompts';
import { buildInsightsContext } from '@/lib/ai/data-context';
import type { DailyInsight } from '@/lib/ai/types';

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

    var reply = await callClaude(systemPrompt, [{ role: 'user', content: userMessage }], { maxTokens: 4096, budget: 'medium' });

    try {
      var jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        var parsed = JSON.parse(jsonMatch[0]);
        var insights: DailyInsight[] = parsed.insights || [];
        return NextResponse.json({ insights: insights, summary: parsed.summary || '' });
      }
    } catch {
      // fallback
    }

    return NextResponse.json({
      insights: [{
        id: 'fallback-1',
        date: new Date().toISOString().slice(0, 10),
        category: 'performance' as const,
        severity: 'info' as const,
        title: 'Nhan xet AI',
        content: reply,
      }],
      summary: reply.slice(0, 200),
    });
  } catch (err) {
    console.error('[AI Insights] Error:', err);
    var errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Loi AI: ' + errMsg.slice(0, 200), insights: [], summary: '' }, { status: 500 });
  }
}
