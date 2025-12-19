
import { TrendSearcher } from '../modules/TrendSearcher';
import { TrendSignalExtractor } from '../modules/TrendSignalExtractor';
import { CandidateThemeGenerator } from '../modules/CandidateThemeGenerator';
import { CandidateWeightEngine } from '../modules/CandidateWeightEngine';
import { PromptComposer } from '../modules/PromptComposer';
import { VideoGenerator } from '../modules/VideoGenerator';
import { UploaderScheduler } from '../modules/UploaderScheduler';
import { ChannelConfig, PipelineResult, ShortsData } from '../types';

export const config = {
  maxDuration: 60, // 確保超時設定足夠長，適應 9:16 Veo 渲染
};

export default async function handler(req: any, res: any) {
  const logs: string[] = [];
  const log = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    console.log(`[Pipeline ${time}] ${msg}`);
    logs.push(msg);
  };

  let capturedTrends: ShortsData[] = [];
  let capturedWinner: any = null;
  let capturedMetadata: any = null;

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 環境變數防禦
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("Phase: CRITICAL - 系統缺失環境變數: API_KEY。請檢查 Vercel 設定。");
    }

    // 穩健的 Body 解析
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {
      throw new Error("Phase: START - 無法解析 JSON 請求主體。");
    }

    const { channelConfig } = body as { channelConfig: ChannelConfig };
    if (!channelConfig) {
      throw new Error("Phase: START - Missing channelConfig in request.");
    }

    // Stage 0: Trends
    try {
        log("Phase: TRENDS - 正在調用 YouTube Data API 獲取地區即時趨勢...");
        const searcher = new TrendSearcher();
        capturedTrends = await searcher.execute(channelConfig);
        log(`Phase: TRENDS - 成功抓取 ${capturedTrends.length} 條原始趨勢數據。`);
    } catch (e: any) {
        throw new Error(`[TRENDS_ERROR] ${e.message}`);
    }

    // Stage 1: Extraction (Gemini 3 Flash)
    let signals;
    try {
        log("Phase: ANALYSIS - Gemini 3 正在進行深度演算法訊號提取...");
        const extractor = new TrendSignalExtractor();
        signals = await extractor.execute(capturedTrends);
        log("Phase: ANALYSIS - 訊號解析完成。");
    } catch (e: any) {
        throw new Error(`[ANALYSIS_ERROR] ${e.message}`);
    }

    // Stage 2: Generation
    let candidates;
    try {
        log("Phase: CREATIVE - 正在發想最具爆紅潛力的 3 個創意主題...");
        const candidateGen = new CandidateThemeGenerator();
        candidates = await candidateGen.execute(signals);
        log("Phase: CREATIVE - 創意方案生成完成。");
    } catch (e: any) {
        throw new Error(`[THEMES_ERROR] ${e.message}`);
    }

    // Stage 3: Evaluation (Weight Engine)
    try {
        log("Phase: WEIGHT - 正在執行演算法評分與頻道主軸對齊...");
        const weightEngine = new CandidateWeightEngine();
        const scored = await weightEngine.execute({
            candidates,
            channelState: channelConfig.channelState
        });
        capturedWinner = scored.find(c => c.selected);
        if (!capturedWinner) throw new Error("評分模組異常：未選出合適主題。");
        log(`Phase: WEIGHT - 選定方案: ${capturedWinner.subject_type} (評分: ${capturedWinner.total_score})`);
    } catch (e: any) {
        throw new Error(`[WEIGHT_ERROR] ${e.message}`);
    }

    // Stage 4: Prompting
    try {
        log("Phase: PROMPT - 正在為 Veo 3.1 編排高精細度視覺腳本...");
        const composer = new PromptComposer();
        capturedMetadata = await composer.execute(capturedWinner);
        log("Phase: PROMPT - 指令編排完成。");
    } catch (e: any) {
        throw new Error(`[PROMPT_ERROR] ${e.message}`);
    }

    // Stage 5: Video (Veo 3.1)
    let videoAsset;
    try {
        log("Phase: VEO - 正在啟動 Veo 渲染引擎 (垂直 9:16)...");
        const videoGen = new VideoGenerator();
        videoAsset = await videoGen.execute(capturedMetadata);
        log("Phase: VEO - 影片渲染與編碼成功。");
    } catch (e: any) {
        throw new Error(`[VEO_ERROR] ${e.message}`);
    }

    // Stage 6: Upload
    let uploadResult;
    try {
        log("Phase: UPLOAD - 正在發送至 YouTube API 進行發布...");
        const uploader = new UploaderScheduler();
        uploadResult = await uploader.execute({
            video_asset: videoAsset,
            metadata: capturedMetadata,
            schedule: channelConfig.schedule,
            authCredentials: channelConfig.auth || undefined
        });
        log(`Phase: UPLOAD - 流程圓滿成功！影片 ID: ${(uploadResult as any).video_id}`);
    } catch (e: any) {
        throw new Error(`[UPLOAD_ERROR] ${e.message}`);
    }
    
    // 成功回傳
    return res.status(200).json({
        success: true,
        logs: logs,
        videoUrl: videoAsset.video_url,
        uploadId: (uploadResult as any).video_id,
        trends: capturedTrends,
        winner: capturedWinner,
        metadata: capturedMetadata
    });

  } catch (error: any) {
    console.error("PIPELINE_ERROR_CAPTURE:", error);
    // 即使失敗也確保回傳 JSON，防止前端解析 HTML 錯誤
    return res.status(200).json({ 
        success: false, 
        logs: logs, 
        error: error.message || "發生未預期的系統核心錯誤",
        trends: capturedTrends,
        winner: capturedWinner
    });
  }
}
