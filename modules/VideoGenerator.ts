import { PromptOutput, VideoAsset, IModule } from '../types';
import { generateVideo } from '../services/geminiService';

/**
 * Phase 5: Video Generator
 * 
 * Goal: Generate a real video using the Veo model based on the optimized prompt.
 * Input: PromptOutput
 * Output: VideoAsset (Blob URL)
 */
export class VideoGenerator implements IModule<PromptOutput, VideoAsset> {
  name = "Video Generator";
  description = "Generates actual MP4 video using Veo (AI Video Model).";

  async execute(input: PromptOutput): Promise<VideoAsset> {
    if (!input.prompt) {
      throw new Error("Input prompt cannot be empty.");
    }
    if (!input.candidate_id) {
      throw new Error("Input candidate_id is missing.");
    }

    try {
      // Call the service to hit Veo API
      const videoUrl = await generateVideo(input.prompt);

      return {
        candidate_id: input.candidate_id,
        video_url: videoUrl,
        mime_type: "video/mp4",
        status: "generated",
        generated_at: new Date().toISOString()
      };

    } catch (error) {
      console.error("VideoGenerator Execution Failed:", error);
      // For demo purposes, we might want to propagate the error, 
      // but in a real pipeline, we might return a 'failed' status object.
      // Here we throw to let the UI handle the error state.
      throw error;
    }
  }
}