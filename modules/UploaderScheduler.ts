import { UploaderInput, UploadResult, IModule } from '../types';

/**
 * Phase 6: Uploader & Scheduler
 * 
 * Goal: Upload the generated video to YouTube and handle scheduling logic.
 * Note: Since this is a client-side demo, we simulate the YouTube API interaction.
 * 
 * Input: VideoAsset + Metadata + ScheduleConfig
 * Output: UploadResult (YouTube URL)
 */
export class UploaderScheduler implements IModule<UploaderInput, UploadResult> {
  name = "Uploader & Scheduler";
  description = "Uploads video to YouTube (Simulated) and configures release schedule.";

  async execute(input: UploaderInput): Promise<UploadResult> {
    // 1. Validation
    if (!input.video_asset || input.video_asset.status !== 'generated') {
      throw new Error("Invalid video asset. Video must be generated successfully first.");
    }
    if (!input.metadata || !input.metadata.title_template) {
      throw new Error("Missing video metadata (title/description).");
    }

    // 2. Simulate Network Latency (YouTube API Upload)
    console.log(`[Uploader] Starting upload for ${input.metadata.title_template}...`);
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second mock delay

    // 3. Mock YouTube ID Generation
    const mockId = this.generateMockId();
    const platformUrl = `https://youtube.com/shorts/${mockId}`;

    // 4. Determine Status based on Schedule
    const isScheduled = !!input.schedule.publish_at;
    const finalStatus = isScheduled ? 'scheduled' : 'uploaded';

    console.log(`[Uploader] Upload Complete. Status: ${finalStatus}`);

    return {
      platform: 'youtube',
      video_id: mockId,
      platform_url: platformUrl,
      status: finalStatus,
      scheduled_for: input.schedule.publish_at,
      uploaded_at: new Date().toISOString()
    };
  }

  private generateMockId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let result = '';
    for (let i = 0; i < 11; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}