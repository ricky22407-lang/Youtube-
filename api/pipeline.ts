
import { TrendSearcher } from '../modules/TrendSearcher';
import { TrendSignalExtractor } from '../modules/TrendSignalExtractor';
import { CandidateThemeGenerator } from '../modules/CandidateThemeGenerator';
import { CandidateWeightEngine } from '../modules/CandidateWeightEngine';
import { PromptComposer } from '../modules/PromptComposer';
import { VideoGenerator } from '../modules/VideoGenerator';
import { UploaderScheduler } from '../modules/UploaderScheduler';
import { ChannelConfig, PipelineResult, ShortsData } from '../types';

export const config = {
  maxDuration: 60, 
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
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("Phase: CRITICAL - Server environment variable API_KEY is missing.");

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { channelConfig } = body as { channelConfig: ChannelConfig };
    
    if (!channelConfig) throw new Error("Phase: START - Missing channelConfig in request body.");

    // Stage 1: Trends
    try {
        log("Phase: TRENDS - 正在利用 YouTube Data API 抓取該地區熱門 Shorts...");
        const searcher = new TrendSearcher();
        capturedTrends = await searcher.execute(channelConfig);
        log(`Phase: TRENDS - 成功取得 ${capturedTrends.length} 部熱門影片數據。`);
    } catch (e: any) {
        throw new Error(`[TRENDS_ERROR] 趨勢抓取失敗: ${e.message}`);
    }

    // Stage 2: Extraction
    let signals;
    try {
        log("Phase: ANALYSIS - 正在交由 Gemini 解析觀看增長與標籤訊號...");
        const extractor = new TrendSignalExtractor();
        signals = await extractor.execute(capturedTrends);
        log("Phase: ANALYSIS - 訊號解析完成。");
    } catch (e: any) {
        throw new Error(`[ANALYSIS_ERROR] Gemini 訊號提取失敗: ${e.message}`);
    }

    // Stage 3: Generation
    let candidates;
    try {
        log("Phase: CREATIVE - 正在生成 3 個候選創意主題...");
        const candidateGen = new CandidateThemeGenerator();
        candidates = await candidateGen.execute(signals);
        log("Phase: CREATIVE - 主題發想完成。");
    } catch (e: any) {
        throw new Error(`[THEMES_ERROR] 創意生成失敗: ${e.message}`);
    }

    // Stage 4: Evaluation
    try {
        log("Phase: WEIGHT - 正在執行演算法權重評分與主軸媒合...");
        const weightEngine = new CandidateWeightEngine();
        const scored = await weightEngine.execute({
            candidates,
            channelState: channelConfig.channelState
        });
        capturedWinner = scored.find(c => c.selected);
        if (!capturedWinner) throw new Error("權重引擎未選出適合的影片主題。");
        log(`Phase: WEIGHT - 選定主題：${capturedWinner.subject_type} (得分: ${capturedWinner.total_score})`);
    } catch (e: any) {
        throw new Error(`[WEIGHT_ERROR] 權重分析失敗: ${e.message}`);
    }

    // Stage 5: Prompting
    try {
        log("Phase: PROMPT - 正在編排 Veo 專用 Prompt 與 YouTube Metadata...");
        const composer = new PromptComposer();
        capturedMetadata = await composer.execute(capturedWinner);
        log("Phase: PROMPT - 腳本編排完成。");
    } catch (e: any) {
        throw new Error(`[PROMPT_ERROR] Prompt 編排失敗: ${e.message}`);
    }

    // Stage 6: Video (Veo)
    let videoAsset;
    try {
        log("Phase: VEO - 正在啟動 Veo 3.1 影片生成流程 (長延時操作)...");
        const videoGen = new VideoGenerator();
        videoAsset = await videoGen.execute(capturedMetadata);
        log("Phase: VEO - 影片生成成功。");
    } catch (e: any) {
        throw new Error(`[VEO_ERROR] Veo 3.1 API 生成失敗: ${e.message}`);
    }

    // Stage 7: Upload
    let uploadResult;
    try {
        log("Phase: UPLOAD - 正在透過使用者授權上傳至 YouTube...");
        const uploader = new UploaderScheduler();
        uploadResult = await uploader.execute({
            video_asset: videoAsset,
            metadata: capturedMetadata,
            schedule: channelConfig.schedule,
            authCredentials: channelConfig.auth || undefined
        });
        log(`Phase: UPLOAD - 上傳成功！影片 ID: ${(uploadResult as any).video_id}`);
    } catch (e: any) {
        throw new Error(`[UPLOAD_ERROR] YouTube 上傳失敗: ${e.message}`);
    }
    
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
    return res.status(500).json({ 
        success: false, 
        logs: logs, 
        error: error.message || "伺服器內部錯誤",
        trends: capturedTrends,
        winner: capturedWinner
    });
  }
}
