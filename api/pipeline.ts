
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
      return res.status(200).json({ success: false, error: '遺失 API_KEY', at: 'auth_check' });
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  try {
    switch (stage) {
      case 'analyze': {
        const lang = channel.language || 'zh-TW';
        const targetLang = lang === 'en' ? 'English' : 'Traditional Chinese (繁體中文)';
        
        try {
          const promptRes = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Niche: ${channel.niche}. Output Language: ${targetLang}. 
            Task: Create a viral YouTube Shorts script. 
            Return JSON with "prompt" (English visual desc), "title", and "desc".`,
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
        } catch (err: any) {
          const is429 = err.message.includes("429");
          return res.status(200).json({ success: false, error: err.message, at: 'gemini_analyze', isQuotaError: is429 });
        }
      }

      case 'render_and_upload': {
        if (!metadata || !metadata.prompt) throw new Error("缺少 Prompt 資料");

        // 1. 發起生成任務 (這是最容易噴 429 的地方)
        let operation;
        try {
          operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: metadata.prompt,
            config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
          });
        } catch (e: any) {
          const is429 = e.message.includes("429");
          return res.status(200).json({ 
            success: false, 
            error: e.message, 
            at: 'veo_generate_call', 
            isQuotaError: is429 
          });
        }

        console.log("Veo Operation Started. Waiting 120s...");
        await new Promise(r => setTimeout(r, 120000)); 

        let attempts = 0;
        const POLL_INTERVAL = 30000; 
        const MAX_POLL_TIME = 170000; 
        const MAX_ATTEMPTS = Math.floor(MAX_POLL_TIME / POLL_INTERVAL); 

        while (!operation.done && attempts < MAX_ATTEMPTS) {
          try {
            operation = await ai.operations.getVideosOperation({ operation });
            if (!operation.done) {
              await new Promise(r => setTimeout(r, POLL_INTERVAL));
            }
          } catch (pollErr: any) {
            const is429 = pollErr.message.includes("429");
            return res.status(200).json({ success: false, error: pollErr.message, at: 'veo_polling', isQuotaError: is429 });
          }
          attempts++;
        }

        if (!operation.done) throw new Error("渲染逾時 (Serverless 5min)");

        // 2. 下載
        let videoBuffer;
        try {
          const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
          const videoRes = await fetch(`${downloadLink}&key=${API_KEY}`);
          videoBuffer = Buffer.from(await videoRes.arrayBuffer());
        } catch (dlErr: any) {
          return res.status(200).json({ success: false, error: dlErr.message, at: 'video_download' });
        }
        
        // 3. 上傳
        try {
          const boundary = '-------PIPELINE_ONYX_BOUNDARY';
          const metadataPart = JSON.stringify({
            snippet: { title: metadata.title || "AI Short", description: (metadata.desc || "") + "\n\n#AI #Shorts", categoryId: "22" },
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
          return res.status(200).json({ success: true, videoId: uploadData.id });
        } catch (upErr: any) {
          return res.status(200).json({ success: false, error: upErr.message, at: 'youtube_upload' });
        }
      }

      default:
        return res.status(400).json({ error: 'Invalid Stage' });
    }
  } catch (e: any) {
    return res.status(200).json({ success: false, error: e.message, at: 'global_catch' });
  }
}
