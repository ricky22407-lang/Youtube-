
import { GoogleGenAI } from "@google/genai";
import { Buffer } from 'buffer';

// 改用 Flash 模型以極速完成前置分析
const textModelId = "gemini-3-flash-preview";
const videoModelId = "veo-3.1-fast-generate-preview";

/**
 * 核心 JSON 生成服務
 */
export const generateJSON = async <T>(
  prompt: string,
  systemInstruction: string,
  responseSchema?: any
): Promise<T> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("[CRITICAL] API_KEY environment variable is UNDEFINED.");
    throw new Error("系統偵測不到 API_KEY。請檢查 Vercel Dashboard 並確保已完成 Redeploy。");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: textModelId,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.1,
      },
    });

    const text = response.text;
    if (!text) throw new Error("Gemini 回傳內容為空。");

    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText) as T;
  } catch (error: any) {
    console.error("[Gemini Service Error]:", error);
    throw new Error(`AI 推理階段故障: ${error.message}`);
  }
};

/**
 * Veo 3.1 影片生成服務 (垂直 9:16)
 */
export const generateVideo = async (prompt: string): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("影片引擎缺失 API_KEY。");

  const ai = new GoogleGenAI({ apiKey });
  
  // 縮短內部輪詢間隔，並在達到 Vercel 超時邊緣前強行拋出錯誤
  const MAX_POLLING_ATTEMPTS = 12; // 12 * 5s = 60s

  try {
    let operation = await ai.models.generateVideos({
      model: videoModelId,
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '9:16'
      }
    });

    let attempts = 0;
    while (!operation.done && attempts < MAX_POLLING_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      operation = await ai.operations.getVideosOperation({operation: operation});
      attempts++;
    }

    if (!operation.done) {
        throw new Error("Veo 渲染任務超出了伺服器單次請求時限。請重試。");
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error("Veo 引擎未能生成有效的影片下載點。");

    const response = await fetch(`${downloadLink}&key=${apiKey}`);
    if (!response.ok) throw new Error("從 Google 存儲下載影片位元組失敗。");

    const arrayBuffer = await response.arrayBuffer();
    return `data:video/mp4;base64,${Buffer.from(arrayBuffer).toString('base64')}`;

  } catch (error: any) {
    console.error("[Veo Engine Error]:", error);
    throw new Error(`Veo 渲染失敗: ${error.message}`);
  }
};
