'use client';

import { useState, useEffect } from 'react';
import { useAppState } from '@/lib/store';
import type { DailyInsight } from '@/lib/ai/types';

var severityStyles: Record<string, { bg: string; text: string; icon: string }> = {
  critical: { bg: 'bg-red-900/30', text: 'text-red-400', icon: '!' },
  warning: { bg: 'bg-amber-900/30', text: 'text-amber-400', icon: '!' },
  info: { bg: 'bg-blue-900/30', text: 'text-blue-400', icon: 'i' },
};

var categoryLabels: Record<string, string> = {
  performance: 'Hieu suat',
  anomaly: 'Bat thuong',
  inventory: 'Ton kho',
  cskh: 'CSKH',
  kpi: 'KPI',
  employee: 'Nhan vien',
};

export default function AiInsights() {
  var { currentUser } = useAppState();
  var [insights, setInsights] = useState<DailyInsight[]>([]);
  var [summary, setSummary] = useState('');
  var [loading, setLoading] = useState(false);
  var [error, setError] = useState('');
  var [loaded, setLoaded] = useState(false);

  function fetchInsights() {
    if (!currentUser) return;
    setLoading(true);
    setError('');

    fetch('/api/ai/insights?userId=' + currentUser.id)
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data.error && data.insights.length === 0) {
          setError(data.error);
        } else {
          setInsights(data.insights || []);
          setSummary(data.summary || '');
        }
        setLoaded(true);
        setLoading(false);
      })
      .catch(function() {
        setError('Khong the ket noi AI');
        setLoaded(true);
        setLoading(false);
      });
  }

  useEffect(function() {
    if (currentUser && !loaded) {
      fetchInsights();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  if (!currentUser) return null;

  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden mb-4 md:mb-6">
      <div className="px-3 md:px-5 py-3 md:py-4 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
          </svg>
          <h2 className="font-semibold text-gray-100 text-sm md:text-base">AI Nhan xet</h2>
          <span className="text-[10px] bg-blue-900/50 text-blue-400 px-1.5 py-0.5 rounded-full">AI</span>
        </div>
        <button
          onClick={fetchInsights}
          disabled={loading}
          className="text-xs text-gray-400 hover:text-blue-400 disabled:opacity-50 transition"
        >
          {loading ? 'Dang phan tich...' : 'Tai lai'}
        </button>
      </div>

      <div className="p-3 md:p-5">
        {loading && !loaded && (
          <div className="flex items-center gap-3 py-4">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-400">AI dang phan tich du lieu hom qua...</span>
          </div>
        )}

        {error && !loading && (
          <p className="text-sm text-gray-500 py-2">{error}</p>
        )}

        {loaded && !error && insights.length === 0 && (
          <p className="text-sm text-gray-500 py-2">Khong co du lieu de phan tich.</p>
        )}

        {summary && (
          <p className="text-sm text-gray-300 mb-3 pb-3 border-b border-slate-700/50">{summary}</p>
        )}

        {insights.length > 0 && (
          <div className="space-y-2">
            {insights.map(function(insight) {
              var style = severityStyles[insight.severity] || severityStyles.info;
              return (
                <div key={insight.id} className={'rounded-lg px-3 py-2.5 ' + style.bg}>
                  <div className="flex items-start gap-2">
                    <span className={'flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5 ' + style.text + ' ' + (insight.severity === 'critical' ? 'bg-red-900/50' : insight.severity === 'warning' ? 'bg-amber-900/50' : 'bg-blue-900/50')}>
                      {style.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className={'text-xs font-semibold ' + style.text}>{insight.title}</span>
                        <span className="text-[10px] text-gray-500">{categoryLabels[insight.category] || insight.category}</span>
                      </div>
                      <p className="text-xs text-gray-300 leading-relaxed">{insight.content}</p>
                      {insight.action && (
                        <div className="mt-1.5 pt-1.5 border-t border-slate-700/30">
                          <p className="text-xs text-emerald-400 leading-relaxed">
                            <span className="font-semibold">Hanh dong:</span> {insight.action}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
