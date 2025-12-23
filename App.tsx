
import React, { useState, useEffect, useRef } from 'react';
import { ChannelConfig, ScheduleConfig } from './types';

const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newChan, setNewChan] = useState({ 
    name: '', 
    niche: 'AI 科技', 
    language: 'zh-TW' as const,
    schedule: { activeDays: [1, 2, 3, 4, 5], time: '19:00', countPerDay: 1, autoEnabled: true } as ScheduleConfig
  });
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [globalLog, setGlobalLog] = useState<string[]>([]);
  const checkInterval = useRef<any>(null);

  useEffect(() => {
    const saved = localStorage.getItem('pilot_v8_data');
    if (saved) setChannels(JSON.parse(saved));

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const pendingId = localStorage.getItem('pilot_v8_pending');
    if (code && pendingId) handleTokenExchange(code, pendingId);

    // 啟動排程監測器 (每 60 秒檢查一次)
    checkInterval.current = setInterval(checkSchedules, 60000);
    return () => clearInterval(checkInterval.current);
  }, []);

  useEffect(() => {
    localStorage.setItem('pilot_v8_data', JSON.stringify(channels));
  }, [channels]);

  const addLog = (msg: string) => setGlobalLog(p => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p].slice(0, 50));

  const checkSchedules = () => {
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

    setChannels(prev => {
      prev.forEach(chan => {
        if (chan.schedule?.autoEnabled && chan.auth && chan.status !== 'running') {
          const isToday = chan.schedule.activeDays.includes(currentDay);
          const isTime = chan.schedule.time === currentTime;
          
          // 檢查今天是否還沒跑過 (1 小時內不重複觸發)
          const coolDown = 60 * 60 * 1000;
          const isCooledDown = !chan.lastRunTime || (Date.now() - chan.lastRunTime > coolDown);

          if (isToday && isTime && isCooledDown) {
            addLog(`⏰ [自動排程] 頻道「${chan.name}」上片時間已到，啟動流程...`);
            runPipeline(chan);
          }
        }
      });
      return prev;
    });
  };

  const handleTokenExchange = async (code: string, id: string) => {
    window.history.replaceState({}, document.title, "/");
    localStorage.removeItem('pilot_v8_pending');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (data.success) {
        setChannels(prev => prev.map(c => c.id === id ? { ...c, auth: data.tokens } : c));
        addLog("YouTube 頻道連結成功！");
      }
    } catch (e: any) { addLog(`授權失敗: ${e.message}`); }
  };

  const startAuth = async (channel: ChannelConfig) => {
    localStorage.setItem('pilot_v8_pending', channel.id);
    const res = await fetch('/api/auth?action=url');
    const { url } = await res.json();
    window.location.href = url;
  };

  const runPipeline = async (channel: ChannelConfig) => {
    const update = (up: Partial<ChannelConfig>) => {
      setChannels(p => p.map(c => c.id === channel.id ? { ...c, ...up } : c));
    };

    update({ status: 'running', step: 1, lastLog: '正在產出企劃...', lastRunTime: Date.now() });

    try {
      const r1 = await fetch('/api/pipeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'analyze', channel })
      });
      const d1 = await r1.json();
      if (!d1.success) throw new Error(d1.error);

      update({ step: 2, lastLog: '影片生成與上傳中...' });
      const r2 = await fetch('/api/pipeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'render_and_upload', channel, metadata: d1.metadata })
      });
      const d2 = await r2.json();
      if (!d2.success) throw new Error(d2.error);

      update({ status: 'success', step: 3, lastLog: `成功發布: ${d2.videoId}` });
      addLog(`[成功] 「${channel.name}」排程發布完成：${d2.url}`);
    } catch (e: any) {
      update({ status: 'error', lastLog: `失敗: ${e.message}` });
      addLog(`[錯誤] ${channel.name}: ${e.message}`);
    }
  };

  const suggestSchedule = async () => {
    setIsSuggesting(true);
    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'suggest_schedule', channel: { niche: newChan.niche } })
      });
      const data = await res.json();
      if (data.success) {
        setNewChan(prev => ({
          ...prev,
          schedule: {
            ...prev.schedule,
            activeDays: data.suggestion.days,
            time: data.suggestion.time,
            countPerDay: data.suggestion.count
          }
        }));
        addLog(`AI 建議完成：${data.suggestion.reason}`);
      }
    } finally { setIsSuggesting(false); }
  };

  const createChannel = () => {
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
    setChannels([...channels, c]);
    setIsModalOpen(false);
  };

  const toggleDay = (day: number) => {
    const days = newChan.schedule.activeDays.includes(day)
      ? newChan.schedule.activeDays.filter(d => d !== day)
      : [...newChan.schedule.activeDays, day].sort();
    setNewChan({ ...newChan, schedule: { ...newChan.schedule, activeDays: days } });
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-200">
      <nav className="p-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-black italic shadow-lg">S</div>
          <h1 className="text-xl font-black italic uppercase tracking-tighter">ShortsPilot <span className="text-indigo-500">v8</span></h1>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-xl shadow-indigo-900/40">+ 新增排程頻道</button>
      </nav>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            {channels.map(c => (
              <div key={c.id} className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4">
                  {c.schedule?.autoEnabled && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-full text-[10px] font-black uppercase tracking-widest animate-pulse">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                      Auto Pilot Active
                    </div>
                  )}
                </div>

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-2xl font-black text-white">{c.name}</h2>
                      <span className="bg-slate-800 text-slate-400 text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest">{c.language === 'en' ? 'English' : '繁體中文'}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {['日','一','二','三','四','五','六'].map((d, i) => (
                        <span key={i} className={`text-[10px] w-6 h-6 flex items-center justify-center rounded-lg font-bold ${c.schedule?.activeDays.includes(i) ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-600'}`}>{d}</span>
                      ))}
                      <span className="ml-2 text-indigo-400 font-mono font-bold">@ {c.schedule?.time}</span>
                    </div>
                    <p className={`text-sm font-semibold truncate max-w-md ${c.status === 'error' ? 'text-red-400' : 'text-slate-500'}`}>{c.lastLog || '正在等待下一個排程時間...'}</p>
                  </div>

                  <div className="flex gap-4">
                    {!c.auth ? (
                      <button onClick={() => startAuth(c)} className="px-6 py-3 bg-amber-600/10 text-amber-500 border border-amber-600/20 rounded-2xl font-bold">連結 YouTube</button>
                    ) : (
                      <button disabled={c.status === 'running'} onClick={() => runPipeline(c)} className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-bold disabled:bg-slate-800">
                        {c.status === 'running' ? '自動執行中' : '立即手動發布'}
                      </button>
                    )}
                    <button onClick={() => setChannels(channels.filter(x => x.id !== c.id))} className="p-3 bg-slate-800 text-slate-500 hover:bg-red-600 hover:text-white rounded-2xl transition-all"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1v3M4 7h16" /></svg></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>

        <aside className="w-full lg:w-96 border-l border-slate-800 bg-slate-950/50 p-6 flex flex-col shadow-2xl overflow-y-auto">
          <div className="p-4 bg-indigo-600/10 border border-indigo-600/20 rounded-2xl mb-6">
            <h4 className="text-xs font-black text-indigo-400 uppercase mb-2">排程系統狀態</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed font-medium">只要保持此網頁開啟，ShortsPilot 將依照設定自動執行發片任務。目前支援每小時防重執行保護。</p>
          </div>
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6 px-2">System Events</h3>
          <div className="space-y-2 font-mono text-[10px] flex-1">
            {globalLog.map((log, i) => (
              <div key={i} className={`p-2 rounded-lg border border-transparent ${log.includes('成功') ? 'bg-emerald-950/20 text-emerald-400 border-emerald-900/30' : 'text-slate-500'}`}> {log} </div>
            ))}
          </div>
        </aside>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 z-[100] overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-[3rem] p-10 shadow-2xl my-auto">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-white italic uppercase tracking-tight">Create Automation</h2>
              <button onClick={suggestSchedule} disabled={isSuggesting} className="px-4 py-2 bg-indigo-600/20 text-indigo-400 text-xs font-black rounded-xl border border-indigo-600/30 hover:bg-indigo-600 hover:text-white transition-all">
                {isSuggesting ? 'AI 大數據分析中...' : '🪄 AI 建議最佳排程'}
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">頻道標籤</label>
                  <input className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-600" placeholder="例如：寵物主頻道" value={newChan.name} onChange={e => setNewChan({...newChan, name: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">內容主軸</label>
                  <input className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-600" placeholder="例如：可愛狗狗" value={newChan.niche} onChange={e => setNewChan({...newChan, niche: e.target.value})} />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">發片星期 (Weekly Schedule)</label>
                <div className="flex justify-between gap-2">
                  {['日','一','二','三','四','五','六'].map((d, i) => (
                    <button key={i} onClick={() => toggleDay(i)} className={`flex-1 py-3 rounded-xl font-bold transition-all border ${newChan.schedule.activeDays.includes(i) ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'}`}>{d}</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">上片時間 (Time)</label>
                  <input type="time" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-600 appearance-none" value={newChan.schedule.time} onChange={e => setNewChan({...newChan, schedule: {...newChan.schedule, time: e.target.value}})} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">發片數量 (Count/Day)</label>
                  <select className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-600" value={newChan.schedule.countPerDay} onChange={e => setNewChan({...newChan, schedule: {...newChan.schedule, countPerDay: parseInt(e.target.value)}})}>
                    <option value="1">1 篇 / 每日</option>
                    <option value="2">2 篇 / 每日</option>
                    <option value="3">3 篇 / 每日</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-4 pt-6">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 py-4 text-slate-500 font-bold">取消</button>
                <button onClick={createChannel} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg">啟動排程</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
