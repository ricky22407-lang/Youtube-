
import React, { useState, useEffect } from 'react';
import { 
  ChannelConfig, LogEntry, PipelineResult 
} from './types';
import { MOCK_CHANNEL_STATE } from './constants';

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  var aistudio: AIStudio;
}

const PIPELINE_STAGES = [
  "趨勢抓取 (YouTube Data)",
  "訊號提取 (Gemini Analysis)",
  "主題生成 (Creative Logic)",
  "權重衡量 (Algorithm Sync)",
  "製作腳本與 Prompt 生成",
  "影片生成 (Veo 3.1 Fast)",
  "發佈上傳 (YouTube Upload)"
];

const ErrorBoundary: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [error, setError] = useState<Error | null>(null);
  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-red-400 p-8 text-center">
        <div className="max-w-xl">
          <h1 className="text-4xl font-black mb-4">SYSTEM CRITICAL ⚠️</h1>
          <p className="bg-red-950/20 border border-red-900 p-6 rounded-xl text-left font-mono text-sm overflow-auto">
            {error.message}
          </p>
          <button onClick={() => window.location.reload()} className="mt-8 px-8 py-3 bg-red-600 text-white rounded-full font-bold hover:bg-red-500 transition-all">
            RESTART SYSTEM
          </button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
};

