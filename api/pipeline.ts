
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const config = {
  maxDuration: 300,
  api: { bodyParser: { sizeLimit: '10mb' } } 
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  
  const { stage, channel, metadata } = req.body;
  const API_KEY = process.env.API_KEY;

  if (!API_KEY) {
      return res.status(200).json({ success: false, error: '遺失 API_KEY，請在 Vercel 設定。' });
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  try {
    switch (stage) {
      case 'analyze': {
        const lang = channel.language || 'zh-TW';
        const targetLang = lang === 'en' ? 'English' : 'Traditional Chinese (繁體中文)';
        
        const q = encodeURIComponent(`#shorts ${channel.niche}`);
        // 使用 Google 搜尋或 YouTube 搜尋（若 API Key 權限允許）
        const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${q}&type=video&maxResults=3&order=viewCount&key=${API_KEY}`);
        const searchData = await searchRes.json();
        const trends = (searchData.items || []).map((i: any) => i.snippet.title).join("; ");

        try {
          const promptRes = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Trends: ${trends || 'None'}. Niche: ${channel.niche}. Output Language: ${targetLang}. 
            Task: Create a viral YouTube Shorts script. 
            The "title" and "desc" fields MUST be in ${targetLang}.
            The "prompt" field should be in English for the video generator.`,
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
        } catch (aiErr: any) {
          if (aiErr.status === 429) throw new Error("Gemini API 額度已耗盡 (429)，請稍候重試。");
          throw aiErr;
        }
      }

      case 'render_and_upload': {
        let operation = await ai.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: metadata.prompt,
          config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
        });

        let attempts = 0;
        while (!operation.done && attempts < 60) {
          await new Promise(r => setTimeout(r, 10000));
          operation = await ai.operations.getVideosOperation({ operation });
          attempts++;
        }

        if (!operation.done) throw new Error("影片生成超時 (Veo 渲染過久)。");

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        const videoRes = await fetch(`${downloadLink}&key=${API_KEY}`);
        const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
        
        // 上傳 YouTube
        const boundary = '-------PIPELINE_ONYX_BOUNDARY';
        const metadataPart = JSON.stringify({
          snippet: {
            title: metadata.title || "AI Short",
            description: metadata.desc || "",
            categoryId: "22"
          },
          status: { privacyStatus: "public", selfDeclaredMadeForKids: false }
        });

        const multipartBody = Buffer.concat([
          Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataPart}\r\n`),
          Buffer.from(`--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`),
          videoBuffer,
          Buffer.from(`\r\n--${boundary}--`)
        ]);

        const uploadRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${channel.auth.access_token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
          },
          body: multipartBody
        });

        const uploadData = await uploadRes.json();
        if (!uploadData.id) throw new Error(`上傳失敗: ${JSON.stringify(uploadData)}`);
        
        return res.status(200).json({ success: true, videoId: uploadData.id, url: `https://youtube.com/shorts/${uploadData.id}` });
      }

      default:
        return res.status(400).json({ error: 'Invalid Stage' });
    }
  } catch (e: any) {
    console.error("[PIPELINE ERROR]", e.message);
    return res.status(200).json({ success: false, error: e.message });
  }
}
