
import React, { useState, useEffect, useRef } from 'react';
import { ChannelConfig } from './types';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getDatabase, ref, onValue, set, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "..." ,
  appId: "..."
};

const DAYS_NAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const sleep = (ms: number, signal?: AbortSignal) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
};

const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const channelsRef = useRef<ChannelConfig[]>([]);
  useEffect(() => { channelsRef.current = channels; }, [channels]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEngineActive, setIsEngineActive] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<'connected' | 'disconnected'>('disconnected');
  
  const isRenderingRef = useRef(false);
  const [isAnyChannelRendering, setIsAnyChannelRendering] = useState(false);
  
  const abortControllers = useRef<Record<string, AbortController>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dbRef = useRef<any>(null);
  
  const [globalLog, setGlobalLog] = useState<string[]>([]);
  const addLog = (msg: string) => setGlobalLog(p => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p].slice(0, 30));

  const [newChan, setNewChan] = useState({ 
    name: '', niche: 'AI 科技', language: 'zh-TW' as 'zh-TW' | 'en',
    autoDeploy: false,
    weeklySchedule: {
      days: [] as number[],
      times: ['', '', ''] as string[]
    }
  });

  useEffect(() => {
    try {
      const app = initializeApp(firebaseConfig);
      dbRef.current = getDatabase(app);
      setCloudStatus('connected');
    } catch (e) {
      console.error("Firebase Init Failed", e);
    }
  }, []);

  useEffect(() => {
    let timer: any;
    if (isEngineActive) {
      addLog("🚀 自動排程引擎啟動 (30s 輪詢間隔)");
      checkSchedules();
      timer = setInterval(() => {
        checkSchedules();
      }, 30000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [isEngineActive]);

  useEffect(() => {
    const saved = localStorage.getItem('pilot_onyx_v8_data');
    if (saved) setChannels(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('pilot_onyx_v8_data', JSON.stringify(channels));
  }, [channels]);

  const setRenderingState = (val: boolean) => {
    isRenderingRef.current = val;
    setIsAnyChannelRendering(val);
  };

  /**
   * 系統淨化 (Hard Reset)
   * 用於解決任何 UI 卡死、狀態異常或需要重新配置的情況
   */
  const systemPurge = () => {
    const confirm1 = window.confirm("⚠️ 警告：這將會終止所有執行中任務並清除所有頻道資料，確定執行「系統淨化」嗎？");
    if (!confirm1) return;

    const confirm2 = window.prompt("請輸入「PURGE」以確認執行硬核重置：");
    if (confirm2 !== "PURGE") {
      alert("驗證失敗，取消操作。");
      return;
    }

    // 1. 終止所有 fetch 請求
    Object.values(abortControllers.current).forEach(ctrl => ctrl.abort());
    abortControllers.current = {};

    // 2. 清除持久化資料
    localStorage.removeItem('pilot_onyx_v8_data');

    // 3. 重置所有狀態
    setChannels([]);
    setIsEngineActive(false);
    setRenderingState(false);
    setGlobalLog([`[${new Date().toLocaleTimeString()}] 🛡️ 系統已成功淨化，核心重置完成。`]);
    
    addLog("✅ 系統已重置為初始狀態");
  };

  const toggleEngine = () => {
    const newStatus = !isEngineActive;
    setIsEngineActive(newStatus);
    if (!newStatus) {
      if (audioRef.current) audioRef.current.pause();
      addLog("🛑 引擎已關閉");
    }
  };

  const checkSchedules = () => {
    if (isRenderingRef.current) return;

    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    for (const channel of channelsRef.current) {
      if (!channel.autoDeploy || !channel.weeklySchedule || channel.status === 'running') continue;

      const isToday = channel.weeklySchedule.days.includes(currentDay);
      const isCorrectTime = channel.weeklySchedule.times.includes(currentTime);
      const slotId = `${currentDay}_${currentTime}`;

      if (isToday && isCorrectTime && channel.lastTriggeredSlot !== slotId) {
        runPipeline(channel, slotId);
        break; 
      }
    }
  };

  const abortPipeline = (id: string) => {
    if (abortControllers.current[id]) {
      abortControllers.current[id].abort();
      addLog(`⚡ 強制中斷任務: ${id}`);
      setChannels(p => p.map(c => c.id === id ? { ...c, status: 'idle', lastLog: '已手動中斷', step: 0 } : c));
      setRenderingState(false);
    } else {
      // 如果 Controller 失效但狀態卡死，點擊終止時強制手動重置該卡片
      setChannels(p => p.map(c => c.id === id ? { ...c, status: 'idle', lastLog: '狀態強制重置', step: 0 } : c));
      setRenderingState(false);
    }
  };

  const runPipeline = async (channel: ChannelConfig, slotId?: string) => {
    if (isRenderingRef.current) return;
    
    setRenderingState(true);
    const controller = new AbortController();
    abortControllers.current[channel.id] = controller;

    const update = (up: Partial<ChannelConfig>) => {
      setChannels(p => p.map(c => c.id === channel.id ? { ...c, ...up } : c));
    };

    update({ 
      status: 'running', 
      step: 5, 
      lastLog: '啟動初始化...',
      lastTriggeredSlot: slotId || channel.lastTriggeredSlot 
    });

    try {
      addLog(`▶ [${channel.name}] 開始執行分析...`);
      const r1 = await fetch('/api/pipeline', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'analyze', channel }),
        signal: controller.signal
      });
      const d1 = await r1.json();
      if (!d1.success) throw new Error(d1.error);

      if (controller.signal.aborted) return;

      update({ step: 35, lastLog: '分析完成，API 保護冷卻 10 秒...' });
      await sleep(10000, controller.signal);

      addLog(`🎬 [${channel.name}] 開始渲染影片...`);
      update({ step: 40, lastLog: 'Veo 渲染中...' });

      const r2 = await fetch('/api/pipeline', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'render_and_upload', channel, metadata: d1.metadata }),
        signal: controller.signal
      });
      const d2 = await r2.json();
      
      if (!d2.success) {
        if (d2.isQuotaError) {
          addLog("⚠️ 觸發 RPM 限制，將在下一輪嘗試...");
          update({ lastLog: 'API 限額重試中', status: 'idle', step: 0 });
          return;
        }
        throw new Error(d2.error);
      }

      update({ 
        status: 'success', step: 100, 
        lastLog: `完成發布: ${d2.videoId}`,
        lastRun: new Date().toISOString()
      });
      addLog(`✅ [${channel.name}] 任務圓滿完成`);

    } catch (e: any) {
      if (e.name === 'AbortError') return;
      update({ status: 'error', lastLog: `錯誤: ${e.message}`, step: 0 });
      addLog(`❌ [${channel.name}] 失敗: ${e.message}`);
    } finally {
      addLog("🛡️ 進入 30 秒安全冷卻期...");
      await sleep(30000); 
      setRenderingState(false);
      delete abortControllers.current[channel.id];
    }
  };

  const openEditModal = (c?: ChannelConfig) => {
    if (c) {
      setEditingId(c.id);
      setNewChan({
        name: c.name, niche: c.niche, language: c.language || 'zh-TW',
        autoDeploy: c.autoDeploy,
        weeklySchedule: c.weeklySchedule || { days: [], times: ['', '', ''] }
      });
    } else {
      setEditingId(null);
      setNewChan({
        name: '', niche: 'AI 科技', language: 'zh-TW',
        autoDeploy: false,
        weeklySchedule: { days: [], times: ['', '', ''] }
      });
    }
    setIsModalOpen(true);
  };

  const saveChannel = () => {
    if (!newChan.name) return;
    const cleanTimes = newChan.weeklySchedule.times.filter(t => t !== '');
    const configToSave = { ...newChan, weeklySchedule: { ...newChan.weeklySchedule, times: cleanTimes } };

    if (editingId) {
      setChannels(channels.map(c => c.id === editingId ? { ...c, ...configToSave } : c));
    } else {
      const c: ChannelConfig = {
        id: Math.random().toString(36).substr(2, 9),
        status: 'idle', step: 0, auth: null,
        ...configToSave
      };
      setChannels([...channels, c]);
    }
    setIsModalOpen(false);
  };

  const toggleDay = (day: number) => {
    const days = [...newChan.weeklySchedule.days];
    const idx = days.indexOf(day);
    if (idx > -1) days.splice(idx, 1);
    else days.push(day);
    setNewChan({ ...newChan, weeklySchedule: { ...newChan.weeklySchedule, days } });
  };

  return (
    <div className="min-h-screen bg-black flex flex-col text-white font-sans selection:bg-cyan-500">
      <nav className="p-8 border-b border-zinc-900 flex justify-between items-center bg-black/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center font-black italic text-black text-xl shadow-[0_0_20px_rgba(255,255,255,0.2)]">S</div>
          <div>
            <h1 className="text-2xl font-black italic uppercase tracking-tighter leading-none">ShortsPilot <span className="text-zinc-600">ONYX</span></h1>
            <div className="flex items-center gap-3 mt-2">
              <span className={`w-2 h-2 rounded-full ${cloudStatus === 'connected' ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500'}`}></span>
              <span className="text-[8px] font-black uppercase text-zinc-500 tracking-widest">Active Guard / {isEngineActive ? 'Engine On' : 'Engine Off'}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-4">
          <button onClick={systemPurge} className="px-6 py-3 border border-red-900/50 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 rounded-full font-black text-[9px] uppercase tracking-widest transition-all">
            System Purge
          </button>
          <button onClick={toggleEngine} className={`px-8 py-3 rounded-full font-black text-[10px] uppercase tracking-widest border transition-all ${isEngineActive ? 'border-cyan-500 text-cyan-500 bg-cyan-500/10 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'border-zinc-800 text-zinc-600'}`}>
            {isEngineActive ? 'System Live' : 'Ignite Engine'}
          </button>
          <button onClick={() => openEditModal()} className="px-10 py-3 bg-white text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all">
            Init Core
          </button>
        </div>
      </nav>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 p-10 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            {channels.length === 0 && (
              <div className="text-center py-20 border-2 border-dashed border-zinc-900 rounded-[3rem]">
                <p className="text-zinc-600 font-black uppercase tracking-[0.3em] text-[10px]">No active cores. Protocol initialized.</p>
              </div>
            )}
            {channels.map(c => (
              <div key={c.id} className={`bg-zinc-950 border rounded-[2.5rem] p-8 transition-all ${c.status === 'running' ? 'border-cyan-500 ring-1 ring-cyan-500/20 shadow-[0_0_30px_rgba(6,182,212,0.1)]' : 'border-zinc-900'}`}>
                <div className="flex justify-between items-center">
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <h2 className="text-2xl font-black italic uppercase tracking-tight">{c.name}</h2>
                      {c.autoDeploy && <span className="bg-cyan-500 text-black text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Auto Cycle</span>}
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      {c.weeklySchedule?.days.sort().map(d => (
                        <span key={d} className="bg-zinc-900 text-zinc-500 text-[9px] font-black px-2 py-1 rounded border border-zinc-800">{DAYS_NAME[d]}</span>
                      ))}
                      {c.weeklySchedule?.times.map((t, idx) => (
                        <span key={idx} className="bg-zinc-900 text-cyan-500/80 text-[9px] font-black px-2 py-1 rounded border border-cyan-900/20">🕒 {t}</span>
                      ))}
                    </div>

                    <p className={`text-[11px] font-bold ${c.status === 'error' ? 'text-red-500' : 'text-zinc-600'}`}>{c.lastLog || 'System Standby'}</p>
                  </div>
                  <div className="flex gap-4">
                    {c.status !== 'running' && (
                      <button onClick={() => openEditModal(c)} className="w-14 h-14 flex items-center justify-center rounded-2xl bg-zinc-900 text-zinc-600 hover:text-white border border-zinc-800 transition-all">✎</button>
                    )}
                    
                    {c.status === 'running' ? (
                      <button onClick={() => abortPipeline(c.id)} className="px-10 py-5 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-black text-[10px] uppercase shadow-[0_0_20px_rgba(220,38,38,0.3)] transition-all animate-pulse">Force Kill</button>
                    ) : (
                      <button disabled={isAnyChannelRendering} onClick={() => runPipeline(c)} className={`px-12 py-5 rounded-2xl font-black text-[10px] uppercase transition-all ${isAnyChannelRendering ? 'bg-zinc-900 text-zinc-700' : 'bg-white text-black hover:invert'}`}>
                        {isAnyChannelRendering ? 'Lockdown' : 'Launch'}
                      </button>
                    )}
                  </div>
                </div>
                {c.status === 'running' && (
                  <div className="mt-8 space-y-3">
                    <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500 transition-all duration-1000 shadow-[0_0_10px_#06b6d4]" style={{ width: `${c.step}%` }}></div>
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-[8px] text-zinc-700 uppercase font-black tracking-widest animate-pulse">Running Neural Pipeline...</p>
                      <span className="text-[10px] font-black text-cyan-500">{c.step}%</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </main>

        <aside className="w-full lg:w-[420px] border-l border-zinc-900 bg-black flex flex-col p-10">
          <div className="space-y-8">
            <div className="p-8 bg-zinc-950 rounded-[2.5rem] border border-zinc-900 space-y-4">
              <h4 className="text-[10px] font-black text-cyan-500 uppercase tracking-widest">RPM Safeguard</h4>
              <div className="space-y-3">
                <div className="flex justify-between text-[11px] font-bold">
                  <span className="text-zinc-600">Lock Status</span>
                  <span className={isAnyChannelRendering ? 'text-yellow-500' : 'text-green-500'}>{isAnyChannelRendering ? 'LOCKDOWN' : 'UNLOCKED'}</span>
                </div>
                <div className="flex justify-between text-[11px] font-bold">
                  <span className="text-zinc-600">Post-Cooling</span>
                  <span className="text-zinc-400">30.0 SEC</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-zinc-800 uppercase tracking-[0.4em] text-center italic">Neural Logs</h3>
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                {globalLog.length === 0 && <p className="text-center text-zinc-800 text-[9px] uppercase font-black py-10">Waiting for signals...</p>}
                {globalLog.map((log, i) => (
                  <div key={i} className={`p-5 rounded-[1.5rem] border border-zinc-900 bg-zinc-950/50 text-[10px] font-bold leading-relaxed ${log.includes('✅') ? 'text-cyan-400 border-cyan-900/10' : log.includes('🛡️') ? 'text-yellow-500' : log.includes('❌') ? 'text-red-400 border-red-900/10' : 'text-zinc-500'}`}>
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl flex items-center justify-center p-8 z-[100]">
          <div className="bg-zinc-950 border border-zinc-900 w-full max-w-2xl rounded-[3rem] p-12 space-y-10 overflow-y-auto max-h-[90vh]">
            <h2 className="text-4xl font-black italic uppercase tracking-tighter">Core Config</h2>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-zinc-600 tracking-widest ml-4">Channel Name</label>
                <input className="w-full bg-zinc-900 border-none rounded-2xl p-6 text-sm font-bold text-white outline-none" value={newChan.name} onChange={e => setNewChan({...newChan, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-zinc-600 tracking-widest ml-4">Niche</label>
                <input className="w-full bg-zinc-900 border-none rounded-2xl p-6 text-sm font-bold text-white outline-none" value={newChan.niche} onChange={e => setNewChan({...newChan, niche: e.target.value})} />
              </div>
            </div>

            <div className="p-8 bg-zinc-900/50 rounded-[2.5rem] space-y-8 border border-zinc-800/50">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-black uppercase italic">Deployment Schedule</h3>
                <button onClick={() => setNewChan({...newChan, autoDeploy: !newChan.autoDeploy})} className={`w-14 h-7 rounded-full relative transition-all ${newChan.autoDeploy ? 'bg-cyan-500 shadow-[0_0_15px_#06b6d4]' : 'bg-zinc-800'}`}>
                  <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${newChan.autoDeploy ? 'right-1' : 'left-1'}`}></div>
                </button>
              </div>

              {newChan.autoDeploy && (
                <div className="space-y-8 animate-fade-in">
                  <div className="flex justify-between gap-2">
                    {DAYS_NAME.map((name, i) => (
                      <button key={name} onClick={() => toggleDay(i)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all border ${newChan.weeklySchedule.days.includes(i) ? 'bg-cyan-500 text-black border-cyan-400' : 'bg-zinc-950 text-zinc-700 border-zinc-900'}`}>
                        {name}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    {[0, 1, 2].map(idx => (
                      <div key={idx} className="space-y-2">
                        <label className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">Slot {idx+1}</label>
                        <input type="time" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-xs font-black text-white focus:border-cyan-500 outline-none" value={newChan.weeklySchedule.times[idx]} onChange={e => {
                          const times = [...newChan.weeklySchedule.times];
                          times[idx] = e.target.value;
                          setNewChan({...newChan, weeklySchedule: { ...newChan.weeklySchedule, times }});
                        }} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-6 pt-4 border-t border-zinc-900">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 py-6 text-zinc-600 font-black uppercase text-[11px] tracking-widest">Discard</button>
              <button onClick={saveChannel} className="flex-1 py-6 bg-white text-black rounded-[2rem] font-black uppercase text-[11px] tracking-widest shadow-2xl hover:bg-cyan-400 transition-all">Save Config</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
