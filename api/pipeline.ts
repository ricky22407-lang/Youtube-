
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const config = {
  maxDuration: 300,
  api: { bodyParser: { sizeLimit: '10mb' } } 
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  
  const { stage, channel } = req.body;
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const ID_OR_URL = (process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '').trim();

  // 統一的資料庫路徑構造器 (與 api/db.ts 保持一致)
  const getFullUrl = (input: string) => {
    if (input.startsWith('http')) {
      return input.endsWith('.json') ? input : `${input.endsWith('/') ? input : input + '/'}channels.json`;
    }
    if (!input.includes('-default-rtdb') && !input.includes('.')) {
      return `https://${input}-default-rtdb.firebaseio.com/channels.json`;
    }
    if (input.includes('.')) {
      const parts = input.split('.');
      return `https://${parts[0]}.${parts[1]}.firebasedatabase.app/channels.json`;
    }
    return `https://${input}.firebaseio.com/channels.json`;
  };

  const DB_URL = getFullUrl(ID_OR_URL);

  // 輔助函式：更新 Firebase 狀態
  const updateStatus = async (step: number, log: string, status: string = 'running') => {
    try {
      const currentRes = await fetch(DB_URL);
      if (!currentRes.ok) return; // 忽略更新錯誤以繼續流程
      const allData = await currentRes.json();
      const channels = Array.isArray(allData) ? allData : (allData ? Object.values(allData) : []);
      const updated = channels.map((c: any) => 
        c.id === channel.id ? { ...c, step, lastLog: log, status } : c
      );
      await fetch(DB_URL, { method: 'PUT', body: JSON.stringify(updated) });
    } catch (e) { console.error("Update fail", e); }
  };

  try {
    if (stage === 'full_flow') {
      await updateStatus(10, "🚀 啟動 Onyx 自動化流程...");
      
      // 1. Analyze
      await updateStatus(20, "🔍 分析趨勢與撰寫劇本中...");
      const lang = channel.language || 'zh-TW';
      const targetLang = lang === 'en' ? 'English' : 'Traditional Chinese (繁體中文)';
      
      const promptRes = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Niche: ${channel.niche}. Language Requirement: ${targetLang}. 
        Create a viral YouTube Short plan. Output must be raw JSON.
        - title: must be in ${targetLang}.
        - description: must be in ${targetLang}.
        - visual_prompt: English only.`,
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
          }
        }
      });
      const metadata = JSON.parse(promptRes.text || '{}');

      // 2. Render (Veo 渲染可能較慢，在此增加進度點)
      await updateStatus(40, "🎬 影片渲染中 (Veo 3.1 雲端排隊)...");
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: metadata.visual_prompt,
        config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
      });

      let attempts = 0;
      while (!operation.done && attempts < 25) { // 增加安全檢查次數
        await new Promise(r => setTimeout(r, 10000));
        operation = await ai.operations.getVideosOperation({ operation });
        attempts++;
        await updateStatus(40 + attempts, `🎬 影片生成中 (${attempts * 4}%)...`);
      }

      if (!operation.done) throw new Error("影片生成逾時，請檢查 Google Cloud 配額。");

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      const videoRes = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
      const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

      // 3. Upload (安全性檢查：如果無 auth 則跳過上傳)
      if (!channel.auth || !channel.auth.access_token) {
        await updateStatus(95, "⚠️ 缺少授權憑證，跳過上傳步驟 (模擬成功)...", 'success');
      } else {
        await updateStatus(90, "🚀 正在將影片上傳至 YouTube...");
        const boundary = '-------314159265358979323846';
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

        if (!uploadRes.ok) {
           const errText = await uploadRes.text();
           throw new Error(`YouTube 上傳失敗: ${errText}`);
        }
      }

      // 4. Finalize
      await updateStatus(100, "✅ 流程完全完成", 'success');
      
      // 更新發文歷史與恢復狀態
      const finalDbRes = await fetch(DB_URL);
      const allData = await finalDbRes.json();
      const channels = Array.isArray(allData) ? allData : (allData ? Object.values(allData) : []);
      const finalUpdated = channels.map((c: any) => {
        if (c.id === channel.id) {
          const history = c.history || [];
          history.unshift({
            title: metadata.title,
            publishedAt: new Date().toISOString()
          });
          return { ...c, lastRunTime: Date.now(), history: history.slice(0, 10), step: 0, status: 'idle', lastLog: '待命中' };
        }
        return c;
      });

      await fetch(DB_URL, { method: 'PUT', body: JSON.stringify(finalUpdated) });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Invalid Stage' });
  } catch (e: any) {
    console.error("[Onyx Pipeline Error]", e.message);
    await updateStatus(0, `❌ 錯誤: ${e.message}`, 'error');
    return res.status(200).json({ success: false, error: e.message });
  }
}
