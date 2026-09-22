import Anthropic from '@anthropic-ai/sdk';

export var IS_AI_CONFIGURED = !!process.env.ANTHROPIC_API_KEY;

var client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export async function callClaude(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  options?: { maxTokens?: number; budget?: 'low' | 'medium' }
): Promise<string> {
  var c = getClient();
  var response = await c.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: options?.maxTokens || 4096,
    system: systemPrompt,
    messages: messages,
  });

  console.log('[AI] tokens:', response.usage.input_tokens, 'in /', response.usage.output_tokens, 'out');

  var textBlock = response.content.find(function(b) { return b.type === 'text'; });
  return textBlock && textBlock.type === 'text' ? textBlock.text : '';
}
