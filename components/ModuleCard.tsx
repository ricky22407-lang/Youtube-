import React, { useState } from 'react';
import { TestResult } from '../types';

interface ModuleCardProps {
  title: string;
  description: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  onRunTest: () => Promise<TestResult>;
  onExecute: () => void;
  canExecute: boolean;
  data: any;
  testResult: TestResult | null;
  stepNumber: string;
  children?: React.ReactNode; // For custom content like Video Player or Links
}

export const ModuleCard: React.FC<ModuleCardProps> = ({
  title,
  description,
  status,
  onRunTest,
  onExecute,
  canExecute,
  data,
  testResult,
  stepNumber,
  children
}) => {
  const [testStatus, setTestStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [isExpanded, setIsExpanded] = useState(false);

  const handleTest = async () => {
    setTestStatus('running');
    await onRunTest();
    setTestStatus('done');
  };

  const getStatusLabel = (s: string) => {
    switch(s) {
      case 'idle': return '等待中';
      case 'loading': return '處理中...';
      case 'success': return '完成';
      case 'error': return '錯誤';
      default: return s;
    }
  };

  const getStatusColor = (s: string) => {
    switch(s) {
      case 'idle': return 'bg-slate-700 text-slate-400';
      case 'loading': return 'bg-blue-900/50 text-blue-300 border border-blue-700 animate-pulse';
      case 'success': return 'bg-green-900/50 text-green-300 border border-green-700';
      case 'error': return 'bg-red-900/50 text-red-300 border border-red-700';
      default: return 'bg-slate-700 text-slate-400';
    }
  };

  return (
    <div className={`relative border rounded-xl p-6 bg-slate-800/80 backdrop-blur-sm shadow-xl transition-all duration-300 ${status === 'loading' ? 'ring-2 ring-blue-500/50' : 'border-slate-700'}`}>
      
      {/* Step Badge */}
      <div className="absolute -left-3 -top-3 w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg z-10">
        {stepNumber}
      </div>

      <div className="flex justify-between items-start mb-4 pl-4">
        <div>
          <h3 className="text-xl font-bold text-white tracking-tight">{title}</h3>
          <p className="text-slate-400 text-sm mt-1">{description}</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide ${getStatusColor(status)}`}>
          {getStatusLabel(status)}
        </div>
      </div>

      {/* Custom Content Slot (Video/Link) */}
      {children && (
        <div className="mb-6 animate-fade-in">
          {children}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-4 pl-4 border-t border-slate-700/50 pt-4">
        <div className="group relative">
          <button
            onClick={onExecute}
            disabled={!canExecute || status === 'loading'}
            className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-sm font-medium transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale"
          >
            {status === 'loading' ? '正在執行...' : status === 'success' ? '重新執行' : '執行此步驟'}
          </button>
          {!canExecute && status !== 'loading' && status !== 'success' && (
             <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-black text-xs text-white rounded shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-20 text-center">
               請先完成前一步驟
             </div>
          )}
        </div>

        <div className="group relative">
          <button
            onClick={handleTest}
            disabled={testStatus === 'running'}
            className="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 border border-slate-600"
          >
            {testStatus === 'running' ? '測試中...' : '單元測試'}
          </button>
           <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-black text-xs text-white rounded shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-20 text-center">
             驗證此模組的邏輯與 JSON Schema
           </div>
        </div>
      </div>

      {/* Test Logs */}
      {testResult && (
        <div className={`mb-4 mx-4 p-3 rounded-lg text-xs font-mono border ${testResult.passed ? 'bg-green-950/30 border-green-900/50 text-green-300' : 'bg-red-950/30 border-red-900/50 text-red-300'}`}>
          <div className="font-bold mb-1 flex items-center gap-2">
            {testResult.passed ? '✅ 測試通過' : '❌ 測試失敗'}
          </div>
          <div className="max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 pr-2">
             {testResult.logs.map((log, i) => (
              <div key={i} className="opacity-80">{log}</div>
            ))}
          </div>
        </div>
      )}

      {/* Data Output Preview (Collapsible) */}
      {data && (
        <div className="mx-4 mt-2">
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-xs text-slate-500 font-bold uppercase tracking-wider hover:text-slate-300 transition-colors mb-2 focus:outline-none"
          >
            <span>{isExpanded ? '▼ 收起詳細資料 (JSON)' : '▶ 查看詳細資料 (JSON)'}</span>
          </button>
          
          {isExpanded && (
            <div className="animate-slide-down">
              <pre className="bg-slate-950 p-4 rounded-lg text-xs text-emerald-400 font-mono overflow-auto max-h-64 scrollbar-thin scrollbar-thumb-slate-700 border border-slate-800 shadow-inner">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};