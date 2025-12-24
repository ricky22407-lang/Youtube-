
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const config = {
  maxDuration: 300,
};

function cleanJson(text: string): string {
  if (!text) return '{}';
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
}

async function refreshAccessToken(refreshToken: string) {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = await response.json();
  if (data.error) throw new Error(`Token Refresh Failed: ${data.error_description || data.error}`);
  return data;
}

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
    } catch (e) { return []; }
  };
  const [nicheTrends, globalTrends] = await Promise.all([
    fetchTrack(`#shorts ${niche}`),
    fetchTrack(`#shorts trending`)
  ]);
  return { nicheTrends, globalTrends };
}

export default async function handler(req: any, res: any) {
  try {
    const API_KEY = process.env.API_KEY;
    const { stage, channel, metadata } = req.body;
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    switch (stage) {
      case 'analyze': {
        const trends = await getTrends(channel.niche, channel.regionCode, API_KEY);
        const response = await ai.models.generateContent({
          model: 'gemini-3-pro-preview',
          contents: `分析趨勢: ${JSON.stringify(trends)}。目標利基: ${channel.niche}`,
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
        });
        return res.status(200).json({ success: true, metadata: JSON.parse(cleanJson(response.text)) });
      }

      case 'render_and_upload': {
        let currentAccessToken = channel.auth?.access_token;
        let newTokens = null;

        // 啟動影片渲染
        let operation = await ai.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: metadata.prompt,
          config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
        });

        let attempts = 0;
        while (!operation.done && attempts < 40) {
          await new Promise(r => setTimeout(r, 10000));
          operation = await ai.operations.getVideosOperation({ operation });
          if ((operation as any).error) throw new Error(`Veo Rendering Failed: ${(operation as any).error.message}`);
          attempts++;
        }

        if (!operation.done) throw new Error("Video generation timed out.");

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) throw new Error("Veo task completed but no video URI found.");

        const videoRes = await fetch(`${downloadLink}&key=${API_KEY}`);
        if (!videoRes.ok) throw new Error(`Failed to download video file: ${videoRes.statusText}`);
        const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

        // Token 預檢與自動刷新
        const checkRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=id&mine=true', {
          headers: { 'Authorization': `Bearer ${currentAccessToken}` }
        });

        if (checkRes.status === 401 && channel.auth?.refresh_token) {
          const refreshed = await refreshAccessToken(channel.auth.refresh_token);
          currentAccessToken = refreshed.access_token;
          newTokens = { ...channel.auth, ...refreshed };
        } else if (checkRes.status === 401) {
          throw new Error("Authentication expired. Please re-link YouTube channel.");
        }

        const boundary = '-------PIPELINE_ONYX_V8_UPLOAD_BOUNDARY';
        const multipartBody = Buffer.concat([
          Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({
            snippet: { title: metadata.title, description: metadata.desc + "\n\n#Shorts #AI", categoryId: "22" },
            status: { privacyStatus: "public", selfDeclaredMadeForKids: false }
          })}\r\n`),
          Buffer.from(`--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`),
          videoBuffer,
          Buffer.from(`\r\n--${boundary}--`)
        ]);

        const uploadRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${currentAccessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartBody
        });

        const uploadData = await uploadRes.json();
        if (uploadData.error) throw new Error(`YouTube Upload Error: ${uploadData.error.message}`);

        return res.status(200).json({ 
          success: true, 
          videoId: uploadData.id,
          updatedAuth: newTokens
        });
      }
      default: return res.status(400).json({ error: 'Invalid Stage' });
    }
  } catch (e: any) {
    console.error("[Pipeline API Error]:", e.message);
    return res.status(200).json({ success: false, error: e.message });
  }
}
