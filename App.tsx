
import React, { useState, useEffect, useRef } from 'react';
import { ChannelConfig } from './types';

const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const channelsRef = useRef<ChannelConfig[]>([]);
  
  useEffect(() => { channelsRef.current = channels; }, [channels]);

  const [globalLog, setGlobalLog] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAnyChannelRendering, setIsAnyChannelRendering] = useState(false);

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
    
    try {
      updateChannel(channel.id, { status: 'running', step: 10, lastLog: '正在分析趨勢...' });
      
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'analyze', channel })
      });
      
      const d1 = await res.json();
      if (!d1.success) throw new Error(d1.error);
      
      addLog(`🧠 [${channel.name}] 策略生成完成：${d1.metadata.strategy_note}`);
      updateChannel(channel.id, { step: 30, lastLog: '生成影片中...' });

      const res2 = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'render_and_upload', channel, metadata: d1.metadata })
      });

      const d2 = await res2.json();
      if (!d2.success) throw new Error(d2.error);

      // 如果後端刷新了 Token，在此更新本地儲存
      if (d2.updatedAuth) {
        addLog(`🔄 [${channel.name}] 授權已自動刷新並存儲。`);
        updateChannel(channel.id, { auth: d2.updatedAuth });
      }

      addLog(`🎉 [${channel.name}] 發布成功！影片 ID: ${d2.videoId}`);
      updateChannel(channel.id, { status: 'success', step: 100, lastLog: `已發布: ${d2.videoId}` });
    } catch (e: any) {
      addLog(`❌ [${channel.name}] ${e.message}`);
      updateChannel(channel.id, { status: 'error', lastLog: e.message });
    } finally {
      setIsAnyChannelRendering(false);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem('pilot_onyx_v8_data');
    if (saved) setChannels(JSON.parse(saved));
    
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
          addLog("✅ YouTube 授權連結成功。");
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
    <div className="min-h-screen bg-black text-white p-8">
      <nav className="flex justify-between items-center mb-12">
        <h1 className="text-2xl font-black italic">ShortsPilot <span className="text-zinc-500">v8.12</span></h1>
        <button onClick={() => setIsModalOpen(true)} className="bg-white text-black px-6 py-2 rounded-full font-bold text-sm">建立新頻道</button>
      </nav>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {channels.map(c => (
            <div key={c.id} className="bg-zinc-900 p-8 rounded-3xl border border-zinc-800">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold">{c.name} ({c.niche})</h2>
                  <p className="text-sm text-zinc-500 mt-1">{c.lastLog || '等待執行'}</p>
                </div>
                <div className="flex gap-4">
                  {!c.auth ? (
                    <button onClick={() => { localStorage.setItem('pilot_pending_auth_id', c.id); window.location.href='/api/auth?action=url'; }} className="bg-red-500/20 text-red-500 px-4 py-2 rounded-full text-xs font-bold">尚未授權</button>
                  ) : (
                    <button disabled={isAnyChannelRendering} onClick={() => runPipeline(c)} className="bg-white text-black px-6 py-2 rounded-full text-xs font-bold">立即分析與發布</button>
                  )}
                  <button onClick={() => setChannels(channels.filter(x => x.id !== c.id))} className="text-zinc-600 text-xs">刪除</button>
                </div>
              </div>
              {c.status === 'running' && (
                <div className="mt-6 h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500 animate-pulse" style={{ width: `${c.step}%` }}></div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="bg-zinc-950 p-6 rounded-3xl border border-zinc-900 h-[600px] overflow-y-auto">
          <h3 className="text-xs font-bold text-zinc-600 uppercase tracking-widest mb-4">系統日誌</h3>
          <div className="space-y-2 font-mono text-[10px]">
            {globalLog.map((l, i) => (
              <div key={i} className="text-zinc-500 border-b border-zinc-900 pb-2">{l}</div>
            ))}
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 p-8 rounded-3xl w-full max-w-md">
            <h2 className="text-xl font-bold mb-6">初始化頻道</h2>
            <input id="cn" className="w-full bg-zinc-800 p-4 rounded-xl mb-4 outline-none" placeholder="頻道名稱" />
            <input id="ni" className="w-full bg-zinc-800 p-4 rounded-xl mb-6 outline-none" placeholder="利基 (如：貓咪、開箱)" />
            <div className="flex gap-4">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 text-zinc-500 font-bold">取消</button>
              <button onClick={() => {
                const n = (document.getElementById('cn') as HTMLInputElement).value;
                const i = (document.getElementById('ni') as HTMLInputElement).value;
                if (!n || !i) return;
                setChannels([...channels, { id: Date.now().toString(), name: n, niche: i, status: 'idle', auth: null, autoDeploy: false }]);
                setIsModalOpen(false);
              }} className="flex-1 bg-white text-black p-4 rounded-xl font-bold">建立</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
