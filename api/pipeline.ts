
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const config = {
  maxDuration: 300,
  api: { bodyParser: { sizeLimit: '15mb' } } 
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  
  const { stage, channel, metadata } = req.body;
  const API_KEY = process.env.API_KEY;

  if (!API_KEY) return res.status(200).json({ success: false, error: 'System API_KEY Missing' });

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  try {
    switch (stage) {
      case 'analyze': {
        const lang = channel.language || 'zh-TW';
        const niches = channel.niche || 'General';
        
        const promptRes = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `核心利基(可能是多個): ${niches}. 
          指定輸出語言: ${lang === 'zh-TW' ? '繁體中文 (Traditional Chinese)' : 'English (United States)'}.
          任務: 針對上述利基（若有多個可選擇其中一個或創意組合），創作一個具有高度病毒式傳播潛力的 YouTube Shorts 企劃。
          
          【內容過濾與寫作規則】：
          1. 標題與描述中【嚴格禁止】使用 #AI, #ArtificialIntelligence, #Bot, #ShortsPilot 或任何與技術性、自動化相關的標籤。
          2. 請使用與該利基領域（Niche）相關的「人性化」標籤。
          3. 內容風格：要像真人撰寫，富有好奇心、幽默感或實用性。
          4. 避免過於機械化或重複的語法結構。
          
          請回傳 JSON 格式，包含: prompt (給影片生成的視覺描述), title (病毒式標題), desc (人性化影片描述 + 相關標籤)。`,
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

      case 'render_and_upload': {
        if (!channel.auth?.access_token) throw new Error("YouTube 授權遺失。");

        // 1. Veo 影片生成 (9:16)
        let operation = await ai.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: metadata.prompt,
          config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
        });

        let attempts = 0;
        // Veo 生成通常需要 2-4 分鐘
        while (!operation.done && attempts < 25) {
          await new Promise(r => setTimeout(r, 20000));
          operation = await ai.operations.getVideosOperation({ operation });
          attempts++;
        }

        if (!operation.done) throw new Error("影片生成時間過長，伺服器超時。");

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        const videoRes = await fetch(`${downloadLink}&key=${API_KEY}`);
        const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
        
        // 2. YouTube Multipart 上傳 (不含技術標籤)
        const boundary = '-------PIPELINE_ONYX_V8_UPLOAD_BOUNDARY';
        const jsonMetadata = JSON.stringify({
          snippet: { 
            title: metadata.title, 
            description: `${metadata.desc}\n\n#Viral #Content`, 
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
            'Content-Length': multipartBody.length.toString()
          },
          body: multipartBody
        });

        const uploadData = await uploadRes.json();
        if (uploadData.error) throw new Error(`YouTube API 錯誤: ${uploadData.error.message}`);
        
        return res.status(200).json({ success: true, videoId: uploadData.id });
      }

      default:
        return res.status(400).json({ error: 'Invalid Stage' });
    }
  } catch (e: any) {
    return res.status(200).json({ success: false, error: e.message });
  }
}
