import { GoogleGenAI } from "@google/genai";
import { Buffer } from 'buffer';

// Safe access to process.env to prevent browser crashes if this file is bundled
const getEnv = (key: string) => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return '';
};

const textModelId = "gemini-2.5-flash";
const videoModelId = "veo-3.1-fast-generate-preview";

export const generateJSON = async <T>(
  prompt: string,
  systemInstruction: string,
  responseSchema?: any
): Promise<T> => {
  const apiKey = getEnv('API_KEY');
  if (!apiKey) {
    throw new Error("Server Error: API_KEY is missing. Please check Vercel environment variables.");
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
  const apiKey = getEnv('API_KEY');
  if (!apiKey) {
    throw new Error("CRITICAL: API_KEY is missing. Veo requires a valid API Key.");
  }

  const ai = new GoogleGenAI({ apiKey });

  console.log(`[Veo] Starting generation. Model: ${videoModelId}`);
  console.log(`[Veo] Key Status: ${apiKey.substring(0, 4)}... (Check permissions & billing)`);

  // Vercel Hobby limits functions to 10s (sometimes 60s). Veo takes longer.
  // We add a safety timeout to fail gracefully instead of hard crashing the function.
  const TIMEOUT_MS = 55000; // 55 seconds safety margin

  const generatePromise = async () => {
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

      console.log("[Veo] Operation started. Polling for completion...");

      // Polling loop
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({operation: operation});
        console.log(`[Veo] Polling state: ${operation.metadata?.state}`);
        
        if (operation.error) {
             throw new Error(`Veo Operation Error: ${JSON.stringify(operation.error)}`);
        }
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!downloadLink) {
        throw new Error("Veo completed but returned NO video URI. The output might have been blocked by safety filters.");
      }

      console.log("[Veo] Generation complete. Fetching video bytes...");

      // Fetch the raw MP4 bytes using the API Key
      const response = await fetch(`${downloadLink}&key=${apiKey}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to download video bytes. Status: ${response.status}. Details: ${errorText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      
      // Server-side buffer handling
      let base64 = '';
      if (typeof Buffer !== 'undefined') {
          base64 = Buffer.from(arrayBuffer).toString('base64');
      } else {
          throw new Error("Environment does not support Buffer (Client-side execution blocked).");
      }
      
      return `data:video/mp4;base64,${base64}`;

    } catch (error: any) {
      console.error("Gemini API Error (Video):", error);
      // Propagate the full error message
      throw new Error(`Veo API Failure: ${error.message || JSON.stringify(error)}`);
    }
  };

  // Race between Generation and Timeout
  return Promise.race([
    generatePromise(),
    new Promise<string>((_, reject) => 
        setTimeout(() => reject(new Error("Video Generation Timed Out (Vercel limit reached). Check logs.")), TIMEOUT_MS)
    )
  ]);
};