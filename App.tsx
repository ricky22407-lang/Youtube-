import React, { useState, useRef } from 'react';
import { ModuleCard } from './components/ModuleCard';
import { TrendSignalExtractor } from './modules/TrendSignalExtractor';
import { CandidateThemeGenerator } from './modules/CandidateThemeGenerator';
import { CandidateWeightEngine } from './modules/CandidateWeightEngine';
import { PromptComposer } from './modules/PromptComposer';
import { VideoGenerator } from './modules/VideoGenerator';
import { UploaderScheduler } from './modules/UploaderScheduler';

// Tests
import { runTrendExtractorTests } from './tests/TrendSignalExtractor.test';
import { runCandidateGeneratorTests } from './tests/CandidateThemeGenerator.test';
import { runWeightEngineTests } from './tests/CandidateWeightEngine.test';
import { runPromptComposerTests } from './tests/PromptComposer.test';
import { runVideoGeneratorTests } from './tests/VideoGenerator.test';
import { runUploaderTests } from './tests/UploaderScheduler.test';

import { MOCK_SHORTS_DATA, MOCK_CHANNEL_STATE } from './constants';
import { 
  TrendSignals, CandidateTheme, PromptOutput, VideoAsset, 
  UploadResult, TestResult 
} from './types';

const App: React.FC = () => {
  // --- State Management ---
  const [pipelineState, setPipelineState] = useState({
    trendSignals: null as TrendSignals | null,
    candidates: null as CandidateTheme[] | null,
    scoredCandidates: null as CandidateTheme[] | null,
    promptOutput: null as PromptOutput | null,
    videoAsset: null as VideoAsset | null,
    uploadResult: null as UploadResult | null,
  });

  const [statuses, setStatuses] = useState({
    s1: 'idle' as const,
    s2: 'idle' as const,
    s3: 'idle' as const,
    s4: 'idle' as const,
    s5: 'idle' as const,
    s6: 'idle' as const,
  });

  const [testResults, setTestResults] = useState({
    t1: null as TestResult | null,
    t2: null as TestResult | null,
    t3: null as TestResult | null,
    t4: null as TestResult | null,
    t5: null as TestResult | null,
    t6: null as TestResult | null,
  });

  const [globalProgress, setGlobalProgress] = useState(0);
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // --- Module Instances ---
  // Using refs to keep instances stable across renders, though simple instantiation is also fine here.
  const modules = useRef({
    extractor: new TrendSignalExtractor(),
    generator: new CandidateThemeGenerator(),
    weighter: new CandidateWeightEngine(),
    composer: new PromptComposer(),
    videoGen: new VideoGenerator(),
    uploader: new UploaderScheduler(),
  }).current;

  // --- Helper to update status ---
  const updateStatus = (step: keyof typeof statuses, status: typeof statuses['s1']) => {
    setStatuses(prev => ({ ...prev, [step]: status }));
  };

  // --- Individual Execution Handlers ---
  
  const step1_Extract = async () => {
    updateStatus('s1', 'loading'); setErrorMsg(null);
    try {
      const res = await modules.extractor.execute(MOCK_SHORTS_DATA);
      setPipelineState(prev => ({ ...prev, trendSignals: res }));
      updateStatus('s1', 'success');
      return res;
    } catch (e: any) { setErrorMsg(e.message); updateStatus('s1', 'error'); throw e; }
  };

  const step2_Generate = async (input = pipelineState.trendSignals) => {
    if (!input) throw new Error("缺少趨勢訊號資料");
    updateStatus('s2', 'loading'); setErrorMsg(null);
    try {
      const res = await modules.generator.execute(input);
      setPipelineState(prev => ({ ...prev, candidates: res }));
      updateStatus('s2', 'success');
      return res;
    } catch (e: any) { setErrorMsg(e.message); updateStatus('s2', 'error'); throw e; }
  };

  const step3_Weight = async (input = pipelineState.candidates) => {
    if (!input) throw new Error("缺少候選題材資料");
    updateStatus('s3', 'loading'); setErrorMsg(null);
    try {
      const res = await modules.weighter.execute({ candidates: input, channelState: MOCK_CHANNEL_STATE });
      setPipelineState(prev => ({ ...prev, scoredCandidates: res }));
      updateStatus('s3', 'success');
      return res;
    } catch (e: any) { setErrorMsg(e.message); updateStatus('s3', 'error'); throw e; }
  };

  const step4_Compose = async (input = pipelineState.scoredCandidates) => {
    if (!input) throw new Error("缺少已評分題材資料");
    updateStatus('s4', 'loading'); setErrorMsg(null);
    try {
      const selected = input.find(c => c.selected);
      if (!selected) throw new Error("權重引擎未選出優勝題材");
      const res = await modules.composer.execute(selected);
      setPipelineState(prev => ({ ...prev, promptOutput: res }));
      updateStatus('s4', 'success');
      return res;
    } catch (e: any) { setErrorMsg(e.message); updateStatus('s4', 'error'); throw e; }
  };

  const step5_Video = async (input = pipelineState.promptOutput) => {
    if (!input) throw new Error("缺少 Prompt 資料");
    updateStatus('s5', 'loading'); setErrorMsg(null);
    try {
      const res = await modules.videoGen.execute(input);
      setPipelineState(prev => ({ ...prev, videoAsset: res }));
      updateStatus('s5', 'success');
      return res;
    } catch (e: any) { setErrorMsg(e.message); updateStatus('s5', 'error'); throw e; }
  };

  const step6_Upload = async (videoAsset = pipelineState.videoAsset, metadata = pipelineState.promptOutput) => {
    if (!videoAsset || !metadata) throw new Error("缺少影片或 Metadata 資料");
    updateStatus('s6', 'loading'); setErrorMsg(null);
    try {
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      const res = await modules.uploader.execute({
        video_asset: videoAsset, metadata: metadata,
        schedule: { privacy_status: 'public', publish_at: tomorrow.toISOString() }
      });
      setPipelineState(prev => ({ ...prev, uploadResult: res }));
      updateStatus('s6', 'success');
      return res;
    } catch (e: any) { setErrorMsg(e.message); updateStatus('s6', 'error'); throw e; }
  };

  // --- Automation Orchestrator ---
  const runFullAutomation = async () => {
    if (isAutoRunning) return;
    setIsAutoRunning(true);
    setGlobalProgress(5);
    setErrorMsg(null);

    // Reset all statuses if starting fresh
    setStatuses({ s1: 'idle', s2: 'idle', s3: 'idle', s4: 'idle', s5: 'idle', s6: 'idle' });

    try {
      // Step 1
      const s1 = await step1_Extract();
      setGlobalProgress(20);

      // Step 2
      const s2 = await step2_Generate(s1);
      setGlobalProgress(35);

      // Step 3
      const s3 = await step3_Weight(s2);
      setGlobalProgress(50);

      // Step 4
      const s4 = await step4_Compose(s3);
      setGlobalProgress(65);

      // Step 5
      const s5 = await step5_Video(s4);
      setGlobalProgress(85);

      // Step 6
      await step6_Upload(s5, s4);
      setGlobalProgress(100);

    } catch (error) {
      console.error("Automation Stopped due to error");
      // Error message is already set by individual steps
    } finally {
      setIsAutoRunning(false);
    }
  };

  // --- Render ---
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500/30">
      
      {/* Navbar / Progress */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-700">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white">G</div>
            <span className="font-bold text-lg tracking-tight">Shorts Automation System</span>
          </div>
          <div className="flex items-center gap-4">
             <div className="text-xs text-slate-400">目前進度</div>
             <div className="w-48 h-2 bg-slate-800 rounded-full overflow-hidden">
               <div 
                 className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-700 ease-out" 
                 style={{ width: `${globalProgress}%` }}
               />
             </div>
             <div className="text-xs font-mono w-8 text-right">{globalProgress}%</div>
          </div>
        </div>
      </div>

      <div className="pt-24 pb-20 max-w-4xl mx-auto px-6">
        
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 mb-4">
            YouTube Shorts 自動化系統
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            由 Gemini (工程) 與 Grok (PM) 協作打造。
            <br />
            全自動分析趨勢、生成題材、製作影片並排程上傳。
          </p>

          <button
            onClick={runFullAutomation}
            disabled={isAutoRunning}
            className={`mt-8 px-8 py-4 rounded-full font-bold text-lg shadow-xl shadow-indigo-900/20 transform hover:scale-105 transition-all duration-300 flex items-center justify-center gap-3 mx-auto ${isAutoRunning ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white ring-4 ring-indigo-900/50'}`}
          >
            {isAutoRunning ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span>自動化流程執行中...</span>
              </>
            ) : (
              <>
                <span>🚀 一鍵啟動自動化流程</span>
              </>
            )}
          </button>
        </div>

        {/* Guide Section */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 mb-12">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2">
            <span className="text-indigo-400">ℹ️</span> 操作指南
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-slate-300">
            <div className="bg-slate-900/50 p-4 rounded-lg">
              <div className="font-bold text-indigo-300 mb-1">Step 1. 數據輸入</div>
              系統會自動讀取 Mock Data（模擬 Shorts 觀看數、標籤等），無需手動上傳。
            </div>
            <div className="bg-slate-900/50 p-4 rounded-lg">
              <div className="font-bold text-indigo-300 mb-1">Step 2. 智慧生成</div>
              點擊上方「一鍵啟動」，AI 將依序執行趨勢分析、題材篩選、腳本撰寫與影片製作。
            </div>
            <div className="bg-slate-900/50 p-4 rounded-lg">
              <div className="font-bold text-indigo-300 mb-1">Step 3. 預覽與上傳</div>
              流程結束後，您可直接預覽 MP4 影片，並查看模擬的 YouTube 上傳連結。
            </div>
          </div>
        </div>

        {/* Error Display */}
        {errorMsg && (
          <div className="mb-8 p-4 bg-red-900/20 border-l-4 border-red-500 rounded-r text-red-200 flex items-start gap-3 animate-shake">
            <div className="text-xl">⚠️</div>
            <div>
              <strong className="block font-bold">系統發生錯誤</strong>
              <p className="text-sm opacity-90">{errorMsg}</p>
              <p className="text-xs mt-2 opacity-70">建議：請檢查 API Key 配額或網路連線，並重試。</p>
            </div>
          </div>
        )}

        {/* Pipeline Steps (Vertical Layout) */}
        <div className="flex flex-col gap-12 relative">
           {/* Connector Line */}
           <div className="absolute left-[19px] top-10 bottom-10 w-0.5 bg-gradient-to-b from-indigo-900 via-slate-700 to-slate-900 -z-10"></div>

           <ModuleCard
             stepNumber="01"
             title="趨勢訊號分析 (Trend Extractor)"
             description="分析原始 Shorts 數據，提取動作、主體、物件與演算法關鍵字的頻率分佈。"
             status={statuses.s1}
             canExecute={true}
             onExecute={step1_Extract}
             onRunTest={async () => { const r = await runTrendExtractorTests(); setTestResults(p => ({...p, t1: r})); return r; }}
             data={pipelineState.trendSignals}
             testResult={testResults.t1}
           />

           <ModuleCard
             stepNumber="02"
             title="候選題材生成 (Candidate Generator)"
             description="根據趨勢訊號，腦力激盪出 3 個具備爆紅潛力的短影片創意提案。"
             status={statuses.s2}
             canExecute={!!pipelineState.trendSignals}
             onExecute={() => step2_Generate()}
             onRunTest={async () => { const r = await runCandidateGeneratorTests(); setTestResults(p => ({...p, t2: r})); return r; }}
             data={pipelineState.candidates}
             testResult={testResults.t2}
           />

           <ModuleCard
             stepNumber="03"
             title="題材權重評分 (Weight Engine)"
             description="針對頻道屬性進行評分（病毒性、執行度、趨勢度），選出唯一的優勝題材。"
             status={statuses.s3}
             canExecute={!!pipelineState.candidates}
             onExecute={() => step3_Weight()}
             onRunTest={async () => { const r = await runWeightEngineTests(); setTestResults(p => ({...p, t3: r})); return r; }}
             data={pipelineState.scoredCandidates}
             testResult={testResults.t3}
           />

           <ModuleCard
             stepNumber="04"
             title="提示詞與腳本撰寫 (Prompt Composer)"
             description="為優勝題材生成詳細的 AI 繪圖/影片提示詞 (Prompt)，以及吸睛標題與 SEO 描述。"
             status={statuses.s4}
             canExecute={!!pipelineState.scoredCandidates}
             onExecute={() => step4_Compose()}
             onRunTest={async () => { const r = await runPromptComposerTests(); setTestResults(p => ({...p, t4: r})); return r; }}
             data={pipelineState.promptOutput}
             testResult={testResults.t4}
           />

           <ModuleCard
             stepNumber="05"
             title="AI 影片生成 (Video Generator - Veo)"
             description="呼叫 Google Veo 模型，根據 Prompt 生成真實的 MP4 短影片素材。"
             status={statuses.s5}
             canExecute={!!pipelineState.promptOutput}
             onExecute={() => step5_Video()}
             onRunTest={async () => { const r = await runVideoGeneratorTests(); setTestResults(p => ({...p, t5: r})); return r; }}
             data={pipelineState.videoAsset}
             testResult={testResults.t5}
           >
             {pipelineState.videoAsset && pipelineState.videoAsset.status === 'generated' && (
               <div className="bg-black rounded-lg overflow-hidden border border-slate-700 shadow-2xl max-w-sm mx-auto">
                 <div className="relative aspect-[9/16]">
                    <video 
                      src={pipelineState.videoAsset.video_url} 
                      controls 
                      autoPlay 
                      loop 
                      className="w-full h-full object-cover"
                    />
                 </div>
                 <div className="p-3 bg-slate-900">
                    <div className="text-xs text-slate-400 mb-1">預覽標題</div>
                    <div className="font-bold text-white text-sm line-clamp-2">{pipelineState.promptOutput?.title_template}</div>
                 </div>
               </div>
             )}
           </ModuleCard>

           <ModuleCard
             stepNumber="06"
             title="自動上傳與排程 (Uploader)"
             description="模擬 YouTube API 上傳流程，並設定影片隱私狀態與發布時間。"
             status={statuses.s6}
             canExecute={!!pipelineState.videoAsset}
             onExecute={() => step6_Upload()}
             onRunTest={async () => { const r = await runUploaderTests(); setTestResults(p => ({...p, t6: r})); return r; }}
             data={pipelineState.uploadResult}
             testResult={testResults.t6}
           >
             {pipelineState.uploadResult && pipelineState.uploadResult.status !== 'failed' && (
               <div className="bg-gradient-to-r from-green-900/40 to-emerald-900/40 border border-green-500/30 rounded-xl p-6 text-center animate-fade-in">
                 <div className="text-4xl mb-2">🎉</div>
                 <h4 className="text-xl font-bold text-green-300 mb-2">自動化流程執行完畢！</h4>
                 <p className="text-slate-300 text-sm mb-4">影片已成功排程並上傳至 YouTube</p>
                 
                 <a 
                   href={pipelineState.uploadResult.platform_url} 
                   target="_blank" 
                   rel="noreferrer" 
                   className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-colors"
                 >
                   <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                   前往 YouTube 觀看
                 </a>
                 
                 <div className="mt-4 text-xs text-slate-500 font-mono">
                   Video ID: {pipelineState.uploadResult.video_id} <br/>
                   Scheduled: {new Date(pipelineState.uploadResult.scheduled_for || '').toLocaleString()}
                 </div>
               </div>
             )}
           </ModuleCard>

        </div>

      </div>
      
      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 py-8 text-center text-slate-500 text-sm">
        <p>© 2023 Shorts Automation System.</p>
        <p className="mt-2 text-xs">Roles: Gemini (Engineering) • Grok (Product Management)</p>
      </footer>
    </div>
  );
};

export default App;