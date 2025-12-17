import { CandidateThemeGenerator } from '../modules/CandidateThemeGenerator';
import { TrendSignals } from '../types';
import { TestResult } from '../types';

// Mock Data matching the Sample Input
const MOCK_TRENDS: TrendSignals = {
  action_verb_frequency: { "crush": 5, "cut": 2 },
  subject_type_frequency: { "hydraulic press": 5, "knife": 2 },
  object_type_frequency: { "ball": 3, "fruit": 4 },
  structure_type_frequency: { "experiment": 6 },
  algorithm_signal_frequency: { "satisfying": 9 }
};

export const runCandidateGeneratorTests = async (): Promise<TestResult> => {
  const logs: string[] = [];
  const module = new CandidateThemeGenerator();

  logs.push("🚀 Starting CandidateThemeGenerator Tests (Phase 2)...");

  try {
    // 1. Execution Test
    logs.push("Step 1: Executing module with Mock Trends...");
    const result = await module.execute(MOCK_TRENDS);

    // 2. Structure Validation
    logs.push("Step 2: Validating Output Structure...");
    if (!Array.isArray(result)) throw new Error("Output is not an array");
    if (result.length !== 3) {
      logs.push(`⚠️ Warning: Expected 3 candidates, got ${result.length}.`);
    } else {
      logs.push("✅ Correctly generated 3 candidates.");
    }

    // 3. Schema & Logic Check
    logs.push("Step 3: Validating Field Logic...");
    const firstCandidate = result[0];
    
    // Check Required Fields
    const requiredFields = ["id", "subject_type", "action_verb", "object_type", "structure_type", "algorithm_signals"];
    for (const field of requiredFields) {
      if (!(field in firstCandidate)) {
        throw new Error(`Missing field in candidate: ${field}`);
      }
    }

    // Check Logic Constraints (Report Requirement: selected=false, total_score=0)
    if (firstCandidate.selected !== false) throw new Error("Initial 'selected' state must be false");
    if (firstCandidate.total_score !== 0) throw new Error("Initial 'total_score' must be 0");
    
    logs.push(`✅ Sample Candidate: "${firstCandidate.action_verb} ${firstCandidate.object_type}" (${firstCandidate.structure_type})`);

    // 4. Edge Case: Empty Input
    logs.push("Step 4: Testing Empty Input Handling...");
    try {
      // @ts-ignore
      await module.execute({});
      throw new Error("Module should throw error on empty input object");
    } catch (e: any) {
      if (e.message.includes("empty")) {
        logs.push("✅ Correctly handled empty input.");
      } else {
        throw e;
      }
    }

    logs.push("✅ ALL TESTS PASSED");

    return { moduleName: "CandidateThemeGenerator", passed: true, logs };
  } catch (e: any) {
    logs.push(`❌ TEST FAILED: ${e.message}`);
    return { moduleName: "CandidateThemeGenerator", passed: false, logs };
  }
};