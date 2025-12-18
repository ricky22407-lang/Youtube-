
import React, { useState, useEffect } from 'react';
import { 
  ChannelConfig, LogEntry, PipelineResult 
} from './types';
import { MOCK_CHANNEL_STATE } from './constants';

// Proper global augmentation for AIStudio selection dialog
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  // Using var inside declare global to define a global variable that is also on window
  var aistudio: AIStudio;
}

// Global Error Boundary to catch runtime failures gracefully
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-red-400 p-8 text-center">
          <div className="max-w-xl">
            <h1 className="text-4xl font-black mb-4">SYSTEM CRITICAL ⚠️</h1>
            <p className="bg-red-950/20 border border-red-900 p-6 rounded-xl text-left font-mono text-sm overflow-auto">
              {this.state.error?.message || "Internal System Error"}
            </p>
            <button onClick={() => window.location.reload()} className="mt-8 px-8 py-3 bg-red-600 text-white rounded-full font-bold hover:bg-red-500 transition-all shadow-lg shadow-red-900/40">
              RESTART SYSTEM
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const AppContent: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logs'>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);

  const [newChannelName, setNewChannelName] = useState("");
  const [newKeywords, setNewKeywords] = useState("AI, Tech");
  const [newRegion, setNewRegion] = useState("US");

  useEffect(() => {
    const init = async () => {
      // Check for API key selection state on boot
      if (window.aistudio) {
        try {
          const selected = await window.aistudio.hasSelectedApiKey();
          setHasApiKey(selected);
        } catch (e) { console.error(e); }
      }
      const saved = localStorage.getItem('sas_channels');
      if (saved) setChannels(JSON.parse(saved));
      
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const pendingId = localStorage.getItem('sas_pending_auth_id');
      if (code && pendingId) handleAuthCallback(code, pendingId);
      
      setIsLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!isLoading) localStorage.setItem('sas_channels', JSON.stringify(channels));
  }, [channels, isLoading]);

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      // Guidelines: proceed immediately to avoid race condition after opening dialog
      setHasApiKey(true);
    }
  };

  const addLog = (channelId: string, channelName: string, level: 'info' | 'success' | 'error', msg: string) => {
    setLogs(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      channelId,
      channelName,
      level,
      message: String(msg)
    }, ...prev].slice(0, 100));
  };

  const handleAuthCallback = async (code: string, channelId: string) => {
    window.history.replaceState({}, document.title, window.location.pathname);
    localStorage.removeItem('sas_pending_auth_id');
    addLog(channelId, 'System', 'info', 'Finalizing OAuth Handshake...');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ code })
      });
      
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Auth API Error: ${text}`);
      }

      const data = await res.json();
      if (data.tokens) {
        updateChannel(channelId, { auth: data.tokens });
        addLog(channelId, 'System', 'success', 'YouTube Auth Successful!');
      }
    } catch (e: any) { 
      addLog(channelId, 'System', 'error', e.message || String(e)); 
    }
  };

  const createChannel = () => {
    const newChannel: ChannelConfig = {
      id: Date.now().toString(),
      name: newChannelName || "New Channel",
      regionCode: newRegion,
      searchKeywords: newKeywords.split(',').map(s => s.trim()),
      channelState: { ...MOCK_CHANNEL_STATE, niche: newKeywords },
      schedule: { active: false, privacy_status: 'private' },
      auth: null,
      status: 'idle'
    };
    setChannels(prev => [...prev, newChannel]);
    setIsAdding(false);
    setNewChannelName("");
  };

  const updateChannel = (id: string, updates: Partial<ChannelConfig>) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const startAuth = async (channelId: string) => {
    localStorage.setItem('sas_pending_auth_id', channelId);
    try {
        const res = await fetch('/api/auth?action=url');
        if (!res.ok) throw new Error("Could not fetch Auth URL");
        const data = await res.json();
        if (data.url) window.location.href = data.url;
    } catch (e: any) { addLog(channelId, 'System', 'error', e.message || String(e)); }
  };

  const runAutomation = async (channel: ChannelConfig) => {
    if (!channel.auth) return alert("Authorize YouTube first");
    
    updateChannel(channel.id, { status: 'running' });
    addLog(channel.id, channel.name, 'info', 'Initiating 7-Stage Pipeline...');
    
    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ channelConfig: channel })
      });

      let result: PipelineResult;
      const contentType = res.headers.get("content-type");
      
      if (contentType && typeof contentType === 'string' && contentType.toLowerCase().includes("application/json")) {
        result = await res.json();
      } else {
        const textError = await res.text();
        throw new Error(`Server response (Type: ${contentType}): ${textError.slice(0, 100)}`);
      }

      if (!res.ok || !result.success) {
        const errMsg = result.error ? (typeof result.error === 'string' ? result.error : JSON.stringify(result.error)) : "Pipeline Failed";
        
        // Reset key selection if entity was not found (sign of invalid/missing key on backend)
        if (typeof errMsg === 'string' && errMsg.includes("Requested entity was not found")) {
          setHasApiKey(false);
        }
        throw new Error(errMsg);
      }

      addLog(channel.id, channel.name, 'success', `Video Generated & Uploaded: ${result.uploadId}`);
      updateChannel(channel.id, { status: 'success', lastRun: new Date().toLocaleString() });
    } catch (e: any) {
      const finalMsg = e.message || String(e);
      addLog(channel.id, channel.name, 'error', `CRITICAL: ${finalMsg}`);
      updateChannel(channel.id, { status: 'error' });
      console.error("Pipeline Failure Detail:", e);
    }
  };

  if (isLoading) return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-500 font-mono"><div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>LOADING_CORE...</div>;

  // Render API Key Selection screen if mandatory key is missing
  if (!hasApiKey) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 selection:bg-indigo-500 selection:text-white">
      <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-10 shadow-2xl text-center backdrop-blur-xl">
        <div className="w-20 h-20 bg-amber-500/10 text-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-8 animate-bounce">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m0 0v2m0-2h2m-2 0H10m10-6a8 8 0 11-16 0 8 8 0 0116 0z" /></svg>
        </div>
        <h2 className="text-3xl font-black text-white mb-4 tracking-tight">API BILLING REQUIRED</h2>
        <p className="text-slate-400 mb-10 leading-relaxed text-lg">
          Please select an API key from a paid Google Cloud project to continue. 
          Video generation via Veo models requires a billing-enabled project.
        </p>
        <button 
          onClick={handleSelectKey}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold transition-all shadow-lg shadow-indigo-900/40 text-lg"
        >
          SELECT API KEY
        </button>
        <a 
          href="https://ai.google.dev/gemini-api/docs/billing" 
          target="_blank" 
          rel="noopener noreferrer"
          className="block mt-6 text-sm text-slate-500 hover:text-indigo-400 transition-colors"
        >
          Learn more about billing & quotas
        </a>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-2xl font-black tracking-tighter text-white">SHORTS<span className="text-indigo-500">AUTOPILOT</span></h1>
          </div>
          <div className="flex bg-slate-800 p-1 rounded-xl">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
            >
              DASHBOARD
            </button>
            <button 
              onClick={() => setActiveTab('logs')}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'logs' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
            >
              SYSTEM LOGS
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'dashboard' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">Channels</h2>
                <button 
                  onClick={() => setIsAdding(true)}
                  className="px-4 py-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-lg text-sm font-bold hover:bg-indigo-600/30 transition-all"
                >
                  + ADD CHANNEL
                </button>
              </div>

              {isAdding && (
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-xl animate-slide-down">
                  <h3 className="text-lg font-bold mb-4">Add New Automation Channel</h3>
                  <div className="space-y-4">
                    <input 
                      placeholder="Channel Name"
                      value={newChannelName}
                      onChange={e => setNewChannelName(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input 
                      placeholder="Keywords (e.g. AI, Tech)"
                      value={newKeywords}
                      onChange={e => setNewKeywords(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <div className="flex gap-4">
                      <button onClick={createChannel} className="flex-1 py-3 bg-indigo-600 rounded-lg font-bold">CREATE</button>
                      <button onClick={() => setIsAdding(false)} className="px-6 py-3 bg-slate-800 rounded-lg font-bold">CANCEL</button>
                    </div>
                  </div>
                </div>
              )}

              {channels.length === 0 ? (
                <div className="bg-slate-900/50 border-2 border-dashed border-slate-800 rounded-3xl p-12 text-center">
                  <p className="text-slate-500">No channels configured. Add your first YouTube channel to start.</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {channels.map(channel => (
                    <div key={channel.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex justify-between items-center group hover:border-indigo-500/50 transition-all">
                      <div>
                        <h3 className="text-lg font-bold text-white">{channel.name}</h3>
                        <p className="text-slate-500 text-sm">{channel.regionCode} • {channel.searchKeywords.join(', ')}</p>
                      </div>
                      <div className="flex gap-3">
                        {!channel.auth ? (
                          <button onClick={() => startAuth(channel.id)} className="px-4 py-2 bg-amber-600/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold">AUTHORIZE YT</button>
                        ) : (
                          <button 
                            onClick={() => runAutomation(channel)} 
                            disabled={channel.status === 'running'}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold disabled:opacity-50"
                          >
                            {channel.status === 'running' ? 'RUNNING...' : 'RUN PIPELINE'}
                          </button>
                        )}
                        <button 
                          onClick={() => setChannels(channels.filter(c => c.id !== channel.id))}
                          className="p-2 text-slate-600 hover:text-red-400 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="bg-gradient-to-br from-indigo-900/40 to-slate-900 border border-indigo-500/20 rounded-3xl p-6">
                <h2 className="text-indigo-400 text-xs font-black uppercase tracking-widest mb-4">Live Statistics</h2>
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <span className="text-slate-400 text-sm">Active Channels</span>
                    <span className="text-2xl font-black text-white">{channels.length}</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <span className="text-slate-400 text-sm">Pipeline Success</span>
                    <span className="text-2xl font-black text-green-400">98.2%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Stream Log History</span>
              <button onClick={() => setLogs([])} className="text-xs text-red-400 hover:text-red-300 font-bold">CLEAR ALL</button>
            </div>
            <div className="h-[600px] overflow-y-auto p-4 font-mono text-sm space-y-2 scrollbar-thin scrollbar-thumb-slate-700">
              {logs.length === 0 ? (
                <div className="text-slate-600 text-center py-20">No logs generated yet.</div>
              ) : (
                logs.map(log => (
                  <div key={log.id} className="flex gap-4 p-2 rounded hover:bg-slate-800/50 transition-colors">
                    <span className="text-slate-600 shrink-0">[{log.timestamp}]</span>
                    <span className={`shrink-0 font-bold ${log.level === 'error' ? 'text-red-400' : log.level === 'success' ? 'text-green-400' : 'text-indigo-400'}`}>
                      {log.channelName}:
                    </span>
                    <span className="text-slate-300">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

// Main App component exported as default to satisfy index.tsx import
const App: React.FC = () => (
  <ErrorBoundary>
    <AppContent />
  </ErrorBoundary>
);

export default App;
