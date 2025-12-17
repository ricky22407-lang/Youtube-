import { CandidateTheme, PromptOutput, IModule } from '../types';
import { generateJSON } from '../services/geminiService';
import { SYSTEM_INSTRUCTIONS } from '../constants';
import { Type } from '@google/genai';

/**
 * Phase 4: Prompt Composer
 * 
 * Goal: Generate production assets (Prompt, Title, Description) for the selected candidate.
 * Input: Selected CandidateTheme
 * Output: PromptOutput (Text assets + Reference)
 */
export class PromptComposer implements IModule<CandidateTheme, PromptOutput> {
  name = "Prompt Composer";
  description = "Generates the final video production prompt, title, and description.";

  async execute(input: CandidateTheme): Promise<PromptOutput> {
    if (!input.selected) {
      throw new Error("Input candidate must be selected (selected: true).");
    }

    const prompt = `
      Create video production assets for this selected concept:
      ${JSON.stringify(input, null, 2)}
      
      Requirements:
      1. 'prompt': A detailed, highly visual prompt suitable for an AI Video Generator (like Veo or Sora). Include lighting, camera angle, and texture details.
      2. 'title_template': A viral, click-baity YouTube Shorts title. Use emojis.
      3. 'description_template': A short description with 3-5 relevant hashtags based on the algorithm signals.
      4. 'candidate_id': Must match the input ID.
    `;

    // We do NOT ask the AI to hallucinate the candidate_reference object back.
    // We will attach it manually to ensure data integrity.
    const schema = {
      type: Type.OBJECT,
      properties: {
        candidate_id: { type: Type.STRING },
        prompt: { type: Type.STRING },
        title_template: { type: Type.STRING },
        description_template: { type: Type.STRING },
      },
      required: ["candidate_id", "prompt", "title_template", "description_template"]
    };

    try {
      // 1. Generate text assets
      const partialOutput = await generateJSON<Omit<PromptOutput, 'candidate_reference'>>(
        prompt, 
        SYSTEM_INSTRUCTIONS.PROMPT_COMPOSER, 
        schema
      );

      // 2. Attach the original reference object (Safety & Integrity)
      const finalOutput: PromptOutput = {
        ...partialOutput,
        candidate_reference: input
      };

      return finalOutput;

    } catch (error) {
      console.error("PromptComposer Execution Failed:", error);
      throw error;
    }
  }
}