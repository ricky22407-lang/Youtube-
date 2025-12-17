import { PromptOutput, VideoAsset, IModule } from '../types';
import { generateVideo } from '../services/geminiService';

/**
 * Phase 5: Video Generator
 * 
 * Goal: Generate a real video using the Veo model based on the optimized prompt.
 * STRICT: Must use 9:16 aspect ratio for Shorts.
 * ERROR HANDLING: No fallbacks. Fail loudly if Veo fails.
 */
export class VideoGenerator implements IModule<PromptOutput, VideoAsset> {
  name = "Video Generator";
  description = "Generates actual MP4 video using Veo (AI Video Model) in 9:16 format.";

  async execute(input: PromptOutput): Promise<VideoAsset> {
    if (!input.prompt) {
      throw new Error("Input prompt cannot be empty.");
    }
    if (!input.candidate_id) {
      throw new Error("Input candidate_id is missing.");
    }

    // No try-catch wrapper here that suppresses error. 
    // We want the error to propagate to the pipeline for logging.
    console.log(`[VideoGenerator] Requesting Veo 9:16 video for candidate: ${input.candidate_id}`);
    
    // Calls the service which handles the API interaction.
    // If this throws, the pipeline catches it.
    const videoUrl = await generateVideo(input.prompt);

    return {
      candidate_id: input.candidate_id,
      video_url: videoUrl,
      mime_type: "video/mp4",
      status: "generated",
      generated_at: new Date().toISOString()
    };
  }
}