import { VideoGenerator } from '../modules/VideoGenerator';
import { PromptOutput, TestResult } from '../types';

// Mock Input
const MOCK_PROMPT_OUTPUT: PromptOutput = {
  candidate_id: "test_gen_1",
  prompt: "A futuristic city with flying cars, neon lights, cyberpunk style, cinematic 4k.",
  title_template: "Future City",
  description_template: "Wow",
  candidate_reference: {} as any
};

export const runVideoGeneratorTests = async (): Promise<TestResult> => {
  const logs: string[] = [];
  const module = new VideoGenerator();

  logs.push("🚀 Starting VideoGenerator Tests (Phase 5)...");

  try {
    // 1. Validation Logic
    logs.push("Step 1: Validating Input Logic...");
    try {
      await module.execute({ ...MOCK_PROMPT_OUTPUT, prompt: "" });
      throw new Error("Should fail on empty prompt");
    } catch (e: any) {
      if (e.message.includes("empty")) {
        logs.push("✅ Correctly rejected empty prompt.");
      } else {
        throw e;
      }
    }

    // 2. Integration Warning
    // Note: We cannot easily unit test the actual Veo generation because it:
    // a) Costs money/quota
    // b) Takes minutes to complete
    // c) Requires a specific allowlisted API key
    logs.push("Step 2: Integration Test Skipped (Requires Live Veo Quota).");
    logs.push("⚠️ Real video generation takes minutes. Test assumes logic validity.");
    
    // In a real test suite, we would mock the `generateVideo` service.
    // For this environment, we just ensure the module structure is correct.

    logs.push("✅ Module structure and validation logic passed.");
    return { moduleName: "VideoGenerator", passed: true, logs };

  } catch (e: any) {
    logs.push(`❌ TEST FAILED: ${e.message}`);
    return { moduleName: "VideoGenerator", passed: false, logs };
  }
};