const AppContent: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logs'>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);

  const [newChannelName, setNewChannelName] = useState("");
  const [newKeywords, setNewKeywords] = useState("AI, Tech");
  const [newRegion, setNewRegion] = useState("US");

  useEffect(() => {
    const init = async () => {
      if (window.aistudio) {
        try {
          const selected = await window.aistudio.hasSelectedApiKey();
          setHasApiKey(selected);
        } catch (e) { console.error(e); }
      }
      const saved = localStorage.getItem('sas_channels');
      if (saved) setChannels(JSON.parse(saved));
      setIsLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!isLoading) localStorage.setItem('sas_channels', JSON.stringify(channels));
  }, [channels, isLoading]);

  const addLog = (channelId: string, channelName: string, level: 'info' | 'success' | 'error', msg: string, phase?: string) => {
    setLogs(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      channelId,
      channelName,
      level,
      message: String(msg),
      phase
    }, ...prev].slice(0, 150));
  };

  const updateChannel = (id: string, updates: Partial<ChannelConfig>) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const createChannel = () => {
    const newChannel: ChannelConfig = {
      id: Date.now().toString(),
      name: newChannelName || "New Channel",
      regionCode: newRegion,
      searchKeywords: newKeywords.split(',').map(s => s.trim()),
      channelState: { ...MOCK_CHANNEL_STATE, niche: newKeywords },
      schedule: { active: false, privacy_status: 'private' },
      auth: null,
      status: 'idle'
    };
    setChannels(prev => [...prev, newChannel]);
    setIsAdding(false);
    setNewChannelName("");
  };

  const runAutomation = async (channel: ChannelConfig) => {
    if (!channel.auth) return alert("Authorize YouTube first");
    
    updateChannel(channel.id, { status: 'running', currentStep: 0, stepLabel: PIPELINE_STAGES[0] });
    addLog(channel.id, channel.name, 'info', '啟動自動化流程...', 'SYSTEM');

    // Optimization: Since we are in a serverless function that doesn't stream logs easily,
    // we simulate the progress bar movements to keep the user informed.
    const steps = PIPELINE_STAGES;
    let stepIndex = 0;
    const interval = setInterval(() => {
        if (stepIndex < 5) { // Stop before Veo/Upload as they are actually long
            stepIndex++;
            updateChannel(channel.id, { currentStep: stepIndex, stepLabel: steps[stepIndex] });
        }
    }, 4000);

    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelConfig: channel })
      });

      clearInterval(interval);
      let result: PipelineResult;
      const contentType = res.headers.get("content-type");
      
      if (contentType?.includes("application/json")) {
        result = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Server Crash (500): ${text.slice(0, 50)}`);
      }

      if (!res.ok || !result.success) {
        throw new Error(result.error || "流程執行失敗");
      }

      addLog(channel.id, channel.name, 'success', `影片上傳成功: ${result.uploadId}`, 'FINISH');
      updateChannel(channel.id, { 
        status: 'success', 
        lastRun: new Date().toLocaleString(),
        currentStep: 6,
        stepLabel: '已完成'
      });
    } catch (e: any) {
      clearInterval(interval);
      const errMsg = e.message || String(e);
      addLog(channel.id, channel.name, 'error', `嚴重錯誤: ${errMsg}`, 'CRITICAL');
      updateChannel(channel.id, { status: 'error', stepLabel: '執行中斷' });
    }
  };

  if (isLoading) return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-500 font-mono"><div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>LOADING_PIPELINE...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20 font-black">S</div>
            <h1 className="text-xl font-black tracking-tighter text-white uppercase">Shorts<span className="text-indigo-500">Auto</span></h1>
          </div>
          <div className="flex bg-slate-800 p-1 rounded-xl">
            <button onClick={() => setActiveTab('dashboard')} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>控制台</button>
            <button onClick={() => setActiveTab('logs')} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'logs' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>系統日誌</button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {activeTab === 'dashboard' ? (
          <div className="space-y-8 animate-fade-in">
            {/* API Key Selection Notice */}
            {!hasApiKey && (
              <div className="bg-amber-900/20 border border-amber-900/50 rounded-2xl p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-amber-400 font-bold flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    需要選取付費 API 金鑰
                  </h3>
                  <p className="text-amber-400/70 text-sm mt-1">
                    使用 Veo 影片生成與 Gemini 3 高階模型需要選取您自己的付費專案 API 金鑰。
                    請先在 Google AI Studio 選取金鑰。請參閱 <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="underline font-bold text-amber-300 hover:text-amber-200 transition-colors">計費與帳單說明</a>。
                  </p>
                </div>
                <button 
                  onClick={async () => {
                    if (window.aistudio) {
                      await window.aistudio.openSelectKey();
                      setHasApiKey(true); // Proceed assuming selection success
                    }
                  }}
                  className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold shadow-lg shadow-amber-900/20 transition-all whitespace-nowrap flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                  立即選取金鑰
                </button>
              </div>
            )}

            <div className="flex justify-between items-end">
              <div>
                <h2 className="text-3xl font-black text-white tracking-tight">自動化頻道清單</h2>
                <p className="text-slate-500 text-sm mt-1">管理與監控所有 AI 影片生成流程</p>
              </div>
              <button onClick={() => setIsAdding(true)} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-900/20 transition-all">+ 新增頻道</button>
            </div>

            {isAdding && (
              <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 animate-slide-down">
                <h3 className="text-lg font-bold mb-4">建立新頻道配置</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <input value={newChannelName} onChange={e => setNewChannelName(e.target.value)} placeholder="頻道名稱" className="bg-slate-950 border border-slate-800 rounded-xl p-4 focus:ring-2 focus:ring-indigo-500 outline-none" />
                  <input value={newKeywords} onChange={e => setNewKeywords(e.target.value)} placeholder="核心關鍵字 (如: AI, Tech)" className="bg-slate-950 border border-slate-800 rounded-xl p-4 focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setIsAdding(false)} className="px-6 py-2 text-slate-500 font-bold">取消</button>
                  <button onClick={createChannel} className="px-8 py-2 bg-indigo-600 rounded-xl font-bold">儲存</button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6">
              {channels.map(channel => (
                <div key={channel.id} className="bg-slate-900 border border-slate-800 rounded-3xl p-8 transition-all hover:border-slate-700">
                  <div className="flex flex-col md:flex-row justify-between md:items-center gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-2xl font-black text-white">{channel.name}</h3>
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase ${
                          channel.status === 'running' ? 'bg-indigo-500/20 text-indigo-400 animate-pulse' :
                          channel.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
                          channel.status === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-slate-500'
                        }`}>{channel.status}</span>
                      </div>
                      <p className="text-slate-500 text-sm">{channel.searchKeywords.join(', ')} • {channel.regionCode}</p>
                    </div>

                    <div className="flex gap-3">
                      {!channel.auth ? (
                        <button className="px-6 py-3 bg-amber-600/10 text-amber-500 border border-amber-500/30 rounded-xl font-bold text-sm">授權 YouTube</button>
                      ) : (
                        <button 
                          onClick={() => runAutomation(channel)} 
                          disabled={channel.status === 'running'}
                          className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-black text-sm shadow-xl shadow-indigo-900/20 transition-all"
                        >
                          {channel.status === 'running' ? '執行中...' : '立即執行全自動流程'}
                        </button>
                      )}
                      <button onClick={() => setChannels(channels.filter(c => c.id !== channel.id))} className="p-3 bg-slate-800 text-slate-500 hover:text-red-400 rounded-xl transition-all">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>

                  {channel.status === 'running' && (
                    <div className="mt-8 p-6 bg-slate-950/50 rounded-2xl border border-slate-800 animate-fade-in">
                      <div className="flex justify-between items-end mb-4">
                         <span className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                           <span className="w-2 h-2 bg-indigo-500 rounded-full animate-ping"></span>
                           當前進度: {channel.stepLabel}
                         </span>
                         <span className="text-[10px] text-slate-600 font-mono">STEP {((channel.currentStep ?? 0) + 1)}/7</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-indigo-600 to-purple-600 transition-all duration-1000"
                          style={{ width: `${((channel.currentStep ?? 0) + 1) * 14.28}%` }}
                        ></div>
                      </div>
                      <div className="mt-4 flex justify-between">
                         {PIPELINE_STAGES.map((s, idx) => (
                           <div key={idx} className={`w-1 h-1 rounded-full ${idx <= (channel.currentStep ?? 0) ? 'bg-indigo-500' : 'bg-slate-700'}`}></div>
                         ))}
                      </div>
                    </div>
                  )}

                  {channel.lastRun && channel.status !== 'running' && (
                    <div className="mt-4 text-[10px] text-slate-600 font-mono uppercase tracking-widest">
                      LAST_RUN_SYNCED: {channel.lastRun}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl animate-fade-in">
            <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-black text-slate-300 uppercase tracking-widest">系統運行日誌 (Kernel Logs)</h3>
                <p className="text-[10px] text-slate-600 font-mono mt-1">REALTIME_PIPELINE_TRACKING_V2.0</p>
              </div>
              <button onClick={() => setLogs([])} className="px-4 py-2 bg-slate-800 hover:bg-red-900/20 text-slate-500 hover:text-red-400 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all">清除暫存</button>
            </div>
            <div className="h-[600px] overflow-y-auto p-4 font-mono text-xs space-y-1 bg-slate-950/50">
              {logs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-700 uppercase tracking-[0.2em]">待命中... 無日誌數據</div>
              ) : (
                logs.map(log => (
                  <div key={log.id} className="flex gap-4 p-2 rounded hover:bg-slate-900/50 group transition-all">
                    <span className="text-slate-600 shrink-0 w-24">[{log.timestamp}]</span>
                    <span className={`shrink-0 px-2 py-0.5 rounded text-[9px] font-black h-5 flex items-center ${
                        log.phase === 'CRITICAL' ? 'bg-red-600 text-white' : 
                        log.phase === 'VEO' ? 'bg-purple-600 text-white' :
                        log.phase === 'TRENDS' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                    }`}>{log.phase ?? 'INFO'}</span>
                    <span className={`shrink-0 font-black ${log.level === 'error' ? 'text-red-500' : log.level === 'success' ? 'text-emerald-500' : 'text-indigo-400'}`}>
                      {log.channelName}:
                    </span>
                    <span className={`${log.level === 'error' ? 'text-red-300' : 'text-slate-400'}`}>{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

const App: React.FC = () => (
  <ErrorBoundary>
    <AppContent />
  </ErrorBoundary>
);

export default App;
