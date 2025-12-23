
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const config = {
  maxDuration: 300,
  api: { bodyParser: { sizeLimit: '10mb' } } 
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  
  const { stage, channel } = req.body;
  if (!channel || !channel.id) return res.status(400).json({ error: 'Missing channel ID' });

  const API_KEY = process.env.API_KEY;
  if (!API_KEY) return res.status(200).json({ success: false, error: '環境變數 API_KEY 遺失，請檢查 Vercel 設定。' });

  const ID_OR_URL = (process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '').trim();

  const getFullUrl = (input: string) => {
    if (!input) return null;
    if (input.startsWith('http')) {
      return input.endsWith('.json') ? input : `${input.endsWith('/') ? input : input + '/'}channels.json`;
    }
    if (input.includes('.')) {
      const parts = input.split('.');
      return `https://${parts[0]}.${parts[1]}.firebasedatabase.app/channels.json`;
    }
    return `https://${input}-default-rtdb.firebaseio.com/channels.json`;
  };

  const DB_URL = getFullUrl(ID_OR_URL);
  
  const updateStatus = async (step: number, log: string, status: string = 'running') => {
    console.log(`[PIPELINE STATUS] ${log} (${step}%)`);
    try {
      if (!DB_URL) return;
      const dbRes = await fetch(DB_URL);
      if (!dbRes.ok) return;
      const raw = await dbRes.json();
      let channels = Array.isArray(raw) ? raw : (raw ? Object.values(raw) : []);
      const updated = channels.map((c: any) => 
        c.id === channel.id ? { ...c, step, lastLog: log, status } : c
      );
      await fetch(DB_URL, { 
        method: 'PUT', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated) 
      });
    } catch (e) {
      console.error("[PIPELINE DB UPDATE ERROR]", e);
    }
  };

  try {
    if (stage === 'full_flow') {
      await updateStatus(10, "📡 正在確認服務連線...");
      
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const targetLang = channel.language === 'en' ? 'English' : 'Traditional Chinese (繁體中文)';
      
      await updateStatus(25, "🔍 正在聯繫 Gemini 構思劇本...");

      let metadata;
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `你是一位短影音行銷大師。請針對 Niche: ${channel.niche} 使用語言: ${targetLang} 產出一個具備病毒式傳播潛力的 YouTube Short 企劃。`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                visual_prompt: { type: Type.STRING },
                title: { type: Type.STRING },
                description: { type: Type.STRING }
              },
              required: ["visual_prompt", "title", "description"]
            },
            // 使用較低的溫度確保穩定性
            temperature: 0.2
          }
        });
        
        const text = response.text || '';
        metadata = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
      } catch (geminiErr: any) {
        console.error("[Gemini Error Detail]", geminiErr);
        // 特殊處理 429 錯誤
        if (geminiErr.status === 429 || geminiErr.message?.includes('429') || geminiErr.message?.includes('quota')) {
          throw new Error("API 額度已耗盡 (429 Resource Exhausted)。請檢查 API Key 帳單或等待一分鐘後重試。");
        }
        throw new Error(`Gemini 構思失敗: ${geminiErr.message}`);
      }

      await updateStatus(45, "🎬 正在啟動 Veo 渲染影片 (預計 2-3 分鐘)...");
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: metadata.visual_prompt,
        config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
      });

      let attempts = 0;
      while (!operation.done && attempts < 60) {
        await new Promise(r => setTimeout(r, 10000));
        operation = await ai.operations.getVideosOperation({ operation });
        attempts++;
        await updateStatus(Math.min(95, 45 + attempts), `🎬 影片生成中 (${attempts * 10}秒)...`);
      }

      if (!operation.done) throw new Error("影片渲染超時。");

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      const videoFetch = await fetch(`${downloadLink}&key=${API_KEY}`);
      if (!videoFetch.ok) throw new Error("影片下載失敗。");
      const videoBuffer = Buffer.from(await videoFetch.arrayBuffer());

      if (channel.auth?.access_token) {
        await updateStatus(95, "🚀 正在發布至 YouTube...");
        const boundary = '-------PIPELINE_BOUNDARY';
        const metadataPart = JSON.stringify({
          snippet: { title: metadata.title, description: metadata.description },
          status: { privacyStatus: "public" }
        });
        const multipartBody = Buffer.concat([
          Buffer.from(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadataPart}\r\n`),
          Buffer.from(`--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`),
          videoBuffer,
          Buffer.from(`\r\n--${boundary}--`)
        ]);

        await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${channel.auth.access_token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
          },
          body: multipartBody
        });
      }

      await updateStatus(100, "✅ 任務完成", 'success');
      
      // 最後清理並更新歷史紀錄
      const finalRes = await fetch(DB_URL!);
      const rawData = await finalRes.json();
      const channels = Array.isArray(rawData) ? rawData : Object.values(rawData);
      const finalUpdated = channels.map((c: any) => {
        if (c.id === channel.id) {
          const hist = c.history || [];
          hist.unshift({ title: metadata.title, publishedAt: new Date().toISOString() });
          return { ...c, history: hist.slice(0, 10), status: 'idle', step: 0, lastLog: '待命' };
        }
        return c;
      });
      await fetch(DB_URL!, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(finalUpdated) });

      return res.status(200).json({ success: true });
    }
  } catch (e: any) {
    console.error("[PIPELINE FATAL]", e);
    await updateStatus(0, `❌ 錯誤: ${e.message}`, 'error');
    return res.status(200).json({ success: false, error: e.message });
  }
}
