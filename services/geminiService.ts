
import { GoogleGenAI } from "@google/genai";
import { Buffer } from 'buffer';

const textModelId = "gemini-3-pro-preview";
const videoModelId = "veo-3.1-fast-generate-preview";

/**
 * 核心 JSON 生成服務
 */
export const generateJSON = async <T>(
  prompt: string,
  systemInstruction: string,
  responseSchema?: any
): Promise<T> => {
  // 嚴格從環境變數獲取，這在伺服器端是必須的
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API Key 缺失。請於 Vercel 環境變數中設定 API_KEY。");
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
        temperature: 0.1, // 降低隨機性以確保符合 Schema
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Gemini 回傳了空的內容。");
    }

    // 防禦性 JSON 解析
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText) as T;
  } catch (error: any) {
    console.error("[Gemini Text Engine Error]:", error);
    throw new Error(`AI 推理失敗: ${error.message}`);
  }
};

/**
 * Veo 3.1 影片生成服務 (垂直 9:16)
 */
export const generateVideo = async (prompt: string): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("影片生成核心缺失 API_KEY。");
  }

  const ai = new GoogleGenAI({ apiKey });
  const MAX_POLLING_ATTEMPTS = 15; // 約 150 秒

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
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({operation: operation});
      attempts++;
    }

    if (!operation.done) {
        throw new Error("影片渲染超時，伺服器已釋放連線。");
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) {
      throw new Error("Veo 渲染引擎未回傳有效的影片 URI。");
    }

    const response = await fetch(`${downloadLink}&key=${apiKey}`);
    if (!response.ok) throw new Error("無法從渲染中心下載影片數據。");

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    
    return `data:video/mp4;base64,${base64}`;

  } catch (error: any) {
    console.error("[Veo Engine Error]:", error);
    throw new Error(`影片製作失敗: ${error.message}`);
  }
};
