import { TrendSearcher } from '../modules/TrendSearcher';
import { TrendSignalExtractor } from '../modules/TrendSignalExtractor';
import { CandidateThemeGenerator } from '../modules/CandidateThemeGenerator';
import { CandidateWeightEngine } from '../modules/CandidateWeightEngine';
import { PromptComposer } from '../modules/PromptComposer';
import { VideoGenerator } from '../modules/VideoGenerator';
import { UploaderScheduler } from '../modules/UploaderScheduler';
import { ChannelConfig, PipelineResult, ShortsData } from '../types';

// Vercel Serverless Config
// Attempt to increase timeout to 60s (Max for Hobby/Pro limits apply)
export const config = {
  maxDuration: 60, 
};

export default async function handler(req: any, res: any) {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(`[Pipeline] ${msg}`);
    logs.push(msg);
  };

  log("Request Received");

  // 1. Method Validation
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 2. Environment Diagnostics
  const envStatus = {
    API_KEY: process.env.API_KEY ? "OK" : "MISSING",
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? "OK" : "MISSING",
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? "OK" : "MISSING",
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || "MISSING"
  };
  console.log("Environment Diagnostics:", JSON.stringify(envStatus, null, 2));

  if (!process.env.API_KEY) {
    log("CRITICAL: API_KEY is missing from server environment.");
    return res.status(500).json({ 
        success: false, 
        logs, 
        error: 'Server Misconfiguration: API_KEY missing. Check Vercel Environment Variables.' 
    });
  }

  try {
    // 3. Input Validation
    const { channelConfig, forceMock } = req.body as { channelConfig: ChannelConfig, forceMock?: boolean };
    
    if (!channelConfig) {
        throw new Error("Invalid Input: 'channelConfig' is required.");
    }
    
    log(`🚀 Starting Automation for Channel: ${channelConfig.name} (${channelConfig.id})`);

    // --- Step 0: Trend Search (Real or Mock) ---
    const searcher = new TrendSearcher();
    let shortsData: ShortsData[];
    
    try {
        if (forceMock) {
            log("⚠️ Force Mock Data enabled.");
            shortsData = (searcher as any).getMockData();
        } else {
            // Safety check for TrendSearcher dependencies
            if (!channelConfig.auth && !process.env.GOOGLE_CLIENT_ID) {
                log("⚠️ No Auth & No Client ID. Falling back to Mock to prevent crash.");
                shortsData = (searcher as any).getMockData();
            } else {
                shortsData = await searcher.execute(channelConfig);
            }
        }
    } catch (e: any) {
        log(`⚠️ Trend Search Failed: ${e.message}. Using Mock Data fallback.`);
        shortsData = (searcher as any).getMockData();
    }
    
    log(`✅ Trends Fetched: ${shortsData.length} items`);

    // --- Step 1: Extract Signals ---
    const extractor = new TrendSignalExtractor();
    const trendSignals = await extractor.execute(shortsData);
    log("✅ Signals Extracted");

    // --- Step 2: Generate Candidates ---
    const candidateGen = new CandidateThemeGenerator();
    const candidates = await candidateGen.execute(trendSignals);
    log(`✅ Candidates Generated: ${candidates.length}`);

    // --- Step 3: Weight & Select ---
    const weightEngine = new CandidateWeightEngine();
    const scoredCandidates = await weightEngine.execute({
        candidates,
        channelState: channelConfig.channelState
    });
    const winner = scoredCandidates.find(c => c.selected);
    if (!winner) throw new Error("No winner selected by Weight Engine.");
    log(`✅ Winner Selected: ${winner.id} (${winner.total_score} pts)`);

    // --- Step 4: Compose Prompt ---
    const composer = new PromptComposer();
    const promptOutput = await composer.execute(winner);
    log("✅ Prompt & Metadata Composed");

    // --- Step 5: Generate Video (Veo) ---
    const videoGen = new VideoGenerator();
    let videoAsset;
    try {
        videoAsset = await videoGen.execute(promptOutput);
        log("✅ Video Generated (Veo 3.1 9:16)");
    } catch (e: any) {
        log(`⚠️ Video Generation Failed: ${e.message}`);
        throw new Error(`Video Gen Error: ${e.message}. Possible Vercel Timeout or API limit.`);
    }

    // --- Step 6: Upload to YouTube ---
    const uploader = new UploaderScheduler();
    
    // Construct Uploader Input
    const uploadInput = {
        video_asset: videoAsset,
        metadata: promptOutput,
        schedule: channelConfig.schedule,
        authCredentials: channelConfig.auth || undefined
    };

    let uploadResult;
    try {
        uploadResult = await uploader.execute(uploadInput);
        log(`✅ Upload Process Complete. Status: ${uploadResult.status}`);
    } catch (e: any) {
         log(`⚠️ Upload Failed: ${e.message}`);
         // We don't throw here, we return what we have so far
         uploadResult = { status: 'failed', platform_url: '', video_id: '', uploaded_at: new Date().toISOString() };
    }
    
    if (uploadResult.status === 'uploaded' || uploadResult.status === 'scheduled') {
        log(`🔗 URL: ${uploadResult.platform_url}`);
    }

    const result: PipelineResult = {
        success: true,
        logs: logs,
        videoUrl: videoAsset.video_url,
        uploadId: (uploadResult as any).video_id
    };

    return res.status(200).json(result);

  } catch (error: any) {
    console.error("CRITICAL PIPELINE FAILURE:", error);
    log(`❌ Fatal Error: ${error.message}`);
    
    // Ensure we return 200 with error details so frontend can display logs instead of generic 500
    return res.status(200).json({ 
        success: false, 
        logs, 
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}