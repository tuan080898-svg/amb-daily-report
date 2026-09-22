'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppState } from '@/lib/store';
import type { ChatMessage } from '@/lib/ai/types';

export default function AiChat() {
  var { currentUser } = useAppState();
  var [isOpen, setIsOpen] = useState(false);
  var [messages, setMessages] = useState<ChatMessage[]>([]);
  var [input, setInput] = useState('');
  var [loading, setLoading] = useState(false);
  var [error, setError] = useState('');
  var scrollRef = useRef<HTMLDivElement>(null);
  var inputRef = useRef<HTMLInputElement>(null);

  useEffect(function() {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(function() {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  var sendMessage = useCallback(async function() {
    if (!input.trim() || loading || !currentUser) return;

    var userMsg: ChatMessage = {
      id: 'msg_' + Date.now(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages(function(prev) { return prev.concat([userMsg]); });
    setInput('');
    setLoading(true);
    setError('');

    try {
      var history = messages.slice(-6).map(function(m) {
        return { role: m.role, content: m.content };
      });

      var res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg.content,
          userId: currentUser.id,
          conversationHistory: history,
        }),
      });

      var data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Loi khong xac dinh');
        setLoading(false);
        return;
      }

      var aiMsg: ChatMessage = {
        id: 'msg_' + Date.now() + '_ai',
        role: 'assistant',
        content: data.reply,
        timestamp: new Date().toISOString(),
      };
      setMessages(function(prev) { return prev.concat([aiMsg]); });
    } catch {
      setError('Khong the ket noi den AI. Kiem tra mang.');
    }
    setLoading(false);
  }, [input, loading, currentUser, messages]);

  if (!currentUser) return null;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={function() { setIsOpen(!isOpen); }}
        className="fixed z-50 bottom-20 right-4 md:bottom-6 md:right-6 w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg flex items-center justify-center transition-all"
        title="AI Tro ly"
      >
        {isOpen ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3c-4.97 0-9 3.13-9 7 0 2.38 1.42 4.49 3.61 5.82L5 21l4.34-2.17C10.21 18.94 11.09 19 12 19c4.97 0 9-3.13 9-7s-4.03-7-9-7z" />
            <circle cx="8" cy="10" r="1" fill="currentColor" />
            <circle cx="12" cy="10" r="1" fill="currentColor" />
            <circle cx="16" cy="10" r="1" fill="currentColor" />
          </svg>
        )}
      </button>

      {/* Chat drawer */}
      {isOpen && (
        <div className="fixed inset-0 md:inset-auto md:bottom-20 md:right-6 z-50 md:w-[400px] md:h-[520px] flex flex-col bg-slate-900 md:rounded-2xl md:shadow-2xl border border-slate-700/50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700/50">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M12 3c-4.97 0-9 3.13-9 7 0 2.38 1.42 4.49 3.61 5.82L5 21l4.34-2.17C10.21 18.94 11.09 19 12 19c4.97 0 9-3.13 9-7s-4.03-7-9-7z" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-white">AI Tro ly AMB</span>
            </div>
            <button
              onClick={function() { setIsOpen(false); }}
              className="text-gray-400 hover:text-white p-1"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-blue-600/20 flex items-center justify-center mx-auto mb-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2">
                    <path d="M12 3c-4.97 0-9 3.13-9 7 0 2.38 1.42 4.49 3.61 5.82L5 21l4.34-2.17C10.21 18.94 11.09 19 12 19c4.97 0 9-3.13 9-7s-4.03-7-9-7z" />
                  </svg>
                </div>
                <p className="text-gray-400 text-sm mb-3">Hoi bat ky dieu gi ve du lieu kinh doanh</p>
                <div className="space-y-2">
                  {['Doanh thu hom qua the nao?', 'Ton kho san pham nao sap het?', 'So sanh doanh thu tuan nay voi tuan truoc'].map(function(q) {
                    return (
                      <button
                        key={q}
                        onClick={function() { setInput(q); }}
                        className="block w-full text-left text-xs text-blue-400 hover:text-blue-300 bg-slate-800 rounded-lg px-3 py-2 hover:bg-slate-700 transition"
                      >
                        {q}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {messages.map(function(msg) {
              return (
                <div
                  key={msg.id}
                  className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                >
                  <div
                    className={
                      msg.role === 'user'
                        ? 'max-w-[80%] bg-blue-600 text-white rounded-2xl rounded-br-sm px-3 py-2 text-sm'
                        : 'max-w-[85%] bg-slate-800 text-gray-200 rounded-2xl rounded-bl-sm px-3 py-2 text-sm whitespace-pre-wrap'
                    }
                  >
                    {msg.content}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-800 text-gray-400 rounded-2xl rounded-bl-sm px-4 py-2 text-sm flex items-center gap-1">
                  <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                </div>
              </div>
            )}

            {error && (
              <div className="text-center">
                <span className="text-xs text-red-400 bg-red-900/30 px-3 py-1 rounded-full">{error}</span>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-slate-700/50 bg-slate-800 safe-bottom">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={function(e) { setInput(e.target.value); }}
                onKeyDown={function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Hoi ve du lieu kinh doanh..."
                className="flex-1 bg-slate-700 text-white text-sm rounded-xl px-3 py-2 border border-slate-600 focus:border-blue-500 focus:outline-none placeholder-gray-500"
                disabled={loading}
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-xl px-3 py-2 transition"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
