
import { PipelineCore } from '../services/pipelineCore';

export const config = {
  maxDuration: 300,
  api: { bodyParser: { sizeLimit: '15mb' } }
};

export default async function handler(req: any, res: any) {
  // 設定回應格式
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Only POST allowed' });
  }

  const logs: string[] = [];
  const log = (msg: string) => {
    logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    console.log(`[PIPELINE_STG] ${msg}`);
  };

  try {
    const { stage, channelConfig, metadata, videoAsset } = req.body;
    
    if (!process.env.API_KEY) {
      throw new Error("SERVER_CONFIG_ERROR: API_KEY is not defined in environment.");
    }

    switch (stage) {
      case 'analyze':
        log("分析啟動...");
        const trends = await PipelineCore.fetchTrends(channelConfig);
        const resultMetadata = await PipelineCore.planContent(trends, channelConfig.channelState);
        return res.status(200).json({ success: true, logs, trends, metadata: resultMetadata });

      case 'video':
        log("影像引擎啟動...");
        if (!metadata) throw new Error("Metadata is required for video stage");
        const resultVideo = await PipelineCore.renderVideo(metadata);
        return res.status(200).json({ success: true, logs, videoAsset: resultVideo });

      case 'upload':
        log("發布程序啟動...");
        if (!videoAsset) throw new Error("Video asset is required for upload stage");
        const uploadResult = await PipelineCore.uploadVideo({
          video_asset: videoAsset,
          metadata: metadata,
          schedule: channelConfig.schedule,
          authCredentials: channelConfig.auth
        });
        return res.status(200).json({ success: true, logs, uploadId: uploadResult.video_id, finalUrl: uploadResult.platform_url });

      default:
        return res.status(400).json({ success: false, error: `Unsupported stage: ${stage}` });
    }

  } catch (error: any) {
    console.error("Critical API Error:", error);
    return res.status(200).json({
      success: false,
      error: `RUNTIME_EXCEPTION: ${error.message || "Unknown error occurred during processing."}`,
      logs
    });
  }
}
