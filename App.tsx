import React, { useState } from 'react';
import { ModuleCard } from './components/ModuleCard';
import { TrendSignalExtractor } from './modules/TrendSignalExtractor';
import { CandidateThemeGenerator } from './modules/CandidateThemeGenerator';
import { CandidateWeightEngine } from './modules/CandidateWeightEngine';
import { PromptComposer } from './modules/PromptComposer';
import { VideoGenerator } from './modules/VideoGenerator';
import { UploaderScheduler } from './modules/UploaderScheduler';

import { runTrendExtractorTests } from './tests/TrendSignalExtractor.test';
import { runCandidateGeneratorTests } from './tests/CandidateThemeGenerator.test';
import { runWeightEngineTests } from './tests/CandidateWeightEngine.test';
import { runPromptComposerTests } from './tests/PromptComposer.test';
import { runVideoGeneratorTests } from './tests/VideoGenerator.test';
import { runUploaderTests } from './tests/UploaderScheduler.test';

import { MOCK_SHORTS_DATA, MOCK_CHANNEL_STATE } from './constants';
import { 
  ShortsData, TrendSignals, CandidateTheme, PromptOutput, VideoAsset, 
  UploadResult, TestResult 
} from './types';

const App: React.FC = () => {
  // State for pipeline data
  const [trendSignals, setTrendSignals] = useState<TrendSignals | null>(null);
  const [candidates, setCandidates] = useState<CandidateTheme[] | null>(null);
  const [scoredCandidates, setScoredCandidates] = useState<CandidateTheme[] | null>(null);
  const [promptOutput, setPromptOutput] = useState<PromptOutput | null>(null);
  const [videoAsset, setVideoAsset] = useState<VideoAsset | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  // State for statuses
  const [s1Status, setS1Status] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [s2Status, setS2Status] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [s3Status, setS3Status] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [s4Status, setS4Status] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [s5Status, setS5Status] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [s6Status, setS6Status] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // Test Results
  const [t1Result, setT1Result] = useState<TestResult | null>(null);
  const [t2Result, setT2Result] = useState<TestResult | null>(null);
  const [t3Result, setT3Result] = useState<TestResult | null>(null);
  const [t4Result, setT4Result] = useState<TestResult | null>(null);
  const [t5Result, setT5Result] = useState<TestResult | null>(null);
  const [t6Result, setT6Result] = useState<TestResult | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Module Instances
  const extractor = new TrendSignalExtractor();
  const generator = new CandidateThemeGenerator();
  const weighter = new CandidateWeightEngine();
  const composer = new PromptComposer();
  const videoGen = new VideoGenerator();
  const uploader = new UploaderScheduler();

  // Handlers
  const handleExecuteExtractor = async () => {
    setS1Status('loading'); setErrorMsg(null);
    try {
      const result = await extractor.execute(MOCK_SHORTS_DATA);
      setTrendSignals(result); setS1Status('success');
    } catch (e: any) { setErrorMsg(e.message); setS1Status('error'); }
  };

  const handleExecuteGenerator = async () => {
    if (!trendSignals) return;
    setS2Status('loading'); setErrorMsg(null);
    try {
      const result = await generator.execute(trendSignals);
      setCandidates(result); setS2Status('success');
    } catch (e: any) { setErrorMsg(e.message); setS2Status('error'); }
  };

  const handleExecuteWeighter = async () => {
    if (!candidates) return;
    setS3Status('loading'); setErrorMsg(null);
    try {
      const result = await weighter.execute({ candidates, channelState: MOCK_CHANNEL_STATE });
      setScoredCandidates(result); setS3Status('success');
    } catch (e: any) { setErrorMsg(e.message); setS3Status('error'); }
  };

  const handleExecuteComposer = async () => {
    if (!scoredCandidates) return;
    setS4Status('loading'); setErrorMsg(null);
    try {
      const selected = scoredCandidates.find(c => c.selected);
      if (!selected) throw new Error("No candidate selected");
      const result = await composer.execute(selected);
      setPromptOutput(result); setS4Status('success');
    } catch (e: any) { setErrorMsg(e.message); setS4Status('error'); }
  };

  const handleExecuteVideoGen = async () => {
    if (!promptOutput) return;
    setS5Status('loading'); setErrorMsg(null);
    try {
      const result = await videoGen.execute(promptOutput);
      setVideoAsset(result); setS5Status('success');
    } catch (e: any) { setErrorMsg(e.message); setS5Status('error'); }
  };

  const handleExecuteUploader = async () => {
    if (!videoAsset || !promptOutput) return;
    setS6Status('loading'); setErrorMsg(null);
    try {
      // Simulate a scheduled upload for 24 hours later
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const result = await uploader.execute({
        video_asset: videoAsset,
        metadata: promptOutput,
        schedule: {
          privacy_status: 'public',
          publish_at: tomorrow.toISOString()
        }
      });
      setUploadResult(result); setS6Status('success');
    } catch (e: any) { setErrorMsg(e.message); setS6Status('error'); }
  };

  const runTest1 = async () => { const res = await runTrendExtractorTests(); setT1Result(res); return res; }
  const runTest2 = async () => { const res = await runCandidateGeneratorTests(); setT2Result(res); return res; }
  const runTest3 = async () => { const res = await runWeightEngineTests(); setT3Result(res); return res; }
  const runTest4 = async () => { const res = await runPromptComposerTests(); setT4Result(res); return res; }
  const runTest5 = async () => { const res = await runVideoGeneratorTests(); setT5Result(res); return res; }
  const runTest6 = async () => { const res = await runUploaderTests(); setT6Result(res); return res; }

  return (
    <div className="max-w-5xl mx-auto p-8">
      <header className="mb-10 border-b border-slate-700 pb-6">
        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
          YouTube Shorts Automation System
        </h1>
        <p className="text-slate-400 mt-2">
          Project Gemini & Grok • Automated Trend Analysis & Content Generation Pipeline
        </p>
      </header>

      {errorMsg && (
        <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded text-red-200">
          <strong>Error:</strong> {errorMsg}
        </div>
      )}

      <div className="flex flex-col gap-8">
        
        {/* Phase 1-5 Cards (Simplified Rendering Logic for brevity, usually mapped) */}
        {/* Phase 1 */}
        <PipelineStep number="01" title="Trend Signal Extractor" 
          desc="Analyzes raw input data to find statistical signals."
          status={s1Status} canExec={true} onExec={handleExecuteExtractor} 
          onTest={runTest1} testRes={t1Result} data={trendSignals} />
        
        {/* Phase 2 */}
        <PipelineStep number="02" title="Candidate Theme Generator" 
          desc="Brainstorms 3 creative concepts based on trend signals."
          status={s2Status} canExec={!!trendSignals} onExec={handleExecuteGenerator} 
          onTest={runTest2} testRes={t2Result} data={candidates} />

        {/* Phase 3 */}
        <PipelineStep number="03" title="Candidate Weight Engine" 
          desc="Scores candidates on virality & feasibility. Picks the winner."
          status={s3Status} canExec={!!candidates} onExec={handleExecuteWeighter} 
          onTest={runTest3} testRes={t3Result} data={scoredCandidates} />

        {/* Phase 4 */}
        <PipelineStep number="04" title="Prompt Composer" 
          desc="Generates final prompt, title template, and description."
          status={s4Status} canExec={!!scoredCandidates} onExec={handleExecuteComposer} 
          onTest={runTest4} testRes={t4Result} data={promptOutput} />

        {/* Phase 5 */}
        <div className="relative">
          <div className="absolute left-6 top-8 bottom-0 w-0.5 bg-slate-700 -z-10 h-full"></div>
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold shrink-0 transition-colors ${promptOutput ? 'bg-slate-800 border-pink-500 text-pink-400' : 'bg-slate-900 border-slate-700 text-slate-600'}`}>
              05
            </div>
            <div className="flex-1">
              <ModuleCard
                title="Video Generator (Veo)"
                description="Generates AI Video using Veo-3.1-fast model (MP4)."
                status={s5Status} canExecute={!!promptOutput} onExecute={handleExecuteVideoGen}
                onRunTest={runTest5} testResult={t5Result} data={videoAsset}
              />
              {videoAsset && videoAsset.status === 'generated' && (
                <div className="mt-4 p-4 bg-black rounded-xl border border-slate-700">
                   <div className="flex gap-4">
                    <video src={videoAsset.video_url} controls className="h-48 rounded shadow-lg" />
                    <div className="text-sm text-slate-300">
                      <div className="font-bold text-white mb-1">Generated Asset</div>
                      <div>Type: MP4</div>
                      <div>Size: 720x1280</div>
                    </div>
                   </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Phase 6 */}
        <div className="relative">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold shrink-0 transition-colors ${videoAsset ? 'bg-slate-800 border-red-500 text-red-400' : 'bg-slate-900 border-slate-700 text-slate-600'}`}>
              06
            </div>
            <div className="flex-1">
              <ModuleCard
                title="Uploader & Scheduler"
                description="Uploads to YouTube and schedules publication."
                status={s6Status} canExecute={!!videoAsset} onExecute={handleExecuteUploader}
                onRunTest={runTest6} testResult={t6Result} data={uploadResult}
              />
              {uploadResult && uploadResult.status !== 'failed' && (
                <div className="mt-4 p-4 bg-green-900/20 border border-green-500/50 rounded-xl flex flex-col items-center">
                  <div className="text-green-400 font-bold text-lg mb-2">🎉 Pipeline Complete!</div>
                  <a href={uploadResult.platform_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline font-mono text-xl">
                    {uploadResult.platform_url}
                  </a>
                  <div className="text-slate-400 text-sm mt-2">
                    Status: <span className="uppercase text-white">{uploadResult.status}</span>
                    {uploadResult.scheduled_for && <span> • Live at: {new Date(uploadResult.scheduled_for).toLocaleString()}</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
      
      <div className="h-20"></div>
    </div>
  );
};

// Helper Component for repeated structure
const PipelineStep = ({number, title, desc, status, canExec, onExec, onTest, testRes, data}: any) => (
  <div className="relative">
    <div className="absolute left-6 top-8 bottom-0 w-0.5 bg-slate-700 -z-10 h-full"></div>
    <div className="flex items-start gap-4">
      <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold shrink-0 transition-colors ${data ? 'bg-slate-800 border-indigo-500 text-indigo-400' : 'bg-slate-900 border-slate-700 text-slate-600'}`}>
        {number}
      </div>
      <div className="flex-1">
        <ModuleCard
          title={title} description={desc} status={status}
          canExecute={canExec} onExecute={onExec} onRunTest={onTest}
          testResult={testRes} data={data}
        />
      </div>
    </div>
  </div>
);

export default App;