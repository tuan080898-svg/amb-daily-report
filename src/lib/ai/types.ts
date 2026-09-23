export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ChatRequest {
  message: string;
  userId: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface ChatResponse {
  reply: string;
  error?: string;
}

export interface DailyInsight {
  id: string;
  date: string;
  shopId?: string;
  category: 'performance' | 'anomaly' | 'inventory' | 'cskh' | 'kpi' | 'employee';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  content: string;
  action?: string;
}

export interface InsightsResponse {
  insights: DailyInsight[];
  summary: string;
  error?: string;
}
