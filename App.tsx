
import React, { useState, useEffect } from 'react';
import { ChannelConfig, ScheduleConfig } from './types';

const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [newChan, setNewChan] = useState({ 
    name: '', 
    niche: 'AI 科技', 
    language: 'zh-TW' as 'zh-TW' | 'en'
  });

  const [globalLog, setGlobalLog] = useState<string[]>([]);
  const addLog = (msg: string) => setGlobalLog(p => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p].slice(0, 30));

  useEffect(() => {
    const saved = localStorage.getItem('pilot_onyx_data');
    if (saved) setChannels(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('pilot_onyx_data', JSON.stringify(channels));
  }, [channels]);

  const startAuth = async (channel: ChannelConfig) => {
    localStorage.setItem('pilot_onyx_pending', channel.id);
    const res = await fetch('/api/auth?action=url');
    const { url } = await res.json();
    window.location.href = url;
  };

  const runPipeline = async (channel: ChannelConfig) => {
    if (channel.status === 'running') return;
    
    const update = (up: Partial<ChannelConfig>) => {
      setChannels(p => p.map(c => c.id === channel.id ? { ...c, ...up } : c));
    };

    addLog(`🚀 啟動任務: ${channel.name}`);
    update({ status: 'running', step: 10, lastLog: '正在分析趨勢並生成企劃...' });

    try {
      const r1 = await fetch('/api/pipeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'analyze', channel })
      });
      const d1 = await r1.json();
      if (!d1.success) throw new Error(d1.error);

      update({ step: 40, lastLog: 'AI 影片渲染中 (預計 2-3 分鐘)...' });
      const r2 = await fetch('/api/pipeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'render_and_upload', channel, metadata: d1.metadata })
      });
      const d2 = await r2.json();
      if (!d2.success) throw new Error(d2.error);

      update({ status: 'success', step: 100, lastLog: `已發布: ${d2.videoId}` });
      addLog(`✅ [成功] 「${channel.name}」發布完成`);
    } catch (e: any) {
      update({ status: 'error', lastLog: `錯誤: ${e.message}`, step: 0 });
      addLog(`❌ [失敗] ${channel.name}: ${e.message}`);
    }
  };

  const handleEdit = (c: ChannelConfig) => {
    setEditingId(c.id);
    setNewChan({ name: c.name, niche: c.niche, language: c.language || 'zh-TW' });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('確定要移除此頻道？')) {
      setChannels(channels.filter(c => c.id !== id));
      addLog("🗑️ 頻道已移除");
    }
  };

  const saveChannel = () => {
    if (!newChan.name) return;
    if (editingId) {
      setChannels(channels.map(c => c.id === editingId ? { ...c, ...newChan } : c));
      addLog("📝 頻道設定已更新");
    } else {
      const c: ChannelConfig = {
        id: Math.random().toString(36).substr(2, 9),
        ...newChan,
        auth: null,
        status: 'idle',
        step: 0
      };
      setChannels([...channels, c]);
      addLog("➕ 新頻道已建立");
    }
    setIsModalOpen(false);
    setEditingId(null);
  };

  return (
    <div className="min-h-screen bg-black flex flex-col text-white font-sans selection:bg-white selection:text-black">
      {/* 導覽列 */}
      <nav className="p-8 border-b border-zinc-900 flex justify-between items-center bg-black/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center font-black italic shadow-[0_0_20px_rgba(255,255,255,0.2)] text-black text-xl">S</div>
          <div>
            <h1 className="text-2xl font-black italic uppercase tracking-tighter leading-none">ShortsPilot <span className="text-zinc-500">ONYX</span></h1>
            <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-[0.3em] mt-1">Manual Deployment Engine</p>
          </div>
        </div>
        <button onClick={() => { setIsModalOpen(true); setEditingId(null); setNewChan({ name: '', niche: 'AI 科技', language: 'zh-TW' }); }} className="px-10 py-3 bg-white text-black rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_30px_rgba(255,255,255,0.1)]">
          Add Channel
        </button>
      </nav>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* 主內容區 */}
        <main className="flex-1 p-10 overflow-y-auto space-y-12">
          <div className="max-w-4xl mx-auto space-y-8">
            {channels.map(c => (
              <div key={c.id} className="bg-zinc-950 border border-zinc-900 rounded-[3rem] p-10 hover:border-zinc-700 transition-all shadow-2xl relative group">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-10">
                  <div className="flex-1 space-y-4">
                    <div className="flex items-center gap-4">
                      <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">{c.name}</h2>
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${c.status === 'running' ? 'bg-white text-black animate-pulse' : c.status === 'error' ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-500'}`}>
                        {c.status === 'running' ? 'Active' : c.status === 'error' ? 'Failed' : 'Standby'}
                      </span>
                    </div>
                    <div className="flex gap-3">
                      <span className="bg-black border border-zinc-800 text-zinc-400 text-[9px] px-3 py-1 rounded-lg font-black uppercase tracking-widest">{c.niche}</span>
                      <span className="bg-black border border-zinc-800 text-zinc-400 text-[9px] px-3 py-1 rounded-lg font-black uppercase tracking-widest">{c.language === 'en' ? 'ENG' : 'CHT'}</span>
                    </div>
                    <p className={`text-xs font-bold italic tracking-wide truncate max-w-md ${c.status === 'error' ? 'text-red-500' : 'text-zinc-600'}`}>{c.lastLog || '等待執行手動佈署...'}</p>
                  </div>

                  <div className="flex gap-4">
                    {/* 編輯與刪除按鈕 */}
                    <button onClick={() => handleEdit(c)} className="w-14 h-14 flex items-center justify-center rounded-2xl bg-zinc-900 text-zinc-500 hover:text-white border border-zinc-800 transition-all text-xl">✎</button>
                    <button onClick={() => handleDelete(c.id)} className="w-14 h-14 flex items-center justify-center rounded-2xl bg-zinc-900 text-zinc-800 hover:text-red-500 border border-zinc-800 transition-all text-xl">✕</button>
                    
                    {!c.auth ? (
                      <button onClick={() => startAuth(c)} className="px-8 py-4 bg-zinc-900 text-white border border-zinc-800 rounded-3xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-zinc-800">Auth Youtube</button>
                    ) : (
                      <button 
                        disabled={c.status === 'running'} 
                        onClick={() => runPipeline(c)} 
                        className={`px-12 py-4 rounded-3xl font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-xl ${c.status === 'running' ? 'bg-zinc-800 text-zinc-600' : 'bg-white text-black hover:scale-105 active:scale-95 shadow-white/5'}`}
                      >
                        {c.status === 'running' ? 'Processing' : 'Deploy'}
                      </button>
                    )}
                  </div>
                </div>

                {/* 進度條 */}
                {(c.status === 'running' || c.status === 'error' || (c.step || 0) > 0) && (
                  <div className="mt-10 pt-10 border-t border-zinc-900/50 space-y-4">
                    <div className="flex justify-between items-end">
                      <span className="text-[10px] font-black text-zinc-700 uppercase tracking-widest">Process Pulse</span>
                      <span className="text-3xl font-black font-mono text-white italic tracking-tighter">{c.step || 0}%</span>
                    </div>
                    <div className="h-2 bg-zinc-900 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-1000 ease-out ${c.status === 'error' ? 'bg-red-600' : 'bg-white shadow-[0_0_15px_rgba(255,255,255,0.4)]'}`}
                        style={{ width: `${c.step || 0}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {channels.length === 0 && (
              <div className="py-20 text-center border border-dashed border-zinc-900 rounded-[3rem] text-zinc-800 font-black uppercase text-xs tracking-[0.5em]">
                Empty Void. Add Core to Begin.
              </div>
            )}
          </div>
        </main>

        {/* 側邊日誌 */}
        <aside className="w-full lg:w-[400px] border-l border-zinc-900 bg-black p-10 flex flex-col shadow-2xl overflow-y-auto">
          <div className="p-6 bg-zinc-950 border border-zinc-900 rounded-3xl mb-10">
            <h4 className="text-[10px] font-black text-white uppercase tracking-widest mb-3">System Intelligence</h4>
            <p className="text-[11px] text-zinc-600 leading-relaxed font-bold">手動模式已啟用。您可以點擊頻道卡片上的「DEPLOY」按鈕來啟動 AI 分析與影片生成流程。</p>
          </div>
          <h3 className="text-[10px] font-black text-zinc-800 uppercase tracking-[0.4em] mb-8 text-center">Transmission Log</h3>
          <div className="space-y-4 font-mono text-[9px] flex-1">
            {globalLog.map((log, i) => (
              <div key={i} className={`p-4 rounded-2xl border border-zinc-900 bg-zinc-950/50 ${log.includes('成功') || log.includes('✅') ? 'text-emerald-500 border-emerald-950/30' : log.includes('失敗') || log.includes('❌') ? 'text-red-500 border-red-950/30' : 'text-zinc-600'}`}>
                {log}
              </div>
            ))}
            {globalLog.length === 0 && <div className="text-zinc-900 italic text-center text-xs">Waiting for Signal...</div>}
          </div>
        </aside>
      </div>

      {/* 編輯/新增 Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl flex items-center justify-center p-8 z-[100]">
          <div className="bg-zinc-950 border border-zinc-900 w-full max-w-xl rounded-[4rem] p-16 shadow-[0_0_100px_rgba(255,255,255,0.02)] space-y-12">
            <h2 className="text-4xl font-black text-white italic uppercase tracking-tighter">{editingId ? 'Modify Core' : 'Init Core'}</h2>
            <div className="space-y-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-700 uppercase tracking-widest px-1">Identity Name</label>
                <input className="w-full bg-black border border-zinc-900 rounded-3xl p-6 text-white font-bold outline-none focus:border-white transition-all" value={newChan.name} onChange={e => setNewChan({...newChan, name: e.target.value})} placeholder="例如: 科技冷知識" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-700 uppercase tracking-widest px-1">Market Niche</label>
                <input className="w-full bg-black border border-zinc-900 rounded-3xl p-6 text-white font-bold outline-none focus:border-white transition-all" value={newChan.niche} onChange={e => setNewChan({...newChan, niche: e.target.value})} placeholder="例如: AI, 貓咪, 財經" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-700 uppercase tracking-widest px-1">Language Protocol</label>
                <div className="flex gap-4">
                  <button onClick={() => setNewChan({...newChan, language: 'zh-TW'})} className={`flex-1 py-4 rounded-2xl font-black text-[10px] uppercase border transition-all ${newChan.language === 'zh-TW' ? 'bg-white text-black border-white' : 'bg-black text-zinc-600 border-zinc-900'}`}>繁體中文</button>
                  <button onClick={() => setNewChan({...newChan, language: 'en'})} className={`flex-1 py-4 rounded-2xl font-black text-[10px] uppercase border transition-all ${newChan.language === 'en' ? 'bg-white text-black border-white' : 'bg-black text-zinc-600 border-zinc-900'}`}>English</button>
                </div>
              </div>
            </div>
            <div className="flex gap-6 pt-6">
              <button onClick={() => { setIsModalOpen(false); setEditingId(null); }} className="flex-1 py-6 text-zinc-600 font-black uppercase text-[10px] tracking-widest hover:text-white">Cancel</button>
              <button onClick={saveChannel} className="flex-1 py-6 bg-white text-black rounded-3xl font-black uppercase text-[10px] tracking-widest shadow-xl">Confirm System</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
