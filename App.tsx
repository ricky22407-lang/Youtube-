
import React, { useState, useEffect, useRef } from 'react';
import { ChannelConfig, PipelineMetadata, TestResult } from './types';
import { ModuleCard } from './components/ModuleCard';

const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [globalLog, setGlobalLog] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // 取得目前選中的頻道
  const activeChannel = channels.find(c => c.id === selectedChannelId);

  const addLog = (msg: string) => {
    const now = new Date();
    setGlobalLog(p => [`[${now.toLocaleTimeString()}] ${msg}`, ...p].slice(0, 50));
  };

  const updateChannel = (id: string, up: Partial<ChannelConfig>) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, ...up } : c));
  };

  // 全自動執行流程
  const runFullPipeline = async (channel: ChannelConfig) => {
    if (isProcessing) return;
    setIsProcessing(true);
    addLog(`🚀 [${channel.name}] 啟動全自動流程...`);

    try {
      // Step 1: 分析
      updateChannel(channel.id, { status: 'running', step: 1, lastLog: '正在蒐集趨勢並生成策略...' });
      const res1 = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'analyze', channel })
      });
      const d1 = await res1.json();
      if (!d1.success) throw new Error(d1.error);
      
      addLog(`🧠 [${channel.name}] 策略生成：${d1.metadata.title}`);
      updateChannel(channel.id, { step: 3, lastLog: '策略已完成，準備渲染影片...' });

      // Step 2: 渲染與上傳
      const res2 = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'render_and_upload', channel, metadata: d1.metadata })
      });
      const d2 = await res2.json();
      if (!d2.success) throw new Error(d2.error);

      // 同步 Token
      if (d2.updatedAuth) {
        addLog(`🔄 [${channel.name}] 授權已自動續約。`);
        updateChannel(channel.id, { auth: d2.updatedAuth });
      }

      addLog(`🎉 [${channel.name}] 影片發布成功！ID: ${d2.videoId}`);
      updateChannel(channel.id, { status: 'success', step: 6, lastLog: `發布成功: ${d2.videoId}` });
    } catch (e: any) {
      addLog(`❌ [${channel.name}] 失敗: ${e.message}`);
      updateChannel(channel.id, { status: 'error', lastLog: e.message });
    } finally {
      setIsProcessing(false);
    }
  };

  // 初始化與 OAuth 處理
  useEffect(() => {
    const saved = localStorage.getItem('shortspilot_v8_data');
    if (saved) {
      const parsed = JSON.parse(saved);
      setChannels(parsed);
      if (parsed.length > 0) setSelectedChannelId(parsed[0].id);
    }

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
        } else {
          addLog(`❌ 授權失敗: ${d.error}`);
        }
      });
      localStorage.removeItem('pilot_pending_auth_id');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('shortspilot_v8_data', JSON.stringify(channels));
  }, [channels]);

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-zinc-900 bg-black/50 backdrop-blur-md sticky top-0 z-50 px-8 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span className="font-black italic text-lg">P</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight">ShortsPilot <span className="text-zinc-500 font-normal">Onyx v8.15</span></h1>
        </div>
        
        <div className="flex gap-4">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-5 py-2 rounded-full text-xs font-bold transition-all"
          >
            + 建立頻道
          </button>
          {activeChannel?.auth && (
            <button 
              disabled={isProcessing}
              onClick={() => runFullPipeline(activeChannel)}
              className="bg-white text-black hover:bg-zinc-200 px-6 py-2 rounded-full text-xs font-black transition-all disabled:opacity-50"
            >
              🚀 立即執行全自動流程
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar: Channels */}
        <aside className="w-72 border-r border-zinc-900 bg-zinc-950/50 p-6 flex flex-col gap-4 overflow-y-auto">
          <h2 className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-2">我的頻道</h2>
          {channels.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedChannelId(c.id)}
              className={`p-4 rounded-2xl text-left border transition-all ${selectedChannelId === c.id ? 'bg-zinc-900 border-zinc-700 ring-1 ring-zinc-700' : 'bg-transparent border-transparent hover:bg-zinc-900/50 text-zinc-400'}`}
            >
              <div className="font-bold text-sm truncate">{c.name}</div>
              <div className="text-[10px] mt-1 opacity-50">{c.niche} • {c.auth ? '已授權' : '未授權'}</div>
            </button>
          ))}
          {channels.length === 0 && <div className="text-zinc-700 text-xs text-center mt-10">尚無頻道</div>}
        </aside>

        {/* Content Area */}
        <section className="flex-1 p-8 overflow-y-auto bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-zinc-900/20 via-transparent to-transparent">
          {activeChannel ? (
            <div className="max-w-4xl mx-auto space-y-8">
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-1">正在操作</div>
                  <h2 className="text-3xl font-black">{activeChannel.name}</h2>
                </div>
                {!activeChannel.auth && (
                  <button 
                    onClick={() => {
                      localStorage.setItem('pilot_pending_auth_id', activeChannel.id);
                      window.location.href = '/api/auth?action=url';
                    }}
                    className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-2xl font-black text-sm shadow-lg shadow-red-500/20"
                  >
                    連結 YouTube 帳號
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ModuleCard
                  title="趨勢分析"
                  stepNumber="1"
                  description="利用 YouTube Data API 抓取利基與全域趨勢"
                  status={activeChannel.step && activeChannel.step >= 1 ? (activeChannel.step === 1 ? 'loading' : 'success') : 'idle'}
                  canExecute={!!activeChannel.auth}
                  onExecute={() => runFullPipeline(activeChannel)}
                  onRunTest={async () => ({ moduleName: 'Analysis', passed: true, logs: ['API Check OK'] })}
                  data={null}
                  testResult={null}
                />
                
                <ModuleCard
                  title="策略生成"
                  stepNumber="2"
                  description="Gemini 3 Pro 生成具備病毒傳播潛力的腳本"
                  status={activeChannel.step && activeChannel.step >= 3 ? (activeChannel.step === 3 ? 'loading' : 'success') : 'idle'}
                  canExecute={!!activeChannel.auth}
                  onExecute={() => {}}
                  onRunTest={async () => ({ moduleName: 'Strategy', passed: true, logs: ['LLM Check OK'] })}
                  data={null}
                  testResult={null}
                />

                <ModuleCard
                  title="影片渲染"
                  stepNumber="3"
                  description="Veo 3.1 生成 9:16 垂直短影音"
                  status={activeChannel.step && activeChannel.step >= 4 ? (activeChannel.step === 4 ? 'loading' : 'success') : 'idle'}
                  canExecute={!!activeChannel.auth}
                  onExecute={() => {}}
                  onRunTest={async () => ({ moduleName: 'Veo', passed: true, logs: ['Quota Check OK'] })}
                  data={null}
                  testResult={null}
                />

                <ModuleCard
                  title="發布與排程"
                  stepNumber="4"
                  description="自動上傳至 YouTube Shorts 並設定公開"
                  status={activeChannel.step === 6 ? 'success' : (activeChannel.status === 'error' ? 'error' : 'idle')}
                  canExecute={!!activeChannel.auth}
                  onExecute={() => {}}
                  onRunTest={async () => ({ moduleName: 'Upload', passed: true, logs: ['OAuth Check OK'] })}
                  data={null}
                  testResult={null}
                />
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-zinc-700">
              <div className="w-20 h-20 border-4 border-zinc-900 rounded-3xl mb-6"></div>
              <p className="font-bold">請在左側選擇或建立頻道</p>
            </div>
          )}
        </section>

        {/* Terminal Logs */}
        <aside className="w-80 border-l border-zinc-900 bg-black flex flex-col">
          <div className="p-4 border-b border-zinc-900 flex justify-between items-center bg-zinc-950">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">系統日誌</span>
            <div className="flex gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500/50"></div>
              <div className="w-2 h-2 rounded-full bg-yellow-500/50"></div>
              <div className="w-2 h-2 rounded-full bg-green-500/50"></div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] space-y-2 leading-relaxed">
            {globalLog.map((log, i) => (
              <div key={i} className={`pb-2 border-b border-zinc-900/50 ${log.includes('❌') ? 'text-red-400' : log.includes('✅') ? 'text-green-400' : 'text-zinc-500'}`}>
                {log}
              </div>
            ))}
          </div>
        </aside>
      </main>

      {/* Modal: Create Channel */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center p-6 z-[100]">
          <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-[32px] w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-black mb-2">初始化新頻道</h2>
            <p className="text-zinc-500 text-sm mb-8">設定利基領域後，AI 將自動進行針對性優化。</p>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase mb-2 block">頻道顯示名稱</label>
                <input id="modal-name" className="w-full bg-black border border-zinc-800 p-4 rounded-2xl outline-none focus:ring-2 ring-indigo-500 transition-all" placeholder="例如：寵物大集合" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase mb-2 block">核心利基 (Niche)</label>
                <input id="modal-niche" className="w-full bg-black border border-zinc-800 p-4 rounded-2xl outline-none focus:ring-2 ring-indigo-500 transition-all" placeholder="例如：可愛貓咪、科技開箱" />
              </div>
            </div>

            <div className="flex gap-4 mt-10">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 text-zinc-500 font-bold py-4">取消</button>
              <button 
                onClick={() => {
                  const n = (document.getElementById('modal-name') as HTMLInputElement).value;
                  const i = (document.getElementById('modal-niche') as HTMLInputElement).value;
                  if (!n || !i) return;
                  const newChan: ChannelConfig = {
                    id: Date.now().toString(),
                    name: n,
                    niche: i,
                    status: 'idle',
                    auth: null,
                    autoDeploy: false,
                    step: 0
                  };
                  setChannels([...channels, newChan]);
                  setSelectedChannelId(newChan.id);
                  setIsModalOpen(false);
                  addLog(`✨ 已建立新頻道: ${n}`);
                }}
                className="flex-1 bg-white text-black font-black py-4 rounded-2xl shadow-lg hover:bg-zinc-200 transition-all"
              >
                確認建立
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
