
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const config = {
  maxDuration: 300, // 增加到 5 分鐘上限
};

// 輔助：清理 JSON 字串
function cleanJson(text: string): string {
  if (!text) return '{}';
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
}

// 輕量化 YouTube 搜尋工具
async function getTrends(niche: string, region: string, apiKey: string) {
  const fetchTrack = async (q: string) => {
    try {
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&videoDuration=short&maxResults=5&order=viewCount&key=${apiKey}&regionCode=${region || 'TW'}`;
      const res = await fetch(searchUrl);
      const data = await res.json();
      
      if (data.error) return [];
      
      const videoIds = (data.items || []).map((i: any) => i.id.videoId).join(',');
      if (!videoIds) return [];

      const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}&key=${apiKey}`;
      const statsRes = await fetch(statsUrl);
      const statsData = await statsRes.json();

      return (statsData.items || []).map((v: any) => ({
        title: v.snippet.title,
        view_count: parseInt(v.statistics.viewCount || '0', 10),
        tags: v.snippet.tags || []
      }));
    } catch (e) {
      return [];
    }
  };

  const [nicheTrends, globalTrends] = await Promise.all([
    fetchTrack(`#shorts ${niche}`),
    fetchTrack(`#shorts trending`)
  ]);

  return { nicheTrends, globalTrends };
}

async function generateWithFallback(ai: any, params: any) {
  const models = ['gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-flash-lite-latest'];
  let lastError = null;

  for (const modelName of models) {
    try {
      const response = await ai.models.generateContent({
        ...params,
        model: modelName
      });
      return { text: response.text, modelUsed: modelName };
    } catch (e: any) {
      lastError = e;
      continue;
    }
  }
  throw lastError || new Error("AI Analysis Offline");
}

export default async function handler(req: any, res: any) {
  // 強制最外層 JSON 包裝，防止 HTML 錯誤回傳
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }
    
    const API_KEY = process.env.API_KEY;
    if (!API_KEY) {
      return res.status(200).json({ success: false, error: 'System API_KEY Missing' });
    }

    const { stage, channel, metadata } = req.body;
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    switch (stage) {
      case 'analyze': {
        // 自動執行雙軌搜尋
        const trends = await getTrends(channel.niche, channel.regionCode, API_KEY);

        const analysisParams = {
          contents: `
          【角色】：頂尖 YouTube 演算法分析師
          【目標】：將「全域病毒節奏」嫁接到「垂直利基內容」中。
          
          【數據輸入】：
          1. 垂直利基 (同業): ${JSON.stringify(trends.nicheTrends)}
          2. 全域病毒 (演算法最愛): ${JSON.stringify(trends.globalTrends)}
          
          【頻道設定】：
          利基: ${channel.niche}
          語系: ${channel.language === 'en' ? 'English' : '繁體中文'}
          
          【任務】：
          分析數據後，產出一個具備「病毒式鉤子」的視覺提示詞、標題與描述。
          請回傳純 JSON。`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                prompt: { type: Type.STRING },
                title: { type: Type.STRING },
                desc: { type: Type.STRING },
                strategy_note: { type: Type.STRING }
              },
              required: ["prompt", "title", "desc", "strategy_note"]
            }
          }
        };

        const result = await generateWithFallback(ai, analysisParams);
        const cleanedText = cleanJson(result.text || '{}');
        const parsed = JSON.parse(cleanedText);
        
        return res.status(200).json({ 
          success: true, 
          metadata: parsed,
          modelUsed: result.modelUsed 
        });
      }

      case 'render_and_upload': {
        if (!channel.auth?.access_token) throw new Error("YouTube 授權無效，請重新連結。");

        // 渲染影片
        let operation = await ai.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: metadata.prompt,
          config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
        });

        let attempts = 0;
        while (!operation.done && attempts < 40) {
          await new Promise(r => setTimeout(r, 15000));
          operation = await ai.operations.getVideosOperation({ operation });
          attempts++;
        }

        if (!operation.done) throw new Error("影片渲染逾時 (Veo Task Timeout)");

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        const videoRes = await fetch(`${downloadLink}&key=${API_KEY}`);
        const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
        
        // YouTube Multipart Upload
        const boundary = '-------PIPELINE_ONYX_V8_UPLOAD_BOUNDARY';
        const jsonMetadata = JSON.stringify({
          snippet: { 
            title: metadata.title, 
            description: metadata.desc + "\n\n#Shorts #AI",
            categoryId: "22" 
          },
          status: { privacyStatus: "public", selfDeclaredMadeForKids: false }
        });
        
        const multipartBody = Buffer.concat([
          Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${jsonMetadata}\r\n`),
          Buffer.from(`--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`),
          videoBuffer,
          Buffer.from(`\r\n--${boundary}--`)
        ]);

        const uploadRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${channel.auth.access_token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartBody
        });

        const uploadData = await uploadRes.json();
        if (uploadData.error) throw new Error(uploadData.error.message);
        
        return res.status(200).json({ success: true, videoId: uploadData.id });
      }

      default:
        return res.status(400).json({ success: false, error: 'Invalid Stage' });
    }
  } catch (e: any) {
    console.error("[Fatal API Error]:", e.message);
    // 即使發生最嚴重的崩潰，也回傳 JSON
    return res.status(200).json({ 
      success: false, 
      error: `伺服器處理失敗: ${e.message}`,
      stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
    });
  }
}
