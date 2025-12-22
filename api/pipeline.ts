
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const config = {
  maxDuration: 300,
  api: { bodyParser: { sizeLimit: '15mb' } }
};

// YouTube REST Wrapper
async function ytCall(path: string, auth: any, options: any = {}) {
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
    const txt = await res.text();
    throw new Error(`YT_API_ERROR: ${res.status} - ${txt}`);
  }
  return res.json();
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  
  const { stage, channel, metadata, videoAsset } = req.body;
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    switch (stage) {
      case 'analyze': {
        // 搜尋真實趨勢 (REST)
        const q = encodeURIComponent(`#shorts ${channel.niche}`);
        const search = await ytCall(`search?part=snippet&q=${q}&type=video&maxResults=5&order=viewCount`, channel.auth);
        const trends = search.items.map((i: any) => i.snippet.title).join("; ");

        // AI 企劃
        const promptRes = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `基於當前趨勢「${trends}」，為「${channel.niche}」頻道規劃一則爆款 9:16 短片。`,
          config: {
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
        return res.status(200).json({ success: true, metadata: JSON.parse(promptRes.text || '{}') });
      }

      case 'render': {
        // Veo 3.1 渲染
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
        return res.status(200).json({ success: true, base64: Buffer.from(buffer).toString('base64') });
      }

      case 'upload': {
        // 模擬上傳邏輯
        await new Promise(r => setTimeout(r, 2000));
        return res.status(200).json({ success: true, url: 'https://youtube.com/shorts/sync_success' });
      }

      default:
        return res.status(400).json({ error: 'Invalid Stage' });
    }
  } catch (e: any) {
    return res.status(200).json({ success: false, error: e.message });
  }
}
