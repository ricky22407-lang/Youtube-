
import React, { useState, useEffect, useRef } from 'react';
import { ChannelConfig } from './types';

const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const channelsRef = useRef<ChannelConfig[]>([]);
  
  useEffect(() => { 
    channelsRef.current = channels; 
  }, [channels]);

  const [isEngineActive, setIsEngineActive] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAnyChannelRendering, setIsAnyChannelRendering] = useState(false);
  
  const abortControllers = useRef<Record<string, AbortController>>({});
  const [globalLog, setGlobalLog] = useState<string[]>([]);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  // 初始化：載入資料與 API Key 檢查
  useEffect(() => {
    const init = async () => {
      const win = window as any;
      if (win.aistudio?.hasSelectedApiKey) {
        setHasApiKey(await win.aistudio.hasSelectedApiKey());
      } else {
        setHasApiKey(true);
      }

      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const pendingId = localStorage.getItem('pilot_pending_auth_id');

      if (code && pendingId) {
        addLog("🔑 偵測到 YouTube 授權代碼，正在交換權杖...");
        try {
          const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
          });
          const data = await res.json();
          if (data.success) {
            setChannels(prev => prev.map(c => c.id === pendingId ? { ...c, auth: data.tokens } : c));
            addLog(`✅ 授權成功！核心與 YouTube 已連結。`);
            window.history.replaceState({}, document.title, window.location.pathname);
          } else {
            addLog(`❌ 授權失敗: ${data.error}`);
          }
        } catch (e: any) {
          addLog(`❌ 網路異常: ${e.message}`);
        }
        localStorage.removeItem('pilot_pending_auth_id');
      }
    };

    const savedData = localStorage.getItem('pilot_onyx_v8_data');
    if (savedData) setChannels(JSON.parse(savedData));
    
    const savedEngine = localStorage.getItem('pilot_engine_active');
    if (savedEngine) setIsEngineActive(JSON.parse(savedEngine));

    init();
  }, []);

  // 持久化儲存
  useEffect(() => {
    localStorage.setItem('pilot_onyx_v8_data', JSON.stringify(channels));
  }, [channels]);

  useEffect(() => {
    localStorage.setItem('pilot_engine_active', JSON.stringify(isEngineActive));
  }, [isEngineActive]);

  // 排程引擎心跳：每分鐘檢查一次
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isEngineActive || isAnyChannelRendering) return;

      const now = new Date();
      const currentDay = now.getDay();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const slotKey = `${currentDay}_${currentTime}`;

      channelsRef.current.forEach(channel => {
        if (channel.autoDeploy && channel.auth && channel.status !== 'running') {
          const schedule = channel.weeklySchedule;
          if (schedule?.days.includes(currentDay) && schedule?.times.includes(currentTime)) {
            if (channel.lastTriggeredSlot !== slotKey) {
              addLog(`⏰ [${channel.name}] 排程觸發: ${currentTime}`);
              updateChannel(channel.id, { lastTriggeredSlot: slotKey });
              runPipeline(channel).catch(console.error);
            }
          }
        }
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [isEngineActive, isAnyChannelRendering]);

  const addLog = (msg: string) => {
    const now = new Date();
    const ts = now.toLocaleTimeString();
    setGlobalLog(p => [`[${ts}] ${msg}`, ...p].slice(0, 50));
  };

  const updateChannel = (id: string, up: Partial<ChannelConfig>) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, ...up } : c));
  };

  const deleteChannel = (id: string) => {
    if (window.confirm("確定要永久銷毀此頻道核心？此操作無法還原。")) {
      setChannels(prev => prev.filter(c => c.id !== id));
      addLog(`🗑️ 核心已移除: ${id}`);
    }
  };

  const startAuth = async (id: string) => {
    addLog("📡 正在向 Google 請求授權...");
    localStorage.setItem('pilot_pending_auth_id', id);
    try {
      const res = await fetch('/api/auth?action=url');
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e: any) {
      addLog(`❌ 請求失敗: ${e.message}`);
    }
  };

  const runPipeline = async (channel: ChannelConfig) => {
    if (isAnyChannelRendering) return;
    setIsAnyChannelRendering(true);
    
    const controller = new AbortController();
    abortControllers.current[channel.id] = controller;

    try {
      addLog(`🚀 [${channel.name}] 流程啟動 (${channel.language === 'en' ? 'ENG' : '繁中'})...`);
      updateChannel(channel.id, { status: 'running', step: 10, lastLog: '正在分析市場趨勢與利基組合...' });
      
      const r1 = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'analyze', channel }),
        signal: controller.signal
      });
      const d1 = await r1.json();
      if (!d1.success) throw new Error(d1.error);
      
      updateChannel(channel.id, { step: 40, lastLog: '正在進行 Veo 高畫質渲染與上傳...' });
      const r2 = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'render_and_upload', channel, metadata: d1.metadata }),
        signal: controller.signal
      });
      const d2 = await r2.json();
      if (!d2.success) throw new Error(d2.error);

      addLog(`🎉 [${channel.name}] 發布成功! 影片 ID: ${d2.videoId}`);
      updateChannel(channel.id, { status: 'success', step: 100, lastLog: `上傳成功: ${d2.videoId}` });
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        addLog(`❌ [${channel.name}] 錯誤: ${e.message}`);
        updateChannel(channel.id, { status: 'error', lastLog: e.message });
      }
    } finally {
      setIsAnyChannelRendering(false);
    }
  };

  if (hasApiKey === false) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-8">
        <div className="max-w-md w-full space-y-8 text-center">
          <h2 className="text-4xl font-black italic uppercase tracking-tighter">Billing Required</h2>
          <p className="text-zinc-500 text-sm">此應用程式需要計費 API Key 以產出影片。請點擊按鈕選取。</p>
          <button 
            onClick={async () => { await (window as any).aistudio.openSelectKey(); setHasApiKey(true); }} 
            className="w-full py-6 bg-white text-black rounded-3xl font-black uppercase tracking-widest hover:invert transition-all"
          >
            Select API Key
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col font-sans selection:bg-cyan-500/30">
      <nav className="p-8 border-b border-zinc-900 flex justify-between items-center bg-black/80 backdrop-blur-2xl sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-black font-black italic shadow-[0_0_30px_rgba(255,255,255,0.15)]">S</div>
          <div>
            <h1 className="text-xl font-black italic tracking-tighter uppercase leading-none">ShortsPilot <span className="text-zinc-600">v8.9.2</span></h1>
            <div className="flex items-center gap-2 mt-2">
              <div className={`w-2 h-2 rounded-full ${isEngineActive ? 'bg-cyan-500 animate-pulse' : 'bg-zinc-800'}`}></div>
              <span className="text-[9px] font-black uppercase text-zinc-500 tracking-widest">
                {isEngineActive ? 'Engine Operational' : 'Engine Idle'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <button 
            onClick={() => setIsEngineActive(!isEngineActive)}
            className={`px-6 py-2 rounded-full font-black text-[9px] uppercase tracking-widest transition-all ${isEngineActive ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/30' : 'bg-zinc-900 text-zinc-500 border border-zinc-800'}`}
          >
            {isEngineActive ? 'Stop Engine' : 'Start Engine'}
          </button>
          <button 
            onClick={() => setIsModalOpen(true)} 
            className="px-8 py-3.5 bg-white text-black rounded-full font-black text-[10px] uppercase hover:invert active:scale-95 transition-all"
          >
            New Core
          </button>
        </div>
      </nav>

      <main className="flex-1 p-10 flex flex-col lg:flex-row gap-10 overflow-hidden">
        <div className="flex-1 space-y-6 max-w-4xl mx-auto w-full overflow-y-auto custom-scrollbar pb-32 pr-2">
          {channels.length === 0 && (
            <div className="flex flex-col items-center justify-center py-40 border-2 border-zinc-900 border-dashed rounded-[4rem] opacity-20">
              <span className="text-[10px] font-black uppercase tracking-[0.4em] italic">No Systems Deployed</span>
            </div>
          )}
          {channels.map(c => (
            <div key={c.id} className={`bg-zinc-950 border rounded-[3.5rem] p-10 transition-all duration-500 relative ${c.status === 'running' ? 'border-cyan-500 shadow-[0_0_60px_rgba(6,182,212,0.1)]' : 'border-zinc-900 hover:border-zinc-800'}`}>
              <div className="flex justify-between items-start gap-8">
                <div className="space-y-6">
                  <div className="flex items-center gap-4 flex-wrap">
                    <h2 className="text-3xl font-black italic uppercase tracking-tighter leading-none">{c.name}</h2>
                    <div className="flex gap-2">
                       {c.auth ? 
                        <span className="text-[9px] font-black px-4 py-1.5 bg-green-500/10 text-green-500 border border-green-500/20 rounded-full tracking-[0.2em]">CONNECTED</span> :
                        <button onClick={() => { startAuth(c.id).catch(console.error); }} className="text-[9px] font-black px-4 py-1.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-full hover:bg-red-500 hover:text-white transition-all tracking-[0.2em]">LINK_YT</button>
                      }
                      <span className="text-[9px] font-black px-4 py-1.5 bg-zinc-900 text-zinc-400 border border-zinc-800 rounded-full tracking-[0.2em]">{c.language === 'en' ? 'ENG' : 'ZH-TW'}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-8">
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">Target Niches</label>
                      <p className="text-[11px] font-black text-zinc-300 uppercase truncate max-w-[200px]">{c.niche}</p>
                    </div>
                    {c.autoDeploy && (
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">Schedule</label>
                        <p className="text-[11px] font-black text-cyan-500 uppercase">{c.weeklySchedule?.times[0] || '--:--'}</p>
                      </div>
                    )}
                  </div>

                  <p className={`text-[12px] font-bold tracking-tight leading-relaxed max-w-lg ${c.status === 'error' ? 'text-red-500' : 'text-zinc-500'}`}>
                    {c.lastLog || 'System core established. Waiting for manual/auto launch.'}
                  </p>
                </div>
                
                <div className="flex flex-col gap-4 flex-shrink-0 items-end">
                  {c.status === 'running' ? (
                    <button onClick={() => abortControllers.current[c.id]?.abort()} className="px-14 py-6 bg-red-600 text-white rounded-[2.5rem] font-black text-[10px] uppercase active:scale-95 transition-all">Kill Core</button>
                  ) : (
                    <>
                      <button disabled={isAnyChannelRendering || !c.auth} onClick={() => { runPipeline(c).catch(console.error); }} className={`px-16 py-6 rounded-[2.5rem] font-black text-[10px] uppercase transition-all shadow-xl ${isAnyChannelRendering || !c.auth ? 'bg-zinc-900 text-zinc-700 opacity-50 cursor-not-allowed' : 'bg-white text-black hover:invert active:scale-95'}`}>Manual Burst</button>
                      <button onClick={() => deleteChannel(c.id)} className="px-6 py-2 text-zinc-800 hover:text-red-600 font-black text-[9px] uppercase tracking-[0.3em] transition-colors">Destroy Core</button>
                    </>
                  )}
                </div>
              </div>
              
              {c.status === 'running' && (
                <div className="mt-12 space-y-3">
                   <div className="flex justify-between">
                     <span className="text-[9px] font-black text-zinc-600 tracking-widest uppercase">Pipeline Progress</span>
                     <span className="text-[9px] font-black text-cyan-500 tracking-widest uppercase">{c.step}%</span>
                   </div>
                   <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
                     <div className="h-full bg-cyan-500 transition-all duration-700 shadow-[0_0_15px_rgba(6,182,212,0.8)]" style={{ width: `${c.step}%` }}></div>
                   </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <aside className="w-full lg:w-[420px] flex flex-col h-[calc(100vh-180px)]">
          <div className="flex-1 flex flex-col bg-zinc-950 border border-zinc-900 rounded-[3.5rem] p-10 overflow-hidden shadow-2xl">
            <h3 className="text-[10px] font-black text-zinc-700 uppercase tracking-[0.6em] text-center italic mb-10">System Telemetry</h3>
            <div className="flex-1 space-y-3 overflow-y-auto pr-3 custom-scrollbar font-mono text-[10px] leading-relaxed">
              {globalLog.map((log, i) => (
                <div key={i} className={`p-4 rounded-[1.5rem] border bg-black/40 transition-all hover:bg-black/60 ${log.includes('✅') || log.includes('🎉') ? 'text-cyan-400 border-cyan-900/20' : log.includes('❌') ? 'text-red-400 border-red-900/20' : 'text-zinc-500 border-zinc-900'}`}>
                  {log}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-3xl flex items-center justify-center p-8 z-[100] animate-fade-in">
          <div className="bg-zinc-950 border border-zinc-900 w-full max-w-2xl rounded-[4rem] p-12 space-y-10 shadow-2xl max-h-[95vh] overflow-y-auto custom-scrollbar">
            <div className="text-center">
              <h2 className="text-4xl font-black italic tracking-tighter uppercase">Initialize New Core</h2>
              <p className="text-zinc-600 text-[10px] font-bold uppercase tracking-[0.4em] mt-2">Specify Operational Parameters</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="space-y-2 px-4">
                  <label className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Core Label</label>
                  <input id="n-name" className="w-full bg-zinc-900 border-none rounded-2xl p-6 text-sm font-bold outline-none focus:ring-1 focus:ring-cyan-500" placeholder="E.G. HARBOR_AI" />
                </div>
                <div className="space-y-2 px-4">
                  <div className="flex justify-between items-end">
                    <label className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Market Niches (多選)</label>
                    <span className="text-[8px] text-zinc-500 mb-1">逗號分隔</span>
                  </div>
                  <input id="n-niche" className="w-full bg-zinc-900 border-none rounded-2xl p-6 text-sm font-bold outline-none focus:ring-1 focus:ring-cyan-500" placeholder="狗, 貓, 袋鼠, 旅遊" />
                  <p className="text-[8px] text-zinc-700 font-bold uppercase px-2 mt-1">💡 AI 會從您輸入的項目中自動組合創意。</p>
                </div>
                <div className="space-y-2 px-4">
                  <label className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Output Language</label>
                  <select id="n-lang" className="w-full bg-zinc-900 border-none rounded-2xl p-6 text-sm font-bold text-zinc-400 outline-none appearance-none focus:ring-1 focus:ring-cyan-500">
                    <option value="zh-TW">繁體中文 (ZH-TW)</option>
                    <option value="en">English (US/UK)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-zinc-900/50 p-8 rounded-[3rem] border border-zinc-900 space-y-6 shadow-inner">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Auto Deployment</label>
                    <input id="n-auto" type="checkbox" className="w-5 h-5 rounded bg-black border-zinc-800 text-cyan-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-zinc-700 uppercase tracking-widest block">Daily Run Time (HH:MM)</label>
                    <input id="n-time" type="time" defaultValue="10:00" className="w-full bg-black border border-zinc-800 rounded-xl p-4 text-xs font-black text-zinc-400 outline-none focus:border-cyan-500 transition-all" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[8px] font-black text-zinc-700 uppercase tracking-widest block">Operational Cycle Days</label>
                    <div className="flex justify-between gap-1">
                      {['S','M','T','W','T','F','S'].map((d, i) => (
                        <label key={i} className="flex-1 text-center cursor-pointer group">
                          <input type="checkbox" defaultChecked className="hidden peer n-days" value={i} />
                          <div className="py-2.5 rounded-lg bg-black border border-zinc-800 text-[10px] font-black text-zinc-700 peer-checked:bg-cyan-500 peer-checked:text-black transition-all">{d}</div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-6 pt-4">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 py-8 text-zinc-700 font-black uppercase text-[10px] tracking-[0.4em] hover:text-white transition-colors">Abort</button>
              <button onClick={() => {
                const nameInput = document.getElementById('n-name') as HTMLInputElement;
                const nicheInput = document.getElementById('n-niche') as HTMLInputElement;
                const langInput = document.getElementById('n-lang') as HTMLSelectElement;
                const autoInput = document.getElementById('n-auto') as HTMLInputElement;
                const timeInput = document.getElementById('n-time') as HTMLInputElement;
                const dayInputs = document.querySelectorAll('.n-days:checked');
                const days = Array.from(dayInputs).map(el => parseInt((el as HTMLInputElement).value));

                if (!nameInput.value) return;
                
                const newCore: ChannelConfig = {
                  id: Date.now().toString(),
                  name: nameInput.value,
                  niche: nicheInput.value,
                  language: langInput.value as any,
                  autoDeploy: autoInput.checked,
                  weeklySchedule: { days, times: [timeInput.value] },
                  status: 'idle',
                  step: 0,
                  auth: null,
                  lastLog: 'System core successfully established. Standby.'
                };

                setChannels([...channels, newCore]);
                setIsModalOpen(false);
              }} className="flex-1 py-8 bg-white text-black rounded-[2.5rem] font-black uppercase text-[10px] tracking-[0.4em] shadow-2xl hover:scale-[1.02] active:scale-95 transition-all">Establish Core</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
