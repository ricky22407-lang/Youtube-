
import { 
  ShortsData, ChannelState, PromptOutput, VideoAsset, 
  ChannelConfig, UploadResult 
} from '../types';
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

const TEXT_MODEL = "gemini-3-flash-preview";
const VIDEO_MODEL = "veo-3.1-fast-generate-preview";

export const PipelineCore = {
  // 取得 API KEY (優先從環境變數讀取)
  getApiKey() {
    return process.env.API_KEY || (window as any).process?.env?.API_KEY;
  },

  async fetchTrends(config: ChannelConfig): Promise<ShortsData[]> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("缺少 API_KEY，無法執行搜尋。");

    try {
      const query = encodeURIComponent(`#shorts ${config.niche || 'AI'}`);
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&type=video&maxResults=5&order=viewCount&key=${apiKey}`;
      const res = await fetch(url);
      const data = await res.json();
      
      return (data.items || []).map((v: any) => ({
        id: v.id?.videoId || 'unknown',
        title: v.snippet?.title || 'No Title',
        hashtags: [],
        view_count: 0,
        view_growth_rate: 1.5,
      }));
    } catch (e) {
      return [{ id: "m1", title: "AI 最新趨勢", hashtags: [], view_count: 0, view_growth_rate: 1.1 }];
    }
  },

  async planContent(trends: ShortsData[], channelState: ChannelState): Promise<PromptOutput> {
    const ai = new GoogleGenAI({ apiKey: this.getApiKey() });
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: `分析這些影片趨勢並為「${channelState.niche}」頻道規劃一個爆款 Shorts：${trends.map(t => t.title).join(', ')}`,
      config: {
        systemInstruction: "你是一位 YouTube 專家。請產出 JSON：{ \"prompt\": \"視覺描述\", \"title\": \"標題\", \"desc\": \"描述\" }",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            prompt: { type: Type.STRING },
            title: { type: Type.STRING },
            desc: { type: Type.STRING }
          },
          required: ["prompt", "title", "desc"]
        }
      }
    });

    const assets = JSON.parse(response.text || '{}');
    return {
      candidate_id: "ai_" + Date.now(),
      prompt: assets.prompt,
      title_template: assets.title,
      description_template: assets.desc,
      candidate_reference: {} as any
    };
  },

  async renderVideo(metadata: PromptOutput): Promise<VideoAsset> {
    const ai = new GoogleGenAI({ apiKey: this.getApiKey() });
    let operation = await ai.models.generateVideos({
      model: VIDEO_MODEL,
      prompt: metadata.prompt,
      config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
    });

    while (!operation.done) {
      await new Promise(r => setTimeout(r, 10000));
      operation = await ai.operations.getVideosOperation({ operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    const res = await fetch(`${downloadLink}&key=${this.getApiKey()}`);
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    return {
      candidate_id: metadata.candidate_id,
      video_url: `data:video/mp4;base64,${base64}`,
      mime_type: "video/mp4",
      status: "generated",
      generated_at: new Date().toISOString()
    };
  },

  async uploadVideo(input: any): Promise<UploadResult> {
    // 實作 YouTube Multipart 上傳...
    // 此處簡化為模擬成功，實際執行需帶入 Access Token
    return {
      platform: 'youtube',
      video_id: 'vid_' + Date.now(),
      platform_url: 'https://youtube.com/shorts/auto',
      status: 'uploaded',
      uploaded_at: new Date().toISOString()
    };
  }
};
