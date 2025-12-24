
import React, { useState, useEffect, useRef } from 'react';
import { ChannelConfig } from './types';

const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const channelsRef = useRef<ChannelConfig[]>([]);
  
  useEffect(() => { channelsRef.current = channels; }, [channels]);

  const [isEngineActive, setIsEngineActive] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCoreId, setEditingCoreId] = useState<string | null>(null);
  const [isAnyChannelRendering, setIsAnyChannelRendering] = useState(false);
  
  const abortControllers = useRef<Record<string, AbortController>>({});
  const [globalLog, setGlobalLog] = useState<string[]>([]);

  const addLog = (msg: string) => {
    const now = new Date();
    setGlobalLog(p => [`[${now.toLocaleTimeString()}] ${msg}`, ...p].slice(0, 50));
  };

  const updateChannel = (id: string, up: Partial<ChannelConfig>) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, ...up } : c));
  };

  const runPipeline = async (channel: ChannelConfig) => {
    if (isAnyChannelRendering) return;
    setIsAnyChannelRendering(true);
    const controller = new AbortController();
    abortControllers.current[channel.id] = controller;

    try {
      updateChannel(channel.id, { status: 'running', step: 5, lastLog: '正在啟動雙軌趨勢分析...' });
      
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'analyze', channel }),
        signal: controller.signal
      });
      
      const d1 = await res.json();
      if (!d1.success) throw new Error(d1.error);
      
      addLog(`🧠 [${channel.name}] 策略生成完成：${d1.metadata.strategy_note}`);
      updateChannel(channel.id, { step: 30, lastLog: '影片生成與上傳中...' });

      const res2 = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'render_and_upload', channel, metadata: d1.metadata }),
        signal: controller.signal
      });

      const d2 = await res2.json();
      if (!d2.success) throw new Error(d2.error);

      // --- 新增：處理 Token 自動刷新 ---
      if (d2.updatedAuth) {
        addLog(`🔄 [${channel.name}] 授權已過期，系統已自動刷新 Token。`);
        updateChannel(channel.id, { auth: d2.updatedAuth });
      }

      addLog(`🎉 [${channel.name}] 任務完成！影片 ID: ${d2.videoId}`);
      updateChannel(channel.id, { status: 'success', step: 100, lastLog: `發布成功！ID: ${d2.videoId}` });
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        addLog(`❌ [${channel.name}] ${e.message}`);
        updateChannel(channel.id, { status: 'error', lastLog: e.message });
      }
    } finally {
      setIsAnyChannelRendering(false);
    }
  };

  // 初始化與存取邏輯
  useEffect(() => {
    const savedData = localStorage.getItem('pilot_onyx_v8_data');
    if (savedData) setChannels(JSON.parse(savedData));
    
    // 處理 OAuth 回傳
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const pendingId = localStorage.getItem('pilot_pending_auth_id');
    if (code && pendingId) {
      fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setChannels(prev => prev.map(c => c.id === pendingId ? { ...c, auth: d.tokens } : c));
          addLog("✅ YouTube 授權綁定成功。");
          window.history.replaceState({}, '', '/');
        }
      });
      localStorage.removeItem('pilot_pending_auth_id');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('pilot_onyx_v8_data', JSON.stringify(channels));
  }, [channels]);

  return (
    <div className="min-h-screen bg-black text-white font-sans">
      <nav className="p-8 border-b border-zinc-900 flex justify-between items-center bg-black/80 backdrop-blur-2xl sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-black font-black italic shadow-[0_0_30px_rgba(255,255,255,0.1)]">S</div>
          <div>
            <h1 className="text-xl font-black italic tracking-tighter uppercase leading-none">ShortsPilot <span className="text-zinc-600">v8.11</span></h1>
            <div className="flex items-center gap-2 mt-2">
              <div className={`w-2 h-2 rounded-full ${isEngineActive ? 'bg-cyan-500 animate-pulse' : 'bg-zinc-800'}`}></div>
              <span className="text-[9px] font-black uppercase text-zinc-500 tracking-widest">System Ready</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => { setEditingCoreId(null); setIsModalOpen(true); }} className="px-8 py-3.5 bg-white text-black rounded-full font-black text-[10px] uppercase hover:invert transition-all">Establish Core</button>
        </div>
      </nav>

      <main className="p-10 max-w-7xl mx-auto flex flex-col lg:flex-row gap-10">
        <div className="flex-1 space-y-6">
          {channels.length === 0 && <div className="py-20 text-center opacity-30 font-black italic uppercase">No Active Cores</div>}
          {channels.map(c => (
            <div key={c.id} className={`bg-zinc-950 border rounded-[3rem] p-8 transition-all ${c.status === 'running' ? 'border-cyan-500' : 'border-zinc-900'}`}>
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-black italic uppercase tracking-tighter">{c.name}</h2>
                  <div className="flex gap-2 mt-2">
                    <span className="text-[9px] font-black px-3 py-1 bg-zinc-900 text-zinc-500 rounded-full">{c.niche}</span>
                    {c.auth ? <span className="text-[9px] font-black px-3 py-1 bg-green-500/10 text-green-500 rounded-full">AUTH_OK</span> : <button onClick={() => { localStorage.setItem('pilot_pending_auth_id', c.id); window.location.href='/api/auth?action=url'; }} className="text-[9px] font-black px-3 py-1 bg-red-500/10 text-red-500 rounded-full">LINK_YT</button>}
                  </div>
                  <p className={`mt-4 text-[11px] font-bold ${c.status === 'error' ? 'text-red-500' : 'text-zinc-500'}`}>{c.lastLog || 'Standby.'}</p>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <button disabled={isAnyChannelRendering || !c.auth} onClick={() => runPipeline(c)} className={`px-10 py-4 rounded-full font-black text-[10px] uppercase transition-all ${c.status === 'running' ? 'bg-zinc-900 text-zinc-700' : 'bg-white text-black hover:invert'}`}>{c.status === 'running' ? 'Processing...' : 'Manual Burst'}</button>
                  <button onClick={() => setChannels(channels.filter(x => x.id !== c.id))} className="text-[8px] font-black text-zinc-800 hover:text-red-500 transition-colors uppercase tracking-widest">Destroy Core</button>
                </div>
              </div>
              {c.status === 'running' && (
                <div className="mt-8 h-1 bg-zinc-900 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500 shadow-[0_0_15px_cyan] transition-all duration-1000" style={{ width: `${c.step}%` }}></div>
                </div>
              )}
            </div>
          ))}
        </div>

        <aside className="w-full lg:w-80 space-y-4">
          <div className="bg-zinc-950 border border-zinc-900 rounded-[2rem] p-6 h-[500px] overflow-hidden flex flex-col">
            <h3 className="text-[10px] font-black text-zinc-700 uppercase tracking-widest mb-6">Telemetry</h3>
            <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar font-mono text-[9px]">
              {globalLog.map((log, i) => (
                <div key={i} className={`p-2 border-b border-zinc-900/50 ${log.includes('❌') ? 'text-red-500' : log.includes('✅') ? 'text-cyan-500' : 'text-zinc-600'}`}>{log}</div>
              ))}
            </div>
          </div>
        </aside>
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-6 z-[200]">
          <div className="bg-zinc-950 border border-zinc-900 p-10 rounded-[3rem] w-full max-w-md space-y-6">
            <h2 className="text-2xl font-black italic text-center uppercase">Init Core</h2>
            <div className="space-y-4">
              <input id="n-name" className="w-full bg-zinc-900 p-4 rounded-2xl text-sm font-bold outline-none" placeholder="CORE_NAME" />
              <input id="n-niche" className="w-full bg-zinc-900 p-4 rounded-2xl text-sm font-bold outline-none" placeholder="NICHE (E.G. CAT, TECH)" />
              <select id="n-lang" className="w-full bg-zinc-900 p-4 rounded-2xl text-sm font-bold outline-none">
                <option value="zh-TW">繁體中文</option>
                <option value="en">English</option>
              </select>
            </div>
            <div className="flex gap-4">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 text-[10px] font-black uppercase text-zinc-500">Abort</button>
              <button onClick={() => {
                const name = (document.getElementById('n-name') as HTMLInputElement).value;
                const niche = (document.getElementById('n-niche') as HTMLInputElement).value;
                const lang = (document.getElementById('n-lang') as HTMLSelectElement).value;
                if (!name || !niche) return;
                setChannels([...channels, { id: Date.now().toString(), name, niche, language: lang as any, status: 'idle', step: 0, auth: null, autoDeploy: false }]);
                setIsModalOpen(false);
              }} className="flex-1 bg-white text-black p-4 rounded-2xl text-[10px] font-black uppercase">Establish</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
