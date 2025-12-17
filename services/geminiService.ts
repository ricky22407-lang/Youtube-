import { GoogleGenAI } from "@google/genai";
import { Buffer } from 'buffer';

// Safe access to process.env to prevent browser crashes if this file is bundled
const getEnv = (key: string) => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return '';
};

const API_KEY = getEnv('API_KEY');

// Initialize conditionally to allow file to be imported without crashing
const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

const textModelId = "gemini-2.5-flash";
const videoModelId = "veo-3.1-fast-generate-preview";

export const generateJSON = async <T>(
  prompt: string,
  systemInstruction: string,
  responseSchema?: any
): Promise<T> => {
  if (!ai || !API_KEY) {
    throw new Error("Server Error: API_KEY is missing. Please check Vercel environment variables.");
  }

  try {
    const response = await ai.models.generateContent({
      model: textModelId,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.2, 
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("No text returned from Gemini.");
    }

    return JSON.parse(text) as T;
  } catch (error: any) {
    console.error("Gemini API Error (Text):", error);
    throw new Error(`Text Gen Failed: ${error.message}`);
  }
};

export const generateVideo = async (prompt: string): Promise<string> => {
  if (!ai || !API_KEY) {
    throw new Error("Server Error: API_KEY is missing.");
  }

  // Vercel Hobby limits functions to 10s (sometimes 60s). Veo takes longer.
  // We add a safety timeout to fail gracefully instead of hard crashing the function.
  const TIMEOUT_MS = 55000; // 55 seconds safety margin

  const generatePromise = async () => {
    try {
      console.log("Starting Veo generation (Server-Side)...");
      let operation = await ai.models.generateVideos({
        model: videoModelId,
        prompt: prompt,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '9:16'
        }
      });

      // Polling loop
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({operation: operation});
        console.log("Polling status:", operation.metadata?.state);
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!downloadLink) {
        throw new Error("Video generation completed but no URI returned.");
      }

      // Fetch the raw MP4 bytes using the API Key
      const response = await fetch(`${downloadLink}&key=${API_KEY}`);
      if (!response.ok) {
        throw new Error(`Failed to download video bytes: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      
      // Server-side buffer handling
      let base64 = '';
      if (typeof Buffer !== 'undefined') {
          base64 = Buffer.from(arrayBuffer).toString('base64');
      } else {
          // Fallback or Error
          throw new Error("Environment does not support Buffer (Client-side execution blocked).");
      }
      
      return `data:video/mp4;base64,${base64}`;

    } catch (error: any) {
      console.error("Gemini API Error (Video):", error);
      throw error;
    }
  };

  // Race between Generation and Timeout
  return Promise.race([
    generatePromise(),
    new Promise<string>((_, reject) => 
        setTimeout(() => reject(new Error("Video Generation Timed Out (Vercel limit reached).")), TIMEOUT_MS)
    )
  ]);
};