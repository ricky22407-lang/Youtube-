
import React, { useState, useEffect } from 'react';
import { 
  ChannelConfig, LogEntry, PipelineResult 
} from './types';

const PIPELINE_STEPS = [
  { id: 'analyze', label: "AI 企劃階段", desc: "正在分析趨勢並編寫腳本..." },
  { id: 'video', label: "影片生成階段", desc: "Veo 3.1 正在渲染 9:16 影片 (約 45-60s)..." },
  { id: 'upload', label: "發布上傳階段", desc: "正在同步至 YouTube 頻道..." }
];

const AppContent: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logs'>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [sysStatus, setSysStatus] = useState<{api_key: boolean, oauth: boolean} | null>(null);

  const [newChannelName, setNewChannelName] = useState("");
  const [newNiche, setNewNiche] = useState("AI 自動化工具實測");

  const checkSystem = async () => {
    try {
      const res = await fetch('/api/auth?action=check');
      if (res.ok) {
        const data = await res.json();
        setSysStatus(data);
      }
    } catch (e) { console.error("SysCheck 失敗", e); }
  };

  useEffect(() => {
    const init = async () => {
      await checkSystem();
      const saved = localStorage.getItem('sas_channels_v4');
      if (saved) setChannels(JSON.parse(saved));
      
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const pendingId = localStorage.getItem('sas_pending_auth_id');
      if (code && pendingId) handleAuthCallback(code, pendingId);
      
      setIsLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!isLoading) localStorage.setItem('sas_channels_v4', JSON.stringify(channels));
  }, [channels, isLoading]);

  const addLog = (channelId: string, channelName: string, level: 'info' | 'success' | 'error', msg: string, phase?: string) => {
    setLogs(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      channelId, channelName, level, message: String(msg),
      phase: phase ? phase.toUpperCase() : 'SYSTEM'
    }, ...prev].slice(0, 100));
  };

  const updateChannel = (id: string, updates: Partial<ChannelConfig>) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const handleAuthCallback = async (code: string, channelId: string) => {
    window.history.replaceState({}, document.title, window.location.pathname);
    localStorage.removeItem('sas_pending_auth_id');
    addLog(channelId, 'Auth', 'info', '正在完成授權令牌交換...', 'OAUTH');
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
      }
    } catch (e: any) { addLog(channelId, 'Auth', 'error', `授權失敗: ${e.message}`, 'CRITICAL'); }
  };

  const runAutomation = async (channel: ChannelConfig) => {
    if (!channel.auth) return alert("請先連結 YouTube 帳號。");
    
    updateChannel(channel.id, { status: 'running', currentStep: 0, stepLabel: PIPELINE_STEPS[0].desc });
    addLog(channel.id, channel.name, 'info', '啟動分段式自動化管線...', 'START');

    try {
      // 1. Analyze
      const res1 = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'analyze', channelConfig: channel })
      });
      const data1 = await res1.json();
      if (!data1.success) throw new Error(data1.error || "企劃階段失敗");
      data1.logs?.forEach((l: string) => addLog(channel.id, channel.name, 'info', l, 'ANALYZE'));

      // 2. Video (這一步最容易超時，後端已優化)
      updateChannel(channel.id, { currentStep: 1, stepLabel: PIPELINE_STEPS[1].desc });
      const res2 = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'video', metadata: data1.metadata })
      });
      const data2 = await res2.json();
      if (!data2.success) throw new Error(data2.error || "影片生成失敗");
      data2.logs?.forEach((l: string) => addLog(channel.id, channel.name, 'info', l, 'VEO'));

      // 3. Upload
      updateChannel(channel.id, { currentStep: 2, stepLabel: PIPELINE_STEPS[2].desc });
      const res3 = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'upload', channelConfig: channel, metadata: data1.metadata, videoAsset: data2.videoAsset })
      });
      const data3 = await res3.json();
      if (!data3.success) throw new Error(data3.error || "發布階段失敗");
      
      addLog(channel.id, channel.name, 'success', `流程圓滿完成！影片 ID: ${data3.uploadId}`, 'FINISH');
      updateChannel(channel.id, { 
        status: 'success', 
        currentStep: 3, 
        stepLabel: '已完成',
        results: { trends: data1.trends, winner: data1.winner, metadata: data1.metadata }
      });

    } catch (e: any) {
      addLog(channel.id, channel.name, 'error', `管線失敗: ${e.message}`, 'CRITICAL');
      updateChannel(channel.id, { status: 'error', stepLabel: '執行中斷' });
    }
  };

  const createChannel = () => {
    const newChan: ChannelConfig = {
      id: Date.now().toString(),
      name: newChannelName || "我的頻道",
      regionCode: "TW",
      searchKeywords: ["AI"],
      channelState: { niche: newNiche, avg_views: 0, target_audience: "科技愛好者" },
      schedule: { active: false, privacy_status: 'private' },
      auth: null,
      status: 'idle'
    };
    setChannels([...channels, newChan]);
    setIsAdding(false);
  };

  if (isLoading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-indigo-500 font-mono italic animate-pulse">REBOOTING_SYSTEM_V4...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-white italic shadow-lg shadow-indigo-500/20">S</div>
          <h1 className="text-xl font-black uppercase italic tracking-tighter">Shorts<span className="text-indigo-500">Pilot</span></h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex gap-3 text-[10px] font-black uppercase tracking-widest bg-slate-800 px-4 py-2 rounded-xl border border-slate-700">
             <span className={sysStatus?.api_key ? "text-emerald-500" : "text-red-500"}>GEMINI: {sysStatus?.api_key ? "OK" : "MISSING"}</span>
             <span className={sysStatus?.oauth ? "text-emerald-500" : "text-red-500"}>OAUTH: {sysStatus?.oauth ? "OK" : "MISSING"}</span>
          </div>
          <button onClick={() => setActiveTab('dashboard')} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>控制台</button>
          <button onClick={() => setActiveTab('logs')} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'logs' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>日誌</button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {activeTab === 'dashboard' ? (
          <div className="space-y-8 animate-fade-in">
            <div className="flex justify-between items-end bg-slate-900/40 p-10 rounded-[2rem] border border-slate-800/50">
               <div>
                 <h2 className="text-4xl font-black text-white tracking-tight italic">Shorts Automation</h2>
                 <p className="text-slate-500 text-sm mt-2">穩定版本 v4.0.1 | 分段管線模式已啟用</p>
               </div>
               <button onClick={() => setIsAdding(true)} className="px-10 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black shadow-xl shadow-indigo-900/30 transition-all">+ 新增頻道</button>
            </div>

            {isAdding && (
               <div className="bg-slate-900 border border-slate-700 rounded-[2rem] p-10 animate-slide-down">
                 <div className="grid grid-cols-2 gap-8 mb-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">頻道標籤</label>
                      <input value={newChannelName} onChange={e => setNewChannelName(e.target.value)} placeholder="我的科技頻道" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">主軸 Niche</label>
                      <input value={newNiche} onChange={e => setNewNiche(e.target.value)} placeholder="AI 生活應用" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                 </div>
                 <div className="flex justify-end gap-4">
                    <button onClick={() => setIsAdding(false)} className="px-6 py-2 text-slate-500 font-bold">取消</button>
                    <button onClick={createChannel} className="px-10 py-3 bg-indigo-600 text-white rounded-xl font-black">建立並儲存</button>
                 </div>
               </div>
            )}

            <div className="grid grid-cols-1 gap-6">
              {channels.map(channel => (
                <div key={channel.id} className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 hover:border-slate-700 transition-all relative overflow-hidden group">
                  <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-8 relative z-10">
                    <div className="flex-1">
                       <div className="flex items-center gap-4 mb-4">
                         <h3 className="text-2xl font-black text-white">{channel.name}</h3>
                         <span className={`px-3 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase ${channel.status === 'running' ? 'bg-indigo-600 animate-pulse' : 'bg-slate-800 text-slate-500'}`}>{channel.status}</span>
                       </div>
                       <div className="flex gap-4 text-xs font-bold text-slate-500 uppercase italic">
                         <span className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">{channel.channelState.niche}</span>
                         {channel.auth ? <span className="text-emerald-500 self-center">✓ 帳號已連動</span> : <span className="text-amber-500 self-center">! 未連動 YouTube</span>}
                       </div>
                    </div>
                    <div className="flex gap-4">
                      {!channel.auth ? (
                         <button onClick={() => { localStorage.setItem('sas_pending_auth_id', channel.id); fetch('/api/auth?action=url').then(r => r.json()).then(d => window.location.href = d.url); }} className="px-8 py-4 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl font-black shadow-lg shadow-amber-900/20">連結 YouTube</button>
                      ) : (
                        <button onClick={() => runAutomation(channel)} disabled={channel.status === 'running'} className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-2xl font-black shadow-xl shadow-indigo-900/20 transition-all">
                          {channel.status === 'running' ? '管線處理中...' : '執行全自動流程'}
                        </button>
                      )}
                      <button onClick={() => setChannels(channels.filter(c => c.id !== channel.id))} className="p-4 bg-slate-800 hover:bg-red-600 text-slate-500 hover:text-white rounded-2xl transition-all">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 00-16.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>

                  {channel.status === 'running' && (
                    <div className="mt-8 p-8 bg-slate-950/50 rounded-3xl border border-slate-800 ring-1 ring-indigo-500/20 animate-fade-in">
                      <div className="flex justify-between items-end mb-6">
                         <div className="space-y-1">
                           <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] flex items-center gap-2">
                             <span className="w-2 h-2 bg-indigo-500 rounded-full animate-ping"></span>
                             PIPELINE_ACTIVE
                           </span>
                           <h4 className="text-xl font-bold text-white italic">{channel.stepLabel}</h4>
                         </div>
                         <span className="text-xs font-mono text-slate-600">STG {channel.currentStep} / 3</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-600 transition-all duration-1000 ease-out" style={{ width: `${(channel.currentStep! + 1) * 33.3}%` }}></div>
                      </div>
                    </div>
                  )}

                  {channel.status === 'success' && channel.results && (
                     <div className="mt-8 grid grid-cols-2 gap-6 animate-slide-down">
                        <div className="bg-slate-950 p-6 rounded-3xl border border-slate-800">
                           <h4 className="text-[10px] font-black text-slate-600 uppercase mb-4 tracking-widest flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span> 趨勢結果</h4>
                           <div className="space-y-3">
                             {channel.results.trends?.slice(0, 3).map((t, i) => (
                               <p key={i} className="text-[11px] text-slate-400 truncate font-medium">#{i+1} {t.title}</p>
                             ))}
                           </div>
                        </div>
                        <div className="bg-slate-950 p-6 rounded-3xl border border-slate-800">
                           <h4 className="text-[10px] font-black text-emerald-500 uppercase mb-4 tracking-widest flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 企劃成果</h4>
                           <p className="text-[11px] font-bold text-white leading-tight italic truncate">{channel.results.metadata?.title_template}</p>
                        </div>
                     </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] overflow-hidden shadow-2xl animate-fade-in">
            <div className="p-8 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
              <h3 className="text-xl font-black text-white uppercase tracking-widest italic">Core Logs</h3>
              <button onClick={() => setLogs([])} className="text-[10px] font-black text-red-500 uppercase bg-red-500/10 px-4 py-2 rounded-lg border border-red-500/20 hover:bg-red-500 hover:text-white transition-all">Clear Logs</button>
            </div>
            <div className="h-[600px] overflow-y-auto p-8 font-mono text-[10px] space-y-2 bg-slate-950/80">
              {logs.map(log => (
                <div key={log.id} className="flex gap-4 p-3 rounded-xl hover:bg-slate-900 border border-transparent hover:border-slate-800 group">
                  <span className="text-slate-600 shrink-0 opacity-40">[{log.timestamp}]</span>
                  <span className={`shrink-0 px-2 py-0.5 rounded text-[8px] font-black ${log.level === 'error' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-500 group-hover:text-slate-300'}`}>{log.phase || 'SYSTEM'}</span>
                  <span className={`shrink-0 font-black ${log.level === 'error' ? 'text-red-500' : 'text-indigo-400'}`}>@{log.channelName}</span>
                  <span className={log.level === 'error' ? 'text-red-300' : 'text-slate-400 group-hover:text-slate-200'}>{log.message}</span>
                </div>
              ))}
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
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-12 font-mono">
          <div className="max-w-xl w-full bg-slate-900 border border-red-900/30 rounded-[3rem] p-16 text-center shadow-2xl">
            <h1 className="text-3xl font-black text-red-500 mb-6 italic">KERNEL_CRASH</h1>
            <div className="bg-black/50 p-8 rounded-2xl mb-10 text-left text-xs text-red-400 overflow-auto border border-red-900/20 max-h-48 scrollbar-thin scrollbar-thumb-red-900">
              {this.state.error?.message}
            </div>
            <button onClick={() => window.location.reload()} className="px-12 py-5 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-black text-lg transition-all shadow-xl shadow-red-900/30">REBOOT SYSTEM</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default App;
