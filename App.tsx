
import React, { useState, useEffect, useRef } from 'react';
import { ChannelConfig, ScheduleConfig } from './types';
import { db, syncChannelToCloud, isFirebaseConfigured } from './firebase';
import { collection, onSnapshot, query } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [newChan, setNewChan] = useState({ 
    name: '', 
    niche: 'AI 科技', 
    language: 'zh-TW' as const,
    schedule: { activeDays: [1, 2, 3, 4, 5], time: '19:00', countPerDay: 1, autoEnabled: true } as ScheduleConfig
  });
  const [globalLog, setGlobalLog] = useState<string[]>([]);
  const checkInterval = useRef<any>(null);

  useEffect(() => {
    if (isFirebaseConfigured && db) {
      addLog("偵測到 Firebase 配置，已切換至【雲端同步模式】。");
      const q = query(collection(db, "channels"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(doc => doc.data() as ChannelConfig);
        setChannels(docs);
        setIsSyncing(false);
      }, (err) => {
        addLog(`雲端讀取錯誤: ${err.message}`);
      });
      return () => unsubscribe();
    } else {
      addLog("未偵測到 Firebase，目前為【本地預覽模式】。");
      const saved = localStorage.getItem('pilot_v8_data');
      if (saved) setChannels(JSON.parse(saved));
      checkInterval.current = setInterval(checkLocalSchedules, 60000);
      return () => clearInterval(checkInterval.current);
    }
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      localStorage.setItem('pilot_v8_data', JSON.stringify(channels));
    }
  }, [channels]);

  const addLog = (msg: string) => setGlobalLog(p => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p].slice(0, 50));

  const checkLocalSchedules = () => {
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

    setChannels(prev => {
      let hasUpdate = false;
      const next = prev.map(chan => {
        if (chan.schedule?.autoEnabled && chan.auth && chan.status !== 'running') {
          const isToday = chan.schedule.activeDays.includes(currentDay);
          const isTime = chan.schedule.time === currentTime;
          const coolDown = 60 * 60 * 1000;
          const isCooledDown = !chan.lastRunTime || (Date.now() - chan.lastRunTime > coolDown);

          if (isToday && isTime && isCooledDown) {
            handleManualRun(chan);
            hasUpdate = true;
          }
        }
        return chan;
      });
      return hasUpdate ? next : prev;
    });
  };

  const handleManualRun = async (channel: ChannelConfig) => {
     addLog(`[發布啟動] 正在執行 「${channel.name}」 的 AI 流程...`);
     setChannels(prev => prev.map(c => c.id === channel.id ? { ...c, status: 'running', lastLog: '正在產出內容...' } : c));
     
     try {
       const res = await fetch('/api/pipeline', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ stage: 'analyze', channel })
       });
       const data = await res.json();
       if (!data.success) throw new Error(data.error);
       addLog(`[成功] 「${channel.name}」流程已交由後端處理。`);
     } catch (e: any) {
       addLog(`[錯誤] ${channel.name}: ${e.message}`);
       setChannels(prev => prev.map(c => c.id === channel.id ? { ...c, status: 'error', lastLog: e.message } : c));
     }
  };

  const handleSyncToCloud = async (channel: ChannelConfig) => {
    if (!isFirebaseConfigured) {
      alert("請先在 firebase.ts 中填入金鑰！");
      return;
    }
    setIsSyncing(true);
    try {
      await syncChannelToCloud(channel);
      addLog(`✨ 「${channel.name}」已同步至雲端大腦，您可以放心關閉電腦。`);
    } catch (e: any) {
      addLog(`同步失敗: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const startAuth = async (channel: ChannelConfig) => {
    localStorage.setItem('pilot_v8_pending', channel.id);
    const res = await fetch('/api/auth?action=url');
    const { url } = await res.json();
    window.location.href = url;
  };

  const createChannel = async () => {
    const c: ChannelConfig = {
      id: Math.random().toString(36).substr(2, 9),
      name: newChan.name || '我的 Shorts 頻道',
      niche: newChan.niche,
      language: newChan.language,
      schedule: newChan.schedule,
      auth: null,
      status: 'idle',
      step: 0
    };
    
    if (isFirebaseConfigured) {
      await handleSyncToCloud(c);
    } else {
      setChannels([...channels, c]);
      addLog(`頻道「${c.name}」已建立。`);
    }
    setIsModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-200">
      <nav className="p-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-black italic shadow-lg">S</div>
          <div>
            <h1 className="text-xl font-black italic uppercase tracking-tighter">ShortsPilot <span className="text-indigo-500 text-xs">v8</span></h1>
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${isFirebaseConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></div>
              <span className={`text-[9px] font-black uppercase tracking-widest ${isFirebaseConfigured ? 'text-emerald-500' : 'text-amber-500'}`}>
                {isFirebaseConfigured ? 'Cloud Engine Active' : 'Local Preview Mode'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-4">
          {isSyncing && <span className="text-[10px] text-indigo-400 font-bold self-center animate-pulse">雲端同步中...</span>}
          <button onClick={() => setIsModalOpen(true)} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-xl shadow-indigo-900/40">+ 新增頻道</button>
        </div>
      </nav>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            {channels.map(c => (
              <div key={c.id} className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group hover:border-indigo-500/30 transition-all">
                <div className="absolute top-0 right-0 p-4 flex gap-2">
                  {isFirebaseConfigured ? (
                    <div className="px-3 py-1 bg-indigo-500/10 text-indigo-400 rounded-full text-[10px] font-black uppercase tracking-widest border border-indigo-500/20 flex items-center gap-1.5">
                      <div className="w-1 h-1 bg-indigo-500 rounded-full"></div>
                      Cloud Ready
                    </div>
                  ) : (
                    <div className="px-3 py-1 bg-slate-800 text-slate-500 rounded-full text-[10px] font-black uppercase tracking-widest">Offline</div>
                  )}
                </div>

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div className="flex-1">
                    <h2 className="text-2xl font-black text-white mb-2">{c.name}</h2>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {['日','一','二','三','四','五','六'].map((d, i) => (
                        <span key={i} className={`text-[10px] w-6 h-6 flex items-center justify-center rounded-lg font-bold ${c.schedule?.activeDays.includes(i) ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-slate-800 text-slate-600'}`}>{d}</span>
                      ))}
                      <span className="ml-2 text-indigo-400 font-mono font-bold">@ {c.schedule?.time}</span>
                    </div>
                    <p className="text-sm text-slate-500 font-semibold truncate max-w-md">狀態：<span className="text-slate-300">{c.lastLog || '等待排程執行中...'}</span></p>
                  </div>

                  <div className="flex gap-4">
                    {!c.auth ? (
                      <button onClick={() => startAuth(c)} className="px-6 py-3 bg-amber-600/10 text-amber-500 border border-amber-600/20 rounded-2xl font-bold hover:bg-amber-600 hover:text-white transition-all">連結 YouTube</button>
                    ) : (
                      <button disabled={c.status === 'running'} onClick={() => handleManualRun(c)} className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:scale-105 active:scale-95 transition-all shadow-lg shadow-indigo-900/40">立即發布</button>
                    )}
                    {isFirebaseConfigured && (
                      <button onClick={() => handleSyncToCloud(c)} className="p-3 bg-slate-800 text-slate-400 hover:bg-indigo-600 hover:text-white rounded-2xl transition-all" title="手動同步至雲端">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>

        <aside className="w-full lg:w-96 border-l border-slate-800 bg-slate-950/50 p-6 flex flex-col shadow-2xl">
          <div className="p-5 bg-indigo-600/10 border border-indigo-600/20 rounded-3xl mb-6">
            <h4 className="text-xs font-black text-indigo-400 uppercase mb-2">自動化運作原理</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
              在「雲端模式」下，資料會存於 Firebase。當 Vercel Cron 觸發時，系統會自動代表您進行 AI 創作與發布，不論您是否在線上。
            </p>
          </div>
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">系統紀錄</h3>
          <div className="flex-1 overflow-y-auto space-y-2 font-mono text-[9px]">
            {globalLog.map((log, i) => (
              <div key={i} className={`p-2 rounded border ${log.includes('成功') ? 'bg-emerald-950/20 text-emerald-400 border-emerald-900/30' : 'bg-slate-900 text-slate-500 border-slate-800'}`}>
                {log}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 z-[100]">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-[3rem] p-10 shadow-2xl animate-slide-down">
            <h2 className="text-2xl font-black text-white italic uppercase mb-8">新增自動化頻道</h2>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase px-1">頻道標籤</label>
                <input className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-600 transition-all" value={newChan.name} onChange={e => setNewChan({...newChan, name: e.target.value})} placeholder="例如：科學實驗頻道" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase px-1">發片時間</label>
                  <input type="time" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none" value={newChan.schedule.time} onChange={e => setNewChan({...newChan, schedule: {...newChan.schedule, time: e.target.value}})} />
                </div>
                <div className="flex items-end">
                   <button onClick={createChannel} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl shadow-indigo-900/40 hover:bg-indigo-500 transition-all">確認建立</button>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="w-full py-2 text-slate-600 text-[10px] font-black uppercase tracking-widest">取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
