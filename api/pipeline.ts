
import { PipelineCore } from '../services/pipelineCore';

export const config = {
  maxDuration: 300, // Veo 影片生成可能需要較長時間
  api: { bodyParser: { sizeLimit: '10mb' } }
};

export default async function handler(req: any, res: any) {
  // 強制設定 JSON 回應
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method Not Allowed' });

  const logs: string[] = [];
  const log = (msg: string) => {
    logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    console.log(`[PIPELINE] ${msg}`);
  };

  try {
    const { stage, channelConfig, metadata, videoAsset } = req.body;
    
    if (!process.env.API_KEY) throw new Error("環境變數 API_KEY 缺失，請檢查設定。");

    switch (stage) {
      case 'analyze':
        log("開始分析熱門趨勢...");
        const trends = await PipelineCore.fetchTrends(channelConfig);
        log("趨勢分析完成，正在構思影片企劃...");
        const resultMetadata = await PipelineCore.planContent(trends, channelConfig.channelState);
        return res.status(200).json({ success: true, logs, trends, metadata: resultMetadata });

      case 'video':
        log("啟動 Veo 3.1 影片生成引擎 (此步驟約需 45-90 秒)...");
        if (!metadata) throw new Error("缺少企劃元數據 (Metadata)");
        const resultVideo = await PipelineCore.renderVideo(metadata);
        log("影片渲染成功！");
        return res.status(200).json({ success: true, logs, videoAsset: resultVideo });

      case 'upload':
        log("準備發布至 YouTube...");
        if (!videoAsset) throw new Error("缺少影片素材 (VideoAsset)");
        const uploadResult = await PipelineCore.uploadVideo({
          video_asset: videoAsset,
          metadata: metadata,
          schedule: channelConfig.schedule,
          authCredentials: channelConfig.auth
        });
        log("影片已成功同步。");
        return res.status(200).json({ success: true, logs, uploadId: uploadResult.video_id, finalUrl: uploadResult.platform_url });

      default:
        throw new Error(`未支援的管線階段: ${stage}`);
    }

  } catch (error: any) {
    console.error("Pipeline Runtime Error:", error);
    // 確保即使發生嚴重錯誤，也回傳 JSON 而不是讓伺服器噴 500
    return res.status(200).json({
      success: false,
      error: `[INTERNAL_SYSTEM_ERROR] ${error.message || "未知伺服器異常"}`,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      logs
    });
  }
}
