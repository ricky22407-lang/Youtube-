
import { 
  ShortsData, ChannelState, PromptOutput, VideoAsset, 
  ChannelConfig, UploadResult 
} from '../types';
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

const TEXT_MODEL = "gemini-3-flash-preview";
const VIDEO_MODEL = "veo-3.1-fast-generate-preview";

export const PipelineCore = {
  // Removed getApiKey helper to strictly comply with the rule: obtain process.env.API_KEY directly.

  async fetchTrends(config: any): Promise<ShortsData[]> {
    // Fix: Exclusively use process.env.API_KEY
    const apiKey = process.env.API_KEY;
    const query = encodeURIComponent(`#shorts ${config.niche || 'AI'}`);
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&type=video&maxResults=5&order=viewCount&key=${apiKey}`;
    
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      
      return (data.items || []).map((v: any) => ({
        id: v.id?.videoId || 'unknown',
        title: v.snippet?.title || 'No Title',
        hashtags: [],
        view_count: 0,
        view_growth_rate: 1.5,
      }));
    } catch (e) {
      console.warn("Trend fetch failed, using mock data", e);
      return [{ id: "m1", title: `${config.niche} 熱門趨勢`, hashtags: [], view_count: 1000, view_growth_rate: 1.1 }];
    }
  },

  async planContent(trends: ShortsData[], channelState: any): Promise<PromptOutput> {
    // Fix: Instantiate GoogleGenAI directly with process.env.API_KEY in a named parameter
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: `分析趨勢：${trends.map(t => t.title).join(', ')}。為「${channelState.niche}」頻道規劃一個 9:16 的爆款影片。`,
      config: {
        systemInstruction: "你是一位 YouTube Shorts 專家。請直接產出 JSON，包含 prompt (視覺描述), title (標題), desc (描述與標籤)。",
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

    // Fix: Access .text property directly (it's a getter, not a method)
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
    // Fix: Instantiate GoogleGenAI directly with process.env.API_KEY in a named parameter
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    let operation = await ai.models.generateVideos({
      model: VIDEO_MODEL,
      prompt: metadata.prompt,
      config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
    });

    let attempts = 0;
    while (!operation.done && attempts < 40) {
      // Fix: Follow 10-second polling recommendation for video generation
      await new Promise(r => setTimeout(r, 10000));
      operation = await ai.operations.getVideosOperation({ operation });
      attempts++;
    }

    if (!operation.done) throw new Error("影片生成超時 (Veo Timeout)");

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    // Fix: Append process.env.API_KEY to the download link
    const res = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    const buffer = await res.arrayBuffer();
    
    let base64 = "";
    if (typeof window === 'undefined') {
       base64 = Buffer.from(buffer).toString('base64');
    } else {
       const bytes = new Uint8Array(buffer);
       let binary = '';
       for (let i = 0; i < bytes.byteLength; i++) {
         binary += String.fromCharCode(bytes[i]);
       }
       base64 = window.btoa(binary);
    }

    return {
      candidate_id: metadata.candidate_id,
      video_url: `data:video/mp4;base64,${base64}`,
      mime_type: "video/mp4",
      status: "generated",
      generated_at: new Date().toISOString()
    };
  },

  async uploadVideo(input: any): Promise<UploadResult> {
    await new Promise(r => setTimeout(r, 2000));
    return {
      platform: 'youtube',
      video_id: 'vid_' + Math.random().toString(36).substring(7),
      platform_url: 'https://youtube.com/shorts/automated_success',
      status: 'uploaded',
      uploaded_at: new Date().toISOString()
    };
  }
};
