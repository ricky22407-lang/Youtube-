
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

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const ID_OR_URL = (process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '').trim();

  // 強化後的網址構造器，涵蓋所有 Firebase 可能性
  const getFullUrl = (input: string) => {
    if (!input) return null;
    if (input.startsWith('http')) {
      return input.endsWith('.json') ? input : `${input.endsWith('/') ? input : input + '/'}channels.json`;
    }
    // 處理帶有點號的專案 ID (例如 project.asia-southeast1)
    if (input.includes('.')) {
      const parts = input.split('.');
      return `https://${parts[0]}.${parts[1]}.firebasedatabase.app/channels.json`;
    }
    // 預設為新版 Firebase RTDB 格式
    return `https://${input}-default-rtdb.firebaseio.com/channels.json`;
  };

  const DB_URL = getFullUrl(ID_OR_URL);
  if (!DB_URL) return res.status(200).json({ success: false, error: '未設定 Firebase 專案 ID 或網址。' });

  // 狀態更新函式 (帶有錯誤拋出)
  const updateStatus = async (step: number, log: string, status: string = 'running') => {
    console.log(`[PIPELINE LOG] ${channel.name}: ${log}`);
    const currentRes = await fetch(DB_URL);
    if (!currentRes.ok) throw new Error(`無法讀取資料庫 (${currentRes.status})。請檢查 Firebase Rules。`);
    
    const allData = await currentRes.json();
    let channels = Array.isArray(allData) ? allData : (allData ? Object.values(allData) : []);
    
    const updated = channels.map((c: any) => 
      c.id === channel.id ? { ...c, step, lastLog: log, status } : c
    );
    
    const saveRes = await fetch(DB_URL, { 
      method: 'PUT', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated) 
    });
    if (!saveRes.ok) throw new Error(`無法寫入資料庫 (${saveRes.status})。`);
  };

  try {
    if (stage === 'full_flow') {
      // 步驟 0：測試連線
      await updateStatus(5, "📡 正在確認雲端資料庫連線...");
      
      // 步驟 1：Gemini 劇本生成
      await updateStatus(15, "🔍 正在分析趨勢並撰寫劇本...");
      const targetLang = channel.language === 'en' ? 'English' : 'Traditional Chinese (繁體中文)';
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `你是一位短影音行銷大師。請針對 Niche: ${channel.niche} 使用語言: ${targetLang} 產出一個具備病毒式傳播潛力的 YouTube Short 企劃。`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              visual_prompt: { type: Type.STRING, description: "給影片生成模型的詳細視覺描述" },
              title: { type: Type.STRING },
              description: { type: Type.STRING }
            },
            required: ["visual_prompt", "title", "description"]
          }
        }
      });

      const rawText = response.text || '';
      let metadata;
      try {
        // 移除 Markdown 代碼塊
        const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        metadata = JSON.parse(cleanJson);
      } catch (e) {
        throw new Error("Gemini 回傳格式錯誤，無法解析 JSON 劇本。");
      }

      // 步驟 2：Veo 影片生成
      await updateStatus(40, "🎬 正在啟動 Veo 3.1 渲染垂直影片...");
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: metadata.visual_prompt,
        config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
      });

      let attempts = 0;
      while (!operation.done && attempts < 40) {
        await new Promise(r => setTimeout(r, 10000));
        operation = await ai.operations.getVideosOperation({ operation });
        attempts++;
        await updateStatus(Math.min(95, 40 + attempts), `🎬 影片生成中 (${attempts * 10}秒)...`);
      }

      if (!operation.done) throw new Error("影片渲染逾時 (超過 400 秒)。");

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      const videoRes = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
      if (!videoRes.ok) throw new Error("影片下載失敗。");
      const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

      // 步驟 3：YouTube 上傳
      if (channel.auth?.access_token) {
        await updateStatus(96, "🚀 正在將影片推送到 YouTube...");
        const boundary = '-------ONYX_PIPELINE_BOUNDARY';
        const metadataPart = JSON.stringify({
          snippet: { title: metadata.title, description: metadata.description + "\n#shorts #ai #onyx" },
          status: { privacyStatus: "public" }
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
        if (!uploadRes.ok) throw new Error("YouTube API 上傳失敗。");
      }

      // 步驟 4：存檔
      await updateStatus(100, "✅ 任務大功告成", 'success');
      
      const finalFetch = await fetch(DB_URL);
      const historyData = await finalFetch.json();
      const finalUpdated = (Array.isArray(historyData) ? historyData : Object.values(historyData)).map((c: any) => {
        if (c.id === channel.id) {
          const hist = c.history || [];
          hist.unshift({ title: metadata.title, publishedAt: new Date().toISOString() });
          return { ...c, history: hist.slice(0, 10), status: 'idle', step: 0, lastLog: '待命' };
        }
        return c;
      });
      await fetch(DB_URL, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(finalUpdated) });

      return res.status(200).json({ success: true });
    }
  } catch (e: any) {
    console.error("[PIPELINE CRITICAL]", e.message);
    // 嘗試通知前端錯誤
    try { await updateStatus(0, `❌ 錯誤: ${e.message}`, 'error'); } catch (dbErr) {}
    return res.status(200).json({ success: false, error: e.message });
  }
}
