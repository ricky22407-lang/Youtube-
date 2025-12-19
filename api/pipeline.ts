
import { TrendSearcher } from '../modules/TrendSearcher';
import { TrendSignalExtractor } from '../modules/TrendSignalExtractor';
import { CandidateThemeGenerator } from '../modules/CandidateThemeGenerator';
import { CandidateWeightEngine } from '../modules/CandidateWeightEngine';
import { PromptComposer } from '../modules/PromptComposer';
import { VideoGenerator } from '../modules/VideoGenerator';
import { UploaderScheduler } from '../modules/UploaderScheduler';

export const config = {
  maxDuration: 60,
};

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method Not Allowed' });

  const { stage, channelConfig, metadata, videoAsset } = req.body;
  const logs: string[] = [];
  const log = (msg: string) => logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);

  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("環境變數 API_KEY 缺失，請確保 Vercel 中已設定且已重新部署。");

    // --- 階段 A: 分析與企劃 (Stages 0-4) ---
    if (stage === 'analyze') {
      log("Phase: START - 正在執行趨勢分析與企劃編排...");
      
      const searcher = new TrendSearcher();
      const trends = await searcher.execute(channelConfig);
      log("Phase: TRENDS - 獲取 YouTube 即時趨勢數據。");

      const extractor = new TrendSignalExtractor();
      const signals = await extractor.execute(trends);
      log("Phase: ANALYSIS - 演算法訊號提取完成。");

      const candidateGen = new CandidateThemeGenerator();
      const candidates = await candidateGen.execute(signals);

      const weightEngine = new CandidateWeightEngine();
      const scored = await weightEngine.execute({ candidates, channelState: channelConfig.channelState });
      const winner = scored.find(c => c.selected);
      if (!winner) throw new Error("未選出適合的主題。");
      log(`Phase: WEIGHT - 選定主題: ${winner.subject_type}`);

      const composer = new PromptComposer();
      const resultMetadata = await composer.execute(winner);
      log("Phase: PROMPT - 影片生產指令編排完成。");

      return res.status(200).json({
        success: true,
        logs,
        trends,
        winner,
        metadata: resultMetadata,
        nextStage: 'video'
      });
    }

    // --- 階段 B: 影片生成 (Stage 5) ---
    if (stage === 'video') {
      log("Phase: VEO - 正在啟動 Veo 3.1 渲染引擎...");
      const videoGen = new VideoGenerator();
      // 注意：此處內部 generateVideo 已被優化為可處理長時間任務
      const resultVideo = await videoGen.execute(metadata);
      log("Phase: VEO - 影片生成成功。");

      return res.status(200).json({
        success: true,
        logs,
        videoAsset: resultVideo,
        nextStage: 'upload'
      });
    }

    // --- 階段 C: 上傳發布 (Stage 6) ---
    if (stage === 'upload') {
      log("Phase: UPLOAD - 正在發布至 YouTube 頻道...");
      const uploader = new UploaderScheduler();
      const uploadResult = await uploader.execute({
        video_asset: videoAsset,
        metadata: metadata,
        schedule: channelConfig.schedule,
        authCredentials: channelConfig.auth
      });
      log(`Phase: UPLOAD - 發布成功，ID: ${uploadResult.video_id}`);

      return res.status(200).json({
        success: true,
        logs,
        uploadId: uploadResult.video_id,
        finalUrl: uploadResult.platform_url
      });
    }

    throw new Error("未知的執行階段標記。");

  } catch (error: any) {
    console.error("Pipeline Stage Error:", error);
    return res.status(200).json({
      success: false,
      error: error.message || "系統核心崩潰",
      logs
    });
  }
}
