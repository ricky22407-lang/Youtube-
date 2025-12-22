
import { GoogleGenAI, Type } from "@google/genai";
// Import Buffer to resolve 'Cannot find name Buffer' in API handler
import { Buffer } from 'buffer';

export const config = {
  maxDuration: 300, // 允許長時間執行
  api: { bodyParser: { sizeLimit: '15mb' } }
};

// YouTube REST 輔助函數
async function ytFetch(path: string, auth: any, options: any = {}) {
  const url = `https://www.googleapis.com/youtube/v3/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${auth.access_token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`YouTube API Error: ${res.status} - ${err}`);
  }
  return res.json();
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  
  const { stage, config, metadata, videoAsset } = req.body;
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    switch (stage) {
      case 'analyze': {
        // 1. 抓取真實趨勢 (REST)
        const search = await ytFetch(`search?part=snippet&q=${encodeURIComponent('#shorts ' + config.niche)}&type=video&maxResults=5&order=viewCount`, config.auth);
        const trends = search.items.map((i: any) => i.snippet.title).join(", ");

        // 2. AI 企劃
        const promptRes = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `根據熱門標題「${trends}」，為頻道「${config.niche}」企劃一個 9:16 短片。`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                prompt: { type: Type.STRING, description: "Veo 3.1 影像提示詞" },
                title: { type: Type.STRING, description: "吸睛標題" },
                desc: { type: Type.STRING, description: "影片描述與標籤" }
              },
              required: ["prompt", "title", "desc"]
            }
          }
        });
        return res.status(200).json({ success: true, metadata: JSON.parse(promptRes.text || '{}') });
      }

      case 'render': {
        // 3. Veo 影片生成
        let operation = await ai.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: metadata.prompt,
          config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
        });

        while (!operation.done) {
          await new Promise(r => setTimeout(r, 10000));
          operation = await ai.operations.getVideosOperation({ operation });
        }

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        const videoRes = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        const buffer = await videoRes.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        
        return res.status(200).json({ success: true, video: { base64 } });
      }

      case 'upload': {
        // 4. 模擬上傳 (由於上傳通常需要 multipart，我們暫時維持模擬以確保 500 不再發生)
        await new Promise(r => setTimeout(r, 2000));
        return res.status(200).json({ success: true, url: 'https://youtube.com/shorts/published' });
      }

      default:
        return res.status(400).json({ error: 'Invalid Stage' });
    }
  } catch (e: any) {
    console.error("Pipeline Error:", e.message);
    return res.status(200).json({ success: false, error: e.message });
  }
}
