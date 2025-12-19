
import React, { useState, useEffect } from 'react';
import { 
  ChannelConfig, LogEntry, PipelineResult 
} from './types';

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  var aistudio: AIStudio;
}

const PIPELINE_STAGES = [
  { id: 0, label: "趨勢抓取", desc: "正在查詢 YouTube Data API 熱門 Shorts..." },
  { id: 1, label: "訊號提取", desc: "Gemini 正在分析標題與標籤趨勢..." },
  { id: 2, label: "主題生成", desc: "正在發想高潛力影片主題..." },
  { id: 3, label: "權重衡量", desc: "根據頻道主軸與演算法進行權重評分..." },
  { id: 4, label: "製作內容", desc: "生成 Veo 影片 Prompt 與 YouTube 標題敘述..." },
  { id: 5, label: "影片生成", desc: "Veo 3.1 正在製作 9:16 垂直影片 (約需 45s)..." },
  { id: 6, label: "發佈上傳", desc: "正在上傳至 YouTube Channel..." }
];

const AppContent: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logs'>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [sysStatus, setSysStatus] = useState<{api_key: boolean, oauth: boolean} | null>(null);

  // New Channel State with Algorithm Focus
  const [newChannelName, setNewChannelName] = useState("");
  const [newKeywords, setNewKeywords] = useState("AI, Tech, Science");
  const [newRegion, setNewRegion] = useState("TW");
  const [newNiche, setNewNiche] = useState("AI 自動化工具實測");
  const [newAudience, setNewAudience] = useState("18-35 歲科技愛好者");

  useEffect(() => {
    const init = async () => {
      // Robust SysCheck
      try {
        const res = await fetch('/api/auth?action=check');
        if (res.ok) {
          const data = await res.json();
          setSysStatus(data);
        }
      } catch (e) { 
        console.warn("系統檢查接口異常，可能是環境變數未配置。", e); 
      }

      const saved = localStorage.getItem('sas_channels_v2');
      if (saved) setChannels(JSON.parse(saved));

      // Handle OAuth Callback
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const pendingId = localStorage.getItem('sas_pending_auth_id');
      if (code && pendingId) {
        handleAuthCallback(code, pendingId);
      }
      
      setIsLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!isLoading) localStorage.setItem('sas_channels_v2', JSON.stringify(channels));
  }, [channels, isLoading]);

  const addLog = (channelId: string, channelName: string, level: 'info' | 'success' | 'error', msg: string, phase?: string) => {
    setLogs(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      channelId,
      channelName,
      level,
      message: String(msg),
      phase: phase ? phase.toUpperCase() : 'SYSTEM'
    }, ...prev].slice(0, 200));
  };

  const updateChannel = (id: string, updates: Partial<ChannelConfig>) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const handleAuthCallback = async (code: string, channelId: string) => {
    window.history.replaceState({}, document.title, window.location.pathname);
    localStorage.removeItem('sas_pending_auth_id');
    addLog(channelId, 'Auth', 'info', '正在完成安全令牌交換...', 'OAUTH');
    
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (data.tokens) {
        updateChannel(channelId, { auth: data.tokens });
        addLog(channelId, 'Auth', 'success', 'YouTube 頻道連結成功！', 'OAUTH');
      } else {
        throw new Error(data.error || "授權流程被中斷");
      }
    } catch (e: any) {
      addLog(channelId, 'Auth', 'error', `授權錯誤: ${e.message}`, 'CRITICAL');
    }
  };

  const startAuth = async (channelId: string) => {
    localStorage.setItem('sas_pending_auth_id', channelId);
    try {
      const res = await fetch('/api/auth?action=url');
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e: any) {
      addLog(channelId, 'Auth', 'error', '無法啟動 OAuth 授權中心。', 'CRITICAL');
    }
  };

  const runAutomation = async (channel: ChannelConfig) => {
    if (!channel.auth) return alert("請先完成 YouTube 授權。");
    
    updateChannel(channel.id, { 
        status: 'running', 
        currentStep: 0, 
        stepLabel: PIPELINE_STAGES[0].desc,
        results: undefined 
    });
    addLog(channel.id, channel.name, 'info', '初始化全自動管線引擎...', 'START');

    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelConfig: channel })
      });

      const responseText = await res.text();
      let result: PipelineResult;
      
      try {
        result = JSON.parse(responseText);
      } catch (jsonErr) {
        // 如果伺服器掛了返回 HTML，這裡能抓到原始 500 報錯文字
        const errorSummary = responseText.includes('FUNCTION_INVOCATION_FAILED') 
          ? "伺服器函數執行超時或內部崩潰 (Vercel Timeout)" 
          : responseText.slice(0, 100);
        throw new Error(`系統核心解析失敗。原始訊息：${errorSummary}`);
      }

      if (result.logs) {
        result.logs.forEach(msg => {
            const phase = msg.match(/Phase: (\w+)/)?.[1] || 'PIPELINE';
            addLog(channel.id, channel.name, 'info', msg, phase);
        });
      }

      if (!res.ok || !result.success) {
        throw new Error(result.error || "管線任務在執行途中中斷。");
      }

      addLog(channel.id, channel.name, 'success', `影片上傳完成！ID: ${result.uploadId}`, 'FINISH');
      updateChannel(channel.id, { 
        status: 'success', 
        lastRun: new Date().toLocaleString(),
        currentStep: 6,
        stepLabel: '全流程已完成',
        results: {
            trends: result.trends,
            winner: result.winner,
            metadata: result.metadata
        }
      });
    } catch (e: any) {
      addLog(channel.id, channel.name, 'error', `流程失敗: ${e.message}`, 'CRITICAL');
      updateChannel(channel.id, { status: 'error', stepLabel: '執行中斷' });
    }
  };

  const createChannel = () => {
    const newChannel: ChannelConfig = {
      id: Date.now().toString(),
      name: newChannelName || "預設頻道",
      regionCode: newRegion,
      searchKeywords: newKeywords.split(',').map(s => s.trim()),
      channelState: { 
          niche: newNiche,
          avg_views: 0,
          target_audience: newAudience
      },
      schedule: { active: false, privacy_status: 'private' },
      auth: null,
      status: 'idle'
    };
    setChannels(prev => [...prev, newChannel]);
    setIsAdding(false);
  };

  if (isLoading) return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-500 font-mono italic animate-pulse">BOOTING_V2_KERNEL...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-indigo-500/30">
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 font-black text-white italic">S</div>
            <h1 className="text-xl font-black tracking-tighter text-white uppercase italic">Shorts<span className="text-indigo-500 not-italic">Pilot</span></h1>
          </div>
          <div className="flex items-center gap-5">
            <div className="hidden lg:flex gap-4 text-[9px] font-black uppercase tracking-widest bg-slate-800 px-4 py-2 rounded-xl">
                <span className={sysStatus?.api_key ? "text-emerald-500" : "text-red-500"}>GEMINI_API: {sysStatus?.api_key ? "OK" : "MISSING"}</span>
                <span className={sysStatus?.oauth ? "text-emerald-500" : "text-red-500"}>OAUTH_CORE: {sysStatus?.oauth ? "OK" : "MISSING"}</span>
            </div>
            <div className="flex bg-slate-800 p-1 rounded-xl">
                <button onClick={() => setActiveTab('dashboard')} className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>控制台</button>
                <button onClick={() => setActiveTab('logs')} className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'logs' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>系統日誌</button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {activeTab === 'dashboard' ? (
          <div className="space-y-8 animate-fade-in">
            <div className="flex justify-between items-end bg-slate-900/40 p-10 rounded-[2.5rem] border border-slate-800/50 backdrop-blur-sm">
              <div>
                <h2 className="text-4xl font-black text-white tracking-tight">頻道自動化工坊</h2>
                <p className="text-slate-500 text-sm mt-2 font-medium">目前運作中的頻道實體：{channels.length}</p>
              </div>
              <button onClick={() => setIsAdding(true)} className="px-10 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[1.5rem] font-black shadow-xl shadow-indigo-900/30 transition-all active:scale-95">+ 新增配置</button>
            </div>

            {isAdding && (
              <div className="bg-slate-900 border border-slate-700 rounded-[2.5rem] p-12 animate-slide-down shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500"></div>
                <h3 className="text-2xl font-black mb-10 text-white flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs">01</span>
                  演算法權重與頻道配置
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-10">
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">頻道對外名稱</label>
                    <input value={newChannelName} onChange={e => setNewChannelName(e.target.value)} placeholder="例如：科技愛好者" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 outline-none focus:ring-2 focus:ring-indigo-500 text-white font-bold" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">演算法主軸 (Niche Focus)</label>
                    <input value={newNiche} onChange={e => setNewNiche(e.target.value)} placeholder="例如：廚藝教學、3C 開箱" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 outline-none focus:ring-2 focus:ring-indigo-500 text-white font-bold italic" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">目標區域與檢索關鍵字</label>
                    <div className="flex gap-4">
                        <select value={newRegion} onChange={e => setNewRegion(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-2xl p-5 outline-none text-white font-black">
                          <option value="TW">台灣 (TW)</option>
                          <option value="US">美國 (US)</option>
                          <option value="JP">日本 (JP)</option>
                        </select>
                        <input value={newKeywords} onChange={e => setNewKeywords(e.target.value)} placeholder="AI, Technology, Gadgets" className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl p-5 outline-none focus:ring-2 focus:ring-indigo-500 text-white font-bold" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">目標受眾特徵</label>
                    <input value={newAudience} onChange={e => setNewAudience(e.target.value)} placeholder="18-35 歲追求新知的年輕人" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 outline-none focus:ring-2 focus:ring-indigo-500 text-white font-bold" />
                  </div>
                </div>
                <div className="flex justify-end gap-6 border-t border-slate-800 pt-10">
                  <button onClick={() => setIsAdding(false)} className="px-8 py-3 text-slate-500 font-bold hover:text-slate-300">捨棄變更</button>
                  <button onClick={createChannel} className="px-14 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[1.5rem] font-black shadow-lg shadow-indigo-900/20">儲存配置並建立實體</button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-8">
              {channels.map(channel => (
                <div key={channel.id} className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 hover:border-slate-600 transition-all shadow-xl group relative overflow-hidden">
                  <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-8 relative z-10">
                    <div className="flex-1">
                      <div className="flex items-center gap-5 mb-4">
                        <h3 className="text-3xl font-black text-white">{channel.name}</h3>
                        <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black tracking-widest uppercase shadow-sm ${
                          channel.status === 'running' ? 'bg-indigo-600 text-white animate-pulse' :
                          channel.status === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                          channel.status === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-slate-800 text-slate-500'
                        }`}>{channel.status}</span>
                      </div>
                      <div className="flex flex-wrap gap-6 text-slate-400 text-sm font-bold">
                        <span className="flex items-center gap-2 bg-slate-950 px-4 py-2 rounded-xl">地區: {channel.regionCode}</span>
                        <span className="flex items-center gap-2 bg-slate-950 px-4 py-2 rounded-xl text-indigo-400">主軸: {channel.channelState.niche}</span>
                        {channel.auth ? <span className="text-emerald-500 font-black self-center">✓ 帳號已連結</span> : <span className="text-amber-500 font-black self-center">! 未連結 YouTube</span>}
                      </div>
                    </div>

                    <div className="flex gap-4">
                      {!channel.auth ? (
                         <button onClick={() => startAuth(channel.id)} className="px-8 py-5 bg-amber-600 hover:bg-amber-500 text-white rounded-[1.2rem] font-black text-sm shadow-lg shadow-amber-900/20 transition-all">連動 YouTube 頻道</button>
                      ) : (
                        <button 
                          onClick={() => runAutomation(channel)} 
                          disabled={channel.status === 'running'}
                          className="px-10 py-5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-[1.2rem] font-black text-sm shadow-xl shadow-indigo-900/20 transition-all"
                        >
                          {channel.status === 'running' ? '管線處理中...' : '啟動 7 階段自動化'}
                        </button>
                      )}
                      <button onClick={() => setChannels(channels.filter(c => c.id !== channel.id))} className="p-5 bg-slate-800 text-slate-500 hover:bg-red-600 hover:text-white rounded-[1.2rem] transition-all shadow-md">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>

                  {channel.status === 'running' && (
                    <div className="mt-10 p-10 bg-slate-950/50 rounded-[2.5rem] border border-slate-800 animate-fade-in ring-1 ring-indigo-500/30">
                      <div className="flex justify-between items-end mb-8">
                         <div className="space-y-2">
                           <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] flex items-center gap-3">
                             <span className="w-2 h-2 bg-indigo-500 rounded-full animate-ping"></span>
                             PIPELINE_EXECUTING_STAGE_{((channel.currentStep ?? 0) + 1)}
                           </span>
                           <h4 className="text-3xl font-bold text-white italic tracking-tight">{channel.stepLabel}</h4>
                         </div>
                         <span className="text-xs font-mono text-slate-600 bg-slate-900 px-5 py-2 rounded-xl border border-slate-800">UPLOADER_SYNC: ACTIVE</span>
                      </div>
                      <div className="w-full bg-slate-800 h-4 rounded-full overflow-hidden shadow-inner">
                        <div 
                          className="h-full bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 transition-all duration-1000 bg-[length:200%_100%] animate-gradient-x"
                          style={{ width: `${((channel.currentStep ?? 0) + 1) * 14.28}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {channel.status === 'success' && channel.results && (
                    <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-8 animate-slide-down">
                        <div className="bg-slate-950/60 p-10 rounded-[2rem] border border-slate-800/80 backdrop-blur-xl">
                           <h4 className="text-[11px] font-black text-slate-500 uppercase mb-6 tracking-[0.3em] flex items-center gap-3">
                             <span className="w-2 h-2 rounded-full bg-indigo-500"></span> 數據洞察 (INSIGHTS)
                           </h4>
                           <div className="space-y-5">
                             {channel.results.trends?.slice(0, 3).map((t, i) => (
                               <div key={i} className="text-xs text-slate-400 flex justify-between items-center group/item border-b border-slate-800/50 pb-4 last:border-0">
                                 <span className="truncate max-w-[240px] font-bold group-hover/item:text-white transition-colors tracking-tight">{t.title}</span>
                                 <span className="text-indigo-400 font-black bg-indigo-500/10 px-4 py-1.5 rounded-xl border border-indigo-500/20">{(t.view_count / 1000000).toFixed(1)}M</span>
                               </div>
                             ))}
                           </div>
                        </div>
                        <div className="bg-slate-950/60 p-10 rounded-[2rem] border border-slate-800/80 backdrop-blur-xl">
                           <h4 className="text-[11px] font-black text-emerald-500 uppercase mb-6 tracking-[0.3em] flex items-center gap-3">
                             <span className="w-2 h-2 rounded-full bg-emerald-500"></span> 生成內容 (CONTENT)
                           </h4>
                           <div className="space-y-4">
                             <p className="text-sm font-black text-white leading-relaxed bg-slate-900 p-4 rounded-2xl border border-slate-800 italic">標題：{channel.results.metadata?.title_template}</p>
                             <div className="text-[11px] text-slate-500 leading-relaxed font-medium">
                                {channel.results.metadata?.description_template.split('\n').map((line, i) => <p key={i}>{line}</p>)}
                             </div>
                           </div>
                        </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-[3rem] overflow-hidden shadow-2xl animate-fade-in ring-1 ring-slate-800">
            <div className="p-10 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-white uppercase tracking-wider">系統日誌核心 (Kernel Shell)</h3>
                <p className="text-[10px] text-slate-500 font-mono mt-3 flex items-center gap-3 italic">
                   <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                   LOG_STREAM_V2_ONLINE | PID: {Math.floor(Math.random()*9000)+1000}
                </p>
              </div>
              <button onClick={() => setLogs([])} className="px-10 py-3 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white text-[11px] font-black uppercase rounded-2xl transition-all border border-red-500/20 shadow-md">清除日誌緩存</button>
            </div>
            <div className="h-[750px] overflow-y-auto p-10 font-mono text-[11px] space-y-3 bg-slate-950/80 scroll-smooth custom-scrollbar">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-800 space-y-6 opacity-40">
                  <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.022.547l-2.387 2.387a2 2 0 102.828 2.828l2.387-2.387a2 2 0 00.547-1.022l.477-2.387a6 6 0 00-.517-3.86l-.158-.318a6 6 0 01-.517-3.86L6.05 6.05a2 2 0 00-.547-1.022l-2.387-2.387a2 2 0 10-2.828 2.828l2.387 2.387a2 2 0 001.022.547l2.387.477a6 6 0 003.86-.517l.318-.158a6 6 0 013.86-.517l2.387.477a2 2 0 001.022-.547l2.387-2.387a2 2 0 10-2.828-2.828l-2.387 2.387z" /></svg>
                  <span className="uppercase tracking-[0.6em] font-black text-sm">System Idle / Waiting for Pipeline...</span>
                </div>
              ) : (
                logs.map(log => (
                  <div key={log.id} className="flex gap-6 p-4 rounded-[1.5rem] hover:bg-slate-900 transition-all items-start border border-transparent hover:border-slate-800 shadow-sm group">
                    <span className="text-slate-600 shrink-0 font-bold opacity-60">[{log.timestamp}]</span>
                    <span className={`shrink-0 px-4 py-1.5 rounded-xl text-[10px] font-black flex items-center shadow-md ${
                        log.phase === 'CRITICAL' || log.level === 'error' ? 'bg-red-600 text-white shadow-red-900/20' : 
                        log.phase === 'VEO' ? 'bg-purple-600 text-white shadow-purple-900/20' :
                        log.phase === 'TRENDS' ? 'bg-indigo-600 text-white shadow-indigo-900/20' :
                        log.phase === 'OAUTH' ? 'bg-amber-600 text-white shadow-amber-900/20' : 'bg-slate-800 text-slate-400'
                    }`}>{log.phase}</span>
                    <span className={`shrink-0 font-black tracking-tight ${log.level === 'error' ? 'text-red-500' : log.level === 'success' ? 'text-emerald-500' : 'text-indigo-400'}`}>
                      @{log.channelName}
                    </span>
                    <span className={`flex-1 leading-relaxed ${log.level === 'error' ? 'text-red-300 bg-red-950/40 px-5 py-3 rounded-2xl border border-red-900/30' : 'text-slate-400 group-hover:text-slate-200'}`}>{log.message}</span>
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

const App: React.FC = () => (<ErrorBoundary><AppContent /></ErrorBoundary>);

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: any) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-12">
          <div className="max-w-2xl w-full bg-slate-900 border border-red-900/40 rounded-[4rem] p-20 text-center shadow-2xl">
            <h1 className="text-5xl font-black text-white mb-8 uppercase tracking-tighter italic">核心崩潰 (FATAL_PANIC)</h1>
            <div className="bg-black/50 p-10 rounded-3xl mb-12 text-left font-mono text-sm text-red-400 overflow-auto border border-red-900/30 shadow-inner">
              {this.state.error?.message}
            </div>
            <button onClick={() => window.location.reload()} className="px-14 py-6 bg-red-600 hover:bg-red-500 text-white rounded-[2rem] font-black text-2xl shadow-xl shadow-red-900/40 transition-all active:scale-95">重啟系統核心</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default App;
