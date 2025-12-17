import { TrendSignals, CandidateTheme, IModule } from '../types';
import { generateJSON } from '../services/geminiService';
import { SYSTEM_INSTRUCTIONS } from '../constants';
import { Type } from '@google/genai';

/**
 * Phase 2: Candidate Theme Generator
 * 
 * Goal: Generate 3 innovative video concepts based on trend analysis.
 * Input: TrendSignals (JSON)
 * Output: CandidateTheme[] (JSON Array)
 */
export class CandidateThemeGenerator implements IModule<TrendSignals, CandidateTheme[]> {
  name = "Candidate Theme Generator";
  description = "Generates video candidates based on extracted trend signals.";

  async execute(input: TrendSignals): Promise<CandidateTheme[]> {
    if (!input || Object.keys(input).length === 0) {
      throw new Error("Input TrendSignals cannot be empty.");
    }

    const prompt = `
      Using the following Trend Signals:
      ${JSON.stringify(input, null, 2)}
      
      Generate exactly 3 potential viral Shorts concepts.
      
      Requirements:
      1. 'id' should be a unique string (e.g., "candidate_1").
      2. 'subject_type', 'action_verb', 'object_type' must be derived from or inspired by the signals.
      3. 'algorithm_signals' should be a list of 3-5 keywords.
      4. 'total_score' MUST be 0.
      5. 'selected' MUST be false.
      6. Provide a brief 'rationale' for why this combo works.
    `;

    const schema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          subject_type: { type: Type.STRING },
          action_verb: { type: Type.STRING },
          object_type: { type: Type.STRING },
          structure_type: { type: Type.STRING },
          algorithm_signals: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING } 
          },
          rationale: { type: Type.STRING },
          total_score: { type: Type.NUMBER },
          selected: { type: Type.BOOLEAN }
        },
        required: [
          "id", 
          "subject_type", 
          "action_verb", 
          "object_type", 
          "structure_type", 
          "algorithm_signals",
          "total_score",
          "selected"
        ]
      }
    };

    try {
      const candidates = await generateJSON<CandidateTheme[]>(prompt, SYSTEM_INSTRUCTIONS.CANDIDATE_GENERATOR, schema);
      
      if (!Array.isArray(candidates) || candidates.length === 0) {
        throw new Error("Model failed to return a valid array of candidates.");
      }

      return candidates;
    } catch (error) {
      console.error("CandidateThemeGenerator Execution Failed:", error);
      throw error;
    }
  }
}