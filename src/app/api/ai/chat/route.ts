import { NextRequest, NextResponse } from 'next/server';
import { IS_AI_CONFIGURED, callClaude } from '@/lib/ai/claude-client';
import { getChatSystemPrompt } from '@/lib/ai/system-prompts';
import { buildChatContext } from '@/lib/ai/data-context';
import { dbGetUsers } from '@/lib/db';

export async function GET() {
  var keyExists = !!process.env.ANTHROPIC_API_KEY;
  var keyPrefix = process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.slice(0, 10) + '...' : 'NOT SET';
  var keyLength = process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.length : 0;

  if (!keyExists) {
    return NextResponse.json({ status: 'ERROR', message: 'ANTHROPIC_API_KEY not set', keyPrefix, keyLength });
  }

  try {
    var reply = await callClaude('Reply with just "OK"', [{ role: 'user', content: 'test' }], { maxTokens: 10 });
    return NextResponse.json({ status: 'OK', message: 'AI working', keyPrefix, keyLength, reply });
  } catch (err) {
    var msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: 'ERROR', message: msg, keyPrefix, keyLength });
  }
}

var rateMap = new Map<string, number[]>();

function checkRate(userId: string): boolean {
  var now = Date.now();
  var timestamps = rateMap.get(userId) || [];
  timestamps = timestamps.filter(function(t) { return now - t < 60000; });
  if (timestamps.length >= 10) return false;
  timestamps.push(now);
  rateMap.set(userId, timestamps);
  return true;
}

export async function POST(req: NextRequest) {
  if (!IS_AI_CONFIGURED) {
    return NextResponse.json({ error: 'Chua cau hinh AI. Them ANTHROPIC_API_KEY vao Vercel.' }, { status: 503 });
  }

  try {
    var body = await req.json();
    var message: string = body.message;
    var userId: string = body.userId;
    var history: Array<{ role: 'user' | 'assistant'; content: string }> = body.conversationHistory || [];

    if (!message || !userId) {
      return NextResponse.json({ error: 'Thieu thong tin' }, { status: 400 });
    }

    if (!checkRate(userId)) {
      return NextResponse.json({ error: 'Ban gui qua nhieu tin nhan, vui long cho 1 phut.' }, { status: 429 });
    }

    var users = await dbGetUsers();
    var user = users.find(function(u) { return u.id === userId; });
    if (!user) {
      return NextResponse.json({ error: 'Khong tim thay nguoi dung' }, { status: 401 });
    }

    var context = await buildChatContext(userId, message);
    var systemPrompt = getChatSystemPrompt(user.role, context);

    var lastMessages = history.slice(-6);
    var messages = lastMessages.concat([{ role: 'user' as const, content: message }]);

    var reply = await callClaude(systemPrompt, messages, { maxTokens: 2048, budget: 'low' });

    return NextResponse.json({ reply: reply });
  } catch (err) {
    console.error('[AI Chat] Error:', err);
    var errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: '[DEBUG] ' + errMsg.slice(0, 300) }, { status: 500 });
  }
}
