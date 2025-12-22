
import React, { useState, useEffect } from 'react';
import { ChannelConfig, ScheduleConfig } from './types';
import { db, isFirebaseConfigured } from './firebase';
import { 
  collection, onSnapshot, query, doc, updateDoc, 
  setDoc, serverTimestamp, deleteDoc, addDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { PipelineCore } from './services/pipelineCore';

const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [globalLog, setGlobalLog] = useState<string[]>([]);
  const [processingState, setProcessingState] = useState<{id: string, step: string, percent: number} | null>(null);
  
  // 新增頻道表單狀態
  const [showAddModal, setShowAddModal] = useState(false);
  const [newChannel, setNewChannel] = useState({ name: '', niche: '', time: '19:00' });

  const addLog = (msg: string) => {
    setGlobalLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  };

  useEffect(() => {
    if (isFirebaseConfigured && db) {
      // 監聽 Vercel Cron 巡邏脈搏
      const unsubStatus = onSnapshot(doc(db, "system", "status"), (docSnap) => {
        if (docSnap.exists()) setSystemStatus(docSnap.data());
      });

      // 監聽頻道清單 (Source of Truth)
      const q = query(collection(db, "channels"));
      const unsubChannels = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ 
          ...doc.data() as ChannelConfig, 
          id: doc.id  // 確保使用 Firestore 的 Document ID
        }));
        setChannels(docs);
      });
      return () => { unsubStatus(); unsubChannels(); };
    }
  }, []);

  // 手動執行任務
  const handleManualRun = async (channel: ChannelConfig) => {
    if (processingState) return;
    setProcessingState({ id: channel.id, step: '初始化引擎...', percent: 5 });
    addLog(`🚀 [${channel.name}] 手動觸發啟動...`);
    
    try {
      const chanRef = doc(db, "channels", channel.id);
      
      setProcessingState({ id: channel.id, step: '正在分析 YouTube 趨勢...', percent: 20 });
      await updateDoc(chanRef, { status: 'running', lastLog: '正在搜尋趨勢...' });
      const trends = await PipelineCore.fetchTrends(channel);
      
      setProcessingState({ id: channel.id, step: 'Gemini 正在撰寫腳本與企劃...', percent: 45 });
      await updateDoc(chanRef, { lastLog: 'AI 企劃中...' });
      const plan = await PipelineCore.planContent(trends, channel);
      
      setProcessingState({ id: channel.id, step: 'Veo 3.1 正在生成 9:16 影片...', percent: 70 });
      await updateDoc(chanRef, { lastLog: '影片生成中 (Veo 3.1)...' });
      const video = await PipelineCore.renderVideo(plan);

      setProcessingState({ id: channel.id, step: '上傳至 YouTube...', percent: 90 });
      await updateDoc(chanRef, { lastLog: '上傳中...' });
      const result = await PipelineCore.uploadVideo({ video_asset: video, metadata: plan });

      setProcessingState({ id: channel.id, step: '執行成功！', percent: 100 });
      await updateDoc(chanRef, { 
        status: 'success', 
        lastLog: `✅ 發布成功: ${result.video_id}`,
        lastRunTime: serverTimestamp()
      });
      addLog(`✅ [${channel.name}] 任務完成`);
      setTimeout(() => setProcessingState(null), 3000);

    } catch (e: any) {
      addLog(`❌ [${channel.name}] 失敗: ${e.message}`);
      if (db) await updateDoc(doc(db, "channels", channel.id), { status: 'error', lastLog: `❌ 錯誤: ${e.message}` });
      setProcessingState(null);
    }
  };

  const createChannel = async () => {
    if (!db || !newChannel.name) return;
    try {
      await addDoc(collection(db, "channels"), {
        name: newChannel.name,
        niche: newChannel.niche || 'General',
        status: 'idle',
        lastLog: '新頻道已建立',
        schedule: {
          activeDays: [1,2,3,4,5,6,0],
          time: newChannel.time,
          autoEnabled: false
        }
      });
      setShowAddModal(false);
      setNewChannel({ name: '', niche: '', time: '19:00' });
      addLog("頻道建立成功！");
    } catch (e: any) {
      addLog("建立失敗: " + e.message);
    }
  };

  const deleteChannel = async (id: string) => {
    if (!db || !confirm("確定要刪除此頻道？這會永久移除雲端排程。")) return;
    try {
      // 直接刪除 Firestore 物理路徑文件
      await deleteDoc(doc(db, "channels", id));
      addLog("頻道已從雲端徹底移除");
    } catch (e: any) {
      addLog("刪除失敗: " + e.message);
    }
  };

  const toggleAuto = async (channel: ChannelConfig) => {
    if (!db) return;
    const newStatus = !channel.schedule?.autoEnabled;
    await updateDoc(doc(db, "channels", channel.id), {
      "schedule.autoEnabled": newStatus
    });
    addLog(`${channel.name} 自動巡邏: ${newStatus ? 'ON' : 'OFF'}`);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-6 md:p-12 font-['Plus_Jakarta_Sans']">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-16 gap-8">
          <div>
            <h1 className="text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-400 to-cyan-500 mb-2">
              PILOT V8
            </h1>
            <div className="flex items-center gap-3">
              <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded text-[10px] font-bold tracking-widest uppercase">
                Vercel Cloud Mode
              </span>
              <p className="text-slate-500 text-xs font-medium">全自動雲端短影音矩陣</p>
            </div>
          </div>
          
          <div className="flex items-center gap-6 bg-slate-900/40 border border-white/5 p-5 rounded-[2rem] backdrop-blur-3xl shadow-2xl">
            <div className="text-right">
              <div className="flex items-center justify-end gap-2 mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cron Heartbeat</span>
                <div className={`w-2.5 h-2.5 rounded-full ${systemStatus?.engineStatus === 'online' ? 'bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.5)] animate-pulse' : 'bg-red-500'}`}></div>
              </div>
              <p className="text-sm font-mono text-slate-200">
                {systemStatus?.lastPulseTime ? `最後巡邏: ${systemStatus.lastPulseTime}` : '雲端引擎待機中'}
              </p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* 頻道列表 */}
          <div className="lg:col-span-8 space-y-10">
            <div className="flex justify-between items-end">
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center text-xl shadow-lg shadow-blue-900/20">📡</span>
                活躍頻道控盤
              </h2>
              <button 
                onClick={() => setShowAddModal(true)}
                className="px-6 py-2.5 bg-white text-black rounded-xl text-xs font-black hover:bg-blue-400 transition-all shadow-lg active:scale-95"
              >
                + 新增監控頻道
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {channels.map(chan => {
                const isBusy = processingState?.id === chan.id;
                return (
                  <div key={chan.id} className={`group relative bg-slate-900/30 border rounded-[2.5rem] p-8 transition-all duration-500 ${isBusy ? 'border-blue-500 ring-1 ring-blue-500/50 bg-slate-900/60' : 'border-white/5 hover:border-white/10'}`}>
                    
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h3 className="text-2xl font-bold tracking-tight text-white group-hover:text-blue-400 transition-colors">{chan.name}</h3>
                        <p className="text-xs text-slate-500 mt-1 font-semibold uppercase tracking-widest">{chan.niche} • 排程 {chan.schedule?.time}</p>
                      </div>
                      <button 
                        onClick={() => deleteChannel(chan.id)}
                        className="opacity-0 group-hover:opacity-100 p-2 text-slate-600 hover:text-red-400 transition-all"
                      >
                        ✕
                      </button>
                    </div>

                    {/* 進度條 */}
                    <div className="mb-8">
                      <div className="flex justify-between text-[10px] font-black text-slate-400 mb-3 uppercase tracking-tighter">
                        <span className={isBusy ? 'text-blue-400' : ''}>
                          {isBusy ? processingState.step : (chan.lastLog || '等待任務分配...')}
                        </span>
                        {isBusy && <span>{processingState.percent}%</span>}
                      </div>
                      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-700 ease-out ${chan.status === 'error' ? 'bg-red-500' : 'bg-gradient-to-r from-blue-600 via-cyan-400 to-blue-500'}`}
                          style={{ width: `${isBusy ? processingState.percent : (chan.status === 'success' ? 100 : 0)}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button 
                        onClick={() => handleManualRun(chan)}
                        disabled={!!processingState}
                        className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-2xl text-[11px] font-black tracking-widest transition-all shadow-2xl shadow-blue-900/40 active:scale-95 uppercase"
                      >
                        {isBusy ? 'Engine Running' : 'Manual Fire'}
                      </button>
                      <button 
                        onClick={() => toggleAuto(chan)}
                        className={`px-6 py-4 rounded-2xl text-[11px] font-black border transition-all uppercase tracking-widest ${chan.schedule?.autoEnabled ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' : 'bg-slate-900/50 border-white/5 text-slate-600'}`}
                      >
                        Auto: {chan.schedule?.autoEnabled ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 日誌區 */}
          <div className="lg:col-span-4">
             <div className="bg-slate-900/40 border border-white/5 rounded-[2.5rem] p-8 backdrop-blur-xl h-full flex flex-col">
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">System Telemetry</h3>
                  <button onClick={() => setGlobalLog([])} className="text-[10px] text-slate-700 hover:text-white transition-colors">RESET</button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-none">
                  {globalLog.map((log, i) => (
                    <div key={i} className="text-[10px] font-mono text-slate-400 border-l border-white/5 pl-4 py-1 leading-relaxed animate-fade-in">
                      {log}
                    </div>
                  ))}
                  {globalLog.length === 0 && <div className="text-[10px] text-slate-800 italic text-center py-32">WAITING FOR UPLINK...</div>}
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* 新增頻道 Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-6">
          <div className="bg-slate-900 border border-white/10 rounded-[3rem] p-10 max-w-md w-full shadow-2xl animate-slide-down">
            <h2 className="text-2xl font-bold mb-6 text-white">新增監控任務</h2>
            <div className="space-y-5">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">頻道名稱</label>
                <input 
                  type="text" 
                  value={newChannel.name}
                  onChange={e => setNewChannel({...newChannel, name: e.target.value})}
                  className="w-full bg-slate-800 border-none rounded-2xl p-4 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none" 
                  placeholder="例如: AI 實驗室"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">頻道定位 (Niche)</label>
                <input 
                  type="text" 
                  value={newChannel.niche}
                  onChange={e => setNewChannel({...newChannel, niche: e.target.value})}
                  className="w-full bg-slate-800 border-none rounded-2xl p-4 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none" 
                  placeholder="例如: Science, Tech, ASMR"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">每日排程時間</label>
                <input 
                  type="time" 
                  value={newChannel.time}
                  onChange={e => setNewChannel({...newChannel, time: e.target.value})}
                  className="w-full bg-slate-800 border-none rounded-2xl p-4 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none" 
                />
              </div>
              <div className="flex gap-4 pt-6">
                <button onClick={createChannel} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-900/20">建立任務</button>
                <button onClick={() => setShowAddModal(false)} className="flex-1 py-4 bg-slate-800 text-slate-400 rounded-2xl font-black text-xs uppercase tracking-widest">取消</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
