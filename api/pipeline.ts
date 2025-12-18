
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

  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("CRITICAL: API_KEY is missing on server.");

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { channelConfig } = body as { channelConfig: ChannelConfig };
    
    if (!channelConfig) throw new Error("Missing channelConfig.");

    // Stage 1: Trends
    let shortsData: ShortsData[];
    try {
        log("Phase: TRENDS - Fetching YouTube Data...");
        const searcher = new TrendSearcher();
        shortsData = await searcher.execute(channelConfig);
    } catch (e: any) {
        throw new Error(`[TRENDS_STAGE] Failed to fetch YouTube trends: ${e.message}`);
    }

    // Stage 2: Extraction
    let signals;
    try {
        log("Phase: ANALYSIS - Extracting Signals...");
        const extractor = new TrendSignalExtractor();
        signals = await extractor.execute(shortsData);
    } catch (e: any) {
        throw new Error(`[SIGNALS_STAGE] Gemini extraction failed: ${e.message}`);
    }

    // Stage 3: Generation
    let candidates;
    try {
        log("Phase: CREATIVE - Generating Themes...");
        const candidateGen = new CandidateThemeGenerator();
        candidates = await candidateGen.execute(signals);
    } catch (e: any) {
        throw new Error(`[THEMES_STAGE] Creative generation failed: ${e.message}`);
    }

    // Stage 4: Evaluation
    let winner;
    try {
        log("Phase: WEIGHT - Selecting Concept...");
        const weightEngine = new CandidateWeightEngine();
        const scored = await weightEngine.execute({
            candidates,
            channelState: channelConfig.channelState
        });
        winner = scored.find(c => c.selected);
        if (!winner) throw new Error("Selection logic error.");
    } catch (e: any) {
        throw new Error(`[WEIGHT_STAGE] Algorithm scoring failed: ${e.message}`);
    }

    // Stage 5: Prompting
    let prompt;
    try {
        log("Phase: PROMPT - Composing Assets...");
        const composer = new PromptComposer();
        prompt = await composer.execute(winner);
    } catch (e: any) {
        throw new Error(`[PROMPT_STAGE] Prompt composition failed: ${e.message}`);
    }

    // Stage 6: Video (Veo)
    let videoAsset;
    try {
        log("Phase: VEO - Generating Video (Long Request)...");
        const videoGen = new VideoGenerator();
        videoAsset = await videoGen.execute(prompt);
    } catch (e: any) {
        throw new Error(`[VEO_STAGE] Video generation failed (Check API Quota/Billing): ${e.message}`);
    }

    // Stage 7: Upload
    let uploadResult;
    try {
        log("Phase: UPLOAD - Publishing to YouTube...");
        const uploader = new UploaderScheduler();
        uploadResult = await uploader.execute({
            video_asset: videoAsset,
            metadata: prompt,
            schedule: channelConfig.schedule,
            authCredentials: channelConfig.auth || undefined
        });
    } catch (e: any) {
        throw new Error(`[UPLOAD_STAGE] YouTube API upload failed: ${e.message}`);
    }
    
    return res.status(200).json({
        success: true,
        logs: logs,
        videoUrl: videoAsset.video_url,
        uploadId: (uploadResult as any).video_id
    });

  } catch (error: any) {
    return res.status(500).json({ 
        success: false, 
        logs: logs, 
        error: error.message || "Unknown Server Error"
    });
  }
}
