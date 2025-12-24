
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const config = {
  maxDuration: 300,
  api: { bodyParser: { sizeLimit: '15mb' } } 
};

// 輔助函式：嘗試使用高級模型，失敗則降級
async function generateWithFallback(ai: any, params: any) {
  const models = ['gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-flash-latest'];
  let lastError = null;

  for (const modelName of models) {
    try {
      console.log(`[Pipeline] Attempting analysis with: ${modelName}`);
      const response = await ai.models.generateContent({
        ...params,
        model: modelName
      });
      return { text: response.text, modelUsed: modelName };
    } catch (e: any) {
      console.warn(`[Pipeline] Model ${modelName} failed, trying next...`);
      lastError = e;
      continue;
    }
  }
  throw lastError || new Error("All models failed to respond.");
}

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
        const rawNiches = channel.niche || 'General Content';
        
        const analysisParams = {
          contents: `核心利基: ${rawNiches}. 
          語系: ${lang === 'zh-TW' ? '繁體中文' : 'English'}.
          
          任務：根據 YouTube 最新演算法趨勢進行「高存留率」企劃。
          
          【1. 敘事鉤子結構 (三段式設計)】：
          - Hook (0-2s): 必須是極具衝擊力的開頭（例如：突發動作、懸念特寫）。
          - Body: 核心內容展示。
          - Loop: 結尾與開頭需能視覺無縫銜接。
          
          【2. 正向攝影指令 (提升 Veo 良率)】：
          - 避開 AI 感的方法：不要給負向指令。請使用攝影專業術語（如：8k cinematic, handheld motion, depth of field, anamorphic lens flares）。
          
          【3. SEO 與點擊誘餌】：
          - 標題：針對「演算法推薦」而非「搜尋」設計，強調好奇心與情緒。
          
          請回傳 JSON：{ "prompt": "三段式視覺指令", "title": "病毒標題", "desc": "SEO 描述", "strategy_note": "模型採用的策略簡述" }`,
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
        return res.status(200).json({ 
          success: true, 
          metadata: JSON.parse(result.text || '{}'),
          modelUsed: result.modelUsed 
        });
      }

      case 'render_and_upload': {
        if (!channel.auth?.access_token) throw new Error("YouTube 授權遺失。");

        let operation = await ai.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: metadata.prompt,
          config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
        });

        let attempts = 0;
        while (!operation.done && attempts < 25) {
          await new Promise(r => setTimeout(r, 20000));
          operation = await ai.operations.getVideosOperation({ operation });
          attempts++;
        }

        if (!operation.done) throw new Error("影片渲染逾時。");

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        const videoRes = await fetch(`${downloadLink}&key=${API_KEY}`);
        const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
        
        const boundary = '-------PIPELINE_ONYX_V8_UPLOAD_BOUNDARY';
        const jsonMetadata = JSON.stringify({
          snippet: { 
            title: metadata.title, 
            description: metadata.desc, 
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
        if (uploadData.error) throw new Error(`YouTube API: ${uploadData.error.message}`);
        
        return res.status(200).json({ success: true, videoId: uploadData.id });
      }

      default:
        return res.status(400).json({ error: 'Invalid Stage' });
    }
  } catch (e: any) {
    return res.status(200).json({ success: false, error: e.message });
  }
}
