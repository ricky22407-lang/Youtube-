
import React, { useState, useEffect } from 'react';
import { ChannelConfig, PipelineMetadata } from './types';

const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // 系統狀態
  const [newChannel, setNewChannel] = useState({ name: '', niche: 'AI 科技實測' });

  useEffect(() => {
    const saved = localStorage.getItem('shorts_pilot_v7');
    if (saved) setChannels(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('shorts_pilot_v7', JSON.stringify(channels));
  }, [channels]);

  const addChannel = () => {
    const chan: ChannelConfig = {
      id: Math.random().toString(36).substr(2, 9),
      name: newChannel.name || '新頻道',
      niche: newChannel.niche,
      auth: null,
      status: 'idle',
      step: 0
    };
    setChannels([...channels, chan]);
    setIsModalOpen(false);
  };

  const handleAuth = async (channel: ChannelConfig) => {
    const res = await fetch(`/api/auth?action=url`);
    const { url } = await res.json();
    localStorage.setItem('pending_auth_id', channel.id);
    window.location.href = url;
  };

  const runPipeline = async (channel: ChannelConfig) => {
    const update = (up: Partial<ChannelConfig>) => {
      setChannels(prev => prev.map(c => c.id === channel.id ? { ...c, ...up } : c));
    };

    update({ status: 'running', step: 1, lastLog: '正在分析 YouTube 趨勢並撰寫腳本...' });

    try {
      // Step 1: Analyze
      const r1 = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'analyze', config: channel })
      });
      const d1 = await r1.json();
      if (!d1.success) throw new Error(d1.error);

      // Step 2: Render
      update({ step: 2, lastLog: 'Veo 3.1 正在生成 9:16 高畫質影片 (約需 45 秒)...' });
      const r2 = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'render', metadata: d1.metadata })
      });
      const d2 = await r2.json();
      if (!d2.success) throw new Error(d2.error);

      // Step 3: Upload
      update({ step: 3, lastLog: '正在同步並上傳至 YouTube Shorts...' });
      const r3 = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'upload', config: channel, videoAsset: d2.video })
      });
      const d3 = await r3.json();
      if (!d3.success) throw new Error(d3.error);

      update({ status: 'success', step: 4, lastLog: '影片發布成功！' });
    } catch (e: any) {
      update({ status: 'error', lastLog: `失敗: ${e.message}` });
    }
  };

  return (
    <div className="min-h-screen p-8 max-w-6xl mx-auto">
      <header className="flex justify-between items-center mb-12">
        <div>
          <h1 className="text-4xl font-black tracking-tighter italic uppercase text-indigo-500">ShortsPilot <span className="text-white">PRO</span></h1>
          <p className="text-slate-500 text-sm mt-1">版本 7.0 (零依賴極速版)</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-2xl font-bold transition-all shadow-xl shadow-indigo-500/20"
        >
          + 新增自動化頻道
        </button>
      </header>

      <div className="grid grid-cols-1 gap-6">
        {channels.length === 0 && (
          <div className="border-2 border-dashed border-slate-800 rounded-[2.5rem] p-20 text-center">
            <p className="text-slate-500 font-medium">尚無頻道。請點擊右上角按鈕開始。</p>
          </div>
        )}

        {channels.map(channel => (
          <div key={channel.id} className="bg-slate-900/50 border border-slate-800 rounded-[2.5rem] p-8 hover:border-indigo-500/50 transition-all group">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold text-white">{channel.name}</h2>
                  <span className="bg-slate-800 text-slate-400 text-[10px] px-2 py-1 rounded-md font-black uppercase tracking-widest">{channel.niche}</span>
                </div>
                <p className={`text-sm font-medium ${channel.status === 'error' ? 'text-red-400' : 'text-slate-500'}`}>
                  {channel.lastLog || '等待執行中'}
                </p>
              </div>

              <div className="flex gap-4">
                {!channel.auth ? (
                  <button onClick={() => handleAuth(channel)} className="bg-amber-600/10 text-amber-500 border border-amber-600/30 px-6 py-3 rounded-xl font-bold hover:bg-amber-600 hover:text-white transition-all">
                    連結 YouTube
                  </button>
                ) : (
                  <button 
                    disabled={channel.status === 'running'}
                    onClick={() => runPipeline(channel)}
                    className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold disabled:bg-slate-800 disabled:text-slate-600 hover:scale-105 transition-all"
                  >
                    {channel.status === 'running' ? '執行中...' : '啟動全自動管線'}
                  </button>
                )}
                <button onClick={() => setChannels(channels.filter(c => c.id !== channel.id))} className="bg-slate-800 text-slate-500 p-3 rounded-xl hover:bg-red-600 hover:text-white transition-all">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>

            {channel.status === 'running' && (
              <div className="mt-8 space-y-3 animate-fade-in">
                <div className="flex justify-between text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                  <span>Pipeline Progress</span>
                  <span>Step {channel.step} / 3</span>
                </div>
                <div className="h-2 bg-slate-950 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${(channel.step! / 3) * 100}%` }}></div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-[2.5rem] p-10 animate-slide-up">
            <h2 className="text-2xl font-black text-white mb-6 italic uppercase">Create New Channel</h2>
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">標籤名稱</label>
                <input 
                  autoFocus
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500" 
                  placeholder="例如：主頻道-科技類"
                  value={newChannel.name}
                  onChange={e => setNewChannel({...newChannel, name: e.target.value})}
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">內容主軸 (Niche)</label>
                <input 
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500" 
                  placeholder="例如：室內設計、寵物趣聞"
                  value={newChannel.niche}
                  onChange={e => setNewChannel({...newChannel, niche: e.target.value})}
                />
              </div>
              <div className="flex gap-4 pt-4">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 py-4 text-slate-500 font-bold hover:text-white transition-all">取消</button>
                <button onClick={addChannel} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-500 shadow-xl shadow-indigo-500/20">建立</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
