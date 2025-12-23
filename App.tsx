
import React, { useState, useEffect, useRef } from 'react';
import { ChannelConfig, ScheduleConfig } from './types';

const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showGAS, setShowGAS] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [storageMode, setStorageMode] = useState<'cloud' | 'local'>('cloud');
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  
  const defaultSchedule: ScheduleConfig = { 
    activeDays: [1, 2, 3, 4, 5], 
    time: '19:00', 
    countPerDay: 1, 
    autoEnabled: true 
  };

  const [newChan, setNewChan] = useState({ 
    name: '', niche: 'AI 科技', language: 'zh-TW' as 'zh-TW' | 'en',
    schedule: { ...defaultSchedule }
  });

  const [globalLog, setGlobalLog] = useState<string[]>([]);
  const addLog = (msg: string) => setGlobalLog(p => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p].slice(0, 50));

  const getApiUrl = (endpoint: string) => {
    const base = window.location.origin;
    return `${base}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  };

  const fetchFromDB = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/db?action=list'));
      const data = await res.json();
      if (data.success) {
        setChannels(data.channels || []);
        setStorageMode('cloud');
      } else {
        setStorageMode('local');
        const localData = localStorage.getItem('onyx_local_channels');
        if (localData) setChannels(JSON.parse(localData));
      }
    } catch (e: any) {
      setStorageMode('local');
    }
    setIsLoading(false);
  };

  // 監控任務狀態，若有頻道正在執行，則啟動輪詢
  useEffect(() => {
    const hasRunningTask = channels.some(c => c.status === 'running');
    if (hasRunningTask && !pollingRef.current) {
      pollingRef.current = setInterval(() => fetchFromDB(true), 5000);
    } else if (!hasRunningTask && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [channels]);

  useEffect(() => {
    fetchFromDB();
  }, []);

  const saveToDB = async (updatedChannels: ChannelConfig[]) => {
    setChannels([...updatedChannels]);
    localStorage.setItem('onyx_local_channels', JSON.stringify(updatedChannels));
    if (storageMode === 'local') return;
    try {
      await fetch(getApiUrl('/api/db?action=sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: updatedChannels })
      });
    } catch (e) { addLog(`❌ 網路錯誤`); }
  };

  const triggerPipeline = async (channel: ChannelConfig) => {
    if (channel.status === 'running') return;
    addLog(`🚀 手動啟動頻道 [${channel.name}] 的 Onyx 流程...`);
    
    // 立即更新 UI 為執行中
    const updated = channels.map(c => c.id === channel.id ? { ...c, status: 'running' as const, step: 5, lastLog: '初始化引擎...' } : c);
    setChannels(updated);

    try {
      const res = await fetch(getApiUrl('/api/pipeline'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'full_flow', channel })
      });
      const data = await res.json();
      if (!data.success) addLog(`❌ 任務失敗: ${data.error}`);
      fetchFromDB(true);
    } catch (e: any) {
      addLog(`❌ API 錯誤: ${e.message}`);
      fetchFromDB(true);
    }
  };

  const toggleDay = (day: number) => {
    const days = [...newChan.schedule.activeDays];
    const index = days.indexOf(day);
    if (index > -1) days.splice(index, 1);
    else days.push(day);
    setNewChan({ ...newChan, schedule: { ...newChan.schedule, activeDays: days.sort() } });
  };

  const handleEdit = (c: ChannelConfig) => {
    setEditingId(c.id);
    setNewChan({
      name: c.name || '',
      niche: c.niche || '',
      language: c.language || 'zh-TW',
      schedule: c.schedule ? { ...c.schedule } : { ...defaultSchedule }
    });
    setIsModalOpen(true);
  };

  const saveChannel = async () => {
    if (!newChan.name) return;
    let next: ChannelConfig[];
    if (editingId) {
      next = channels.map(c => c.id === editingId ? { ...c, ...newChan } : c);
    } else {
      const channel: ChannelConfig = {
        id: Math.random().toString(36).substring(2, 9),
        status: 'idle',
        name: newChan.name,
        niche: newChan.niche,
        language: newChan.language,
        schedule: { ...newChan.schedule },
        history: [], auth: null, step: 0, lastLog: '待命'
      };
      next = [...channels, channel];
    }
    await saveToDB(next);
    setIsModalOpen(false);
    setEditingId(null);
    setNewChan({ name: '', niche: 'AI 科技', language: 'zh-TW', schedule: { ...defaultSchedule } });
  };

  const generateGASScript = () => {
    const baseUrl = window.location.origin;
    return `// ONYX Elite Automation Script\nfunction onyxHeartbeat() {\n  const API = "${baseUrl}/api/pipeline";\n  console.log("Checking channels at " + API);\n}`.trim();
  };

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col text-zinc-100">
      <nav className="p-6 border-b border-zinc-800 bg-[#080808]/90 backdrop-blur-xl sticky top-0 z-50 flex justify-between items-center shadow-2xl">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center font-black text-black text-xl italic">S</div>
          <div>
            <h1 className="text-2xl font-black text-white italic tracking-tighter uppercase">ShortsPilot <span className="text-cyan-400">ONYX</span></h1>
            <span className={`text-[8px] px-2 py-0.5 rounded-full font-black uppercase ${storageMode === 'cloud' ? 'text-cyan-400 border-cyan-800 bg-cyan-950' : 'text-amber-400 border-amber-800 bg-amber-950'} border mt-2 block w-fit`}>
              {storageMode === 'cloud' ? 'Cloud Sync' : 'Local Offline'}
            </span>
          </div>
        </div>
        <div className="flex gap-4">
           <button onClick={() => setShowGAS(true)} className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 rounded-lg font-bold border border-zinc-700">GAS 部署</button>
           <button onClick={() => { setIsModalOpen(true); setEditingId(null); setNewChan({ name: '', niche: 'AI 科技', language: 'zh-TW', schedule: { ...defaultSchedule } }); }} className="px-8 py-2.5 bg-white text-black rounded-lg font-black shadow-lg">新增頻道</button>
        </div>
      </nav>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-12">
            {isLoading && <div className="text-center py-20 animate-pulse text-zinc-500 font-black uppercase tracking-[0.3em]">Syncing Onyx Database...</div>}
            
            {channels.map(c => (
              <div key={c.id} className="onyx-card rounded-[3.5rem] p-12 transition-all relative group border-zinc-800 border hover:border-zinc-600 shadow-2xl">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                  <div className="space-y-6 flex-1">
                    <div className="flex items-center gap-4">
                      <h2 className="text-4xl font-black text-white italic uppercase tracking-tighter">{c.name}</h2>
                      <span className={`text-[9px] px-3 py-1 rounded-full font-black uppercase tracking-widest ${c.status === 'running' ? 'bg-cyan-500 text-black animate-pulse' : c.status === 'error' ? 'bg-red-500 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                        {c.status === 'running' ? 'Mission Active' : c.status === 'error' ? 'System Error' : 'Standby'}
                      </span>
                    </div>
                    
                    <div className="flex gap-4 items-center">
                       <div className="flex bg-black/50 p-2 rounded-xl border border-zinc-800">
                        {['日','一','二','三','四','五','六'].map((d, i) => (
                          <div key={i} className={`w-8 h-8 flex items-center justify-center rounded-lg text-[10px] font-black ${c.schedule?.activeDays.includes(i) ? 'bg-white text-black' : 'text-zinc-700 opacity-40'}`}>{d}</div>
                        ))}
                       </div>
                       <div className="flex items-center gap-2 bg-zinc-900 px-4 py-2 rounded-xl border border-zinc-800">
                          <span className="text-[10px] font-black text-zinc-500 uppercase">Target Time</span>
                          <span className="font-mono text-cyan-400 font-black">{c.schedule?.time}</span>
                       </div>
                    </div>
                  </div>

                  <div className="flex gap-4">
                     <button 
                      onClick={() => triggerPipeline(c)}
                      disabled={c.status === 'running'}
                      className={`group flex items-center gap-3 px-8 py-5 rounded-3xl font-black uppercase tracking-widest text-xs transition-all ${c.status === 'running' ? 'bg-zinc-900 text-zinc-600 cursor-not-allowed' : 'bg-cyan-500 text-black hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(6,182,212,0.3)]'}`}
                     >
                       <span className={c.status === 'running' ? 'animate-spin' : ''}>{c.status === 'running' ? '⚙️' : '▶'}</span>
                       {c.status === 'running' ? 'Processing' : 'Run Pipeline'}
                     </button>
                     <div className="flex flex-col gap-2">
                        <button onClick={() => handleEdit(c)} className="p-4 bg-zinc-900 rounded-2xl border border-zinc-800 text-zinc-500 hover:text-white transition-all text-xs font-black uppercase">Edit</button>
                        <button onClick={() => { if(confirm('永久移除？')) saveToDB(channels.filter(x => x.id !== c.id)) }} className="p-4 bg-red-950/20 rounded-2xl border border-red-900/30 text-red-700 hover:bg-red-500 hover:text-white transition-all text-xs font-black uppercase">Del</button>
                     </div>
                  </div>
                </div>

                {/* 任務進度條區域 */}
                {(c.status === 'running' || (c.step || 0) > 0) && (
                  <div className="mt-10 pt-10 border-t border-zinc-800/50 space-y-4">
                    <div className="flex justify-between items-end">
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Live Mission Status</p>
                        <p className="text-sm font-bold text-cyan-400 italic">{c.lastLog || '等待指令...'}</p>
                      </div>
                      <span className="text-2xl font-black font-mono text-white italic">{c.step || 0}%</span>
                    </div>
                    <div className="h-4 bg-black rounded-full overflow-hidden border border-zinc-800 p-1">
                      <div 
                        className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(6,182,212,0.5)]"
                        style={{ width: `${c.step || 0}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </main>

        <aside className="w-96 border-l border-zinc-800 bg-[#080808] p-10 flex flex-col shadow-2xl">
          <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.5em] mb-10">Intelligence Log</h4>
          <div className="space-y-3 font-mono text-[9px] flex-1 overflow-y-auto pr-4 scrollbar-thin">
            {globalLog.map((log, i) => (
              <div key={i} className="p-4 bg-[#0a0a0a] border border-zinc-900 rounded-2xl text-zinc-400 border-l-2 border-l-cyan-500/30">{log}</div>
            ))}
            {globalLog.length === 0 && <div className="text-zinc-800 italic">No mission logs available.</div>}
          </div>
        </aside>
      </div>

      {/* Modals 保持不變，已優化 */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[100] flex items-center justify-center p-6">
          <div className="bg-[#0c0c0c] border border-zinc-800 w-full max-w-xl rounded-[4rem] p-16 space-y-10 shadow-2xl">
            <h3 className="text-3xl font-black italic uppercase tracking-tighter text-white">{editingId ? 'Modify Core' : 'Init New Core'}</h3>
            <div className="space-y-8">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Base Identity</label>
                <div className="grid grid-cols-2 gap-6">
                  <input type="text" placeholder="Channel Name" className="w-full bg-black border border-zinc-800 p-6 rounded-3xl outline-none focus:border-cyan-500 transition-all text-white font-bold" value={newChan.name} onChange={e => setNewChan({...newChan, name: e.target.value})} />
                  <input type="text" placeholder="Niche" className="w-full bg-black border border-zinc-800 p-6 rounded-3xl outline-none focus:border-cyan-500 transition-all text-white font-bold" value={newChan.niche} onChange={e => setNewChan({...newChan, niche: e.target.value})} />
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Frequency Plan</label>
                <div className="flex gap-6">
                  <input type="time" className="flex-1 bg-black border border-zinc-800 p-6 rounded-3xl outline-none focus:border-cyan-500 text-white font-mono font-bold" value={newChan.schedule.time} onChange={e => setNewChan({...newChan, schedule: { ...newChan.schedule, time: e.target.value }})} />
                  <select className="flex-1 bg-black border border-zinc-800 p-6 rounded-3xl outline-none text-white font-bold" value={newChan.language} onChange={e => setNewChan({...newChan, language: e.target.value as any})} >
                    <option value="zh-TW">Traditional Chinese</option>
                    <option value="en">Global English</option>
                  </select>
                </div>
              </div>
              <div className="space-y-4">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Cycle Strategy</label>
                <div className="flex gap-3">
                  {['S','M','T','W','T','F','S'].map((d, i) => (
                    <button key={i} onClick={() => toggleDay(i)} className={`flex-1 py-5 rounded-2xl font-black text-xs transition-all border ${newChan.schedule.activeDays.includes(i) ? 'bg-white text-black border-white shadow-lg' : 'bg-transparent text-zinc-600 border-zinc-800 hover:border-zinc-500'}`} > {d} </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-6 pt-6">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 p-6 text-zinc-600 font-black uppercase tracking-widest text-[10px]">Cancel</button>
              <button onClick={saveChannel} className="flex-1 p-7 bg-white text-black rounded-[2rem] font-black uppercase tracking-widest text-[10px] shadow-2xl hover:scale-[1.05] transition-all">Establish Channel</button>
            </div>
          </div>
        </div>
      )}

      {showGAS && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[110] flex items-center justify-center p-6">
          <div className="bg-[#0c0c0c] border border-zinc-800 w-full max-w-3xl rounded-[4rem] p-16 space-y-10 shadow-2xl">
            <h3 className="text-2xl font-black italic uppercase text-white">Google Apps Script Deployment</h3>
            <p className="text-zinc-500 text-sm font-bold leading-relaxed uppercase tracking-tight">Deploy to Apps Script with Hourly Trigger for Full Automation.</p>
            <pre className="bg-black p-10 rounded-[2.5rem] text-xs font-mono text-cyan-400 overflow-x-auto border border-zinc-900 select-all shadow-inner">{generateGASScript()}</pre>
            <button onClick={() => setShowGAS(false)} className="w-full p-8 bg-white text-black rounded-3xl font-black uppercase tracking-widest text-xs">Acknowledge</button>
          </div>
        </div>
      )}
      <style>{`.onyx-card { background: linear-gradient(165deg, #0d0d0d 0%, #050505 100%); }`}</style>
    </div>
  );
};

export default App;